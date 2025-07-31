// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./EscrowFactory.sol";

/**
 * @title Simple Limit Order Protocol
 * @notice A simplified limit order protocol that integrates with EscrowFactory
 * for cross-chain swaps. Orders are created off-chain and filled on-chain.
 * Tracks segments instead of amounts for partial fills.
 */
contract SimpleLimitOrderProtocol is ReentrancyGuard, Ownable {

    // Order structure (for filled orders)
    struct FilledOrder {
        bytes32 orderHash;     // Hash of the original order
        address maker;         // Order creator
        address recipient;     // Cross-chain recipient
        address escrowAddress; // Address of created escrow
        uint256 partIndex;     // Part index that was filled
        uint16 totalParts;     // Total parts for the order
        bool isActive;         // Whether this segment is still active
    }

    // EscrowFactory interface
    HashLockedEscrowFactory public immutable escrowFactory;
    
    // Order tracking
    mapping(bytes32 => FilledOrder[]) public filledOrders; // orderHash => array of filled parts
    mapping(bytes32 => mapping(uint256 => bool)) public partsFilled; // orderHash => partIndex => filled
    mapping(bytes32 => uint256) public filledSegmentsCount; // orderHash => filled segments count
    mapping(address => bytes32[]) public userFilledOrders;

    // Events
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed taker,
        uint256 partIndex,
        address escrowAddress
    );
    
    event OrderCancelled(
        bytes32 indexed orderHash,
        address indexed maker,
        uint256 partIndex
    );
    
    event EscrowCreated(
        bytes32 indexed orderHash,
        address indexed escrowAddress,
        bytes32 hashedSecret,
        uint256 partIndex
    );

    // Errors
    error OrderNotFound();
    error PartAlreadyUsed();
    error InvalidSequentialOrder();
    error InvalidTimeWindows();
    error OnlyMaker();

    constructor(address _escrowFactory, address initialOwner) Ownable(initialOwner) {
        escrowFactory = HashLockedEscrowFactory(_escrowFactory);
    }

    /**
     * @notice Fill an order by creating an escrow
     * @param orderHash Hash of the order to fill
     * @param maker Order creator address
     * @param recipient Cross-chain recipient address
     * @param tokenAmount Amount of WETH to transfer
     * @param hashedSecret Hash of the secret for escrow
     * @param withdrawalStart Start time for withdrawal
     * @param publicWithdrawalStart Start time for public withdrawal
     * @param cancellationStart Start time for cancellation
     * @param publicCancellationStart Start time for public cancellation
     * @param partIndex Part index for partial fills (0 for complete fill)
     * @param totalParts Total parts for the order (1 for complete fill)
     */
    function fillOrder(
        bytes32 orderHash,
        address maker,
        address recipient,
        uint256 tokenAmount,
        bytes32 hashedSecret,
        uint256 withdrawalStart,
        uint256 publicWithdrawalStart,
        uint256 cancellationStart,
        uint256 publicCancellationStart,
        uint256 partIndex,
        uint16 totalParts
    ) external nonReentrant payable returns (address escrowAddress) {
        require(totalParts > 0, "Total parts must be > 0");
        require(partIndex < totalParts, "Invalid part index");
        require(recipient != address(0), "Invalid recipient");
        require(maker != address(0), "Invalid maker");
        require(tokenAmount > 0, "Token amount must be > 0");

        // Check if this part is already filled
        require(!partsFilled[orderHash][partIndex], "Part already filled");

        bool isPartialFill = totalParts > 1;

        // Create escrow for cross-chain transfer
        escrowAddress = _createEscrow(
            orderHash,
            maker,
            recipient,
            tokenAmount,
            hashedSecret,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart,
            publicCancellationStart,
            partIndex,
            totalParts
        );

        // Track the filled order part
        filledOrders[orderHash].push(FilledOrder({
            orderHash: orderHash,
            maker: maker,
            recipient: recipient,
            escrowAddress: escrowAddress,
            partIndex: partIndex,
            totalParts: totalParts,
            isActive: true
        }));

        // Mark this part as filled
        partsFilled[orderHash][partIndex] = true;
        filledSegmentsCount[orderHash]++;

        // Add to user's orders if first fill
        if (filledSegmentsCount[orderHash] == 1) {
            userFilledOrders[maker].push(orderHash);
        }

        emit OrderFilled(orderHash, msg.sender, partIndex, escrowAddress);
        emit EscrowCreated(orderHash, escrowAddress, hashedSecret, partIndex);
    }

    /**
     * @notice Cancel a specific order part by calling the escrow's cancel function
     * @param orderHash Hash of the order to cancel
     * @param partIndex Part index to cancel
     */
    function cancelOrder(bytes32 orderHash, uint256 partIndex) external {
        require(partsFilled[orderHash][partIndex], "Part not filled");
        
        FilledOrder[] storage orderParts = filledOrders[orderHash];
        bool found = false;
        uint targetIndex;
        
        // Find the specific part
        for (uint i = 0; i < orderParts.length; i++) {
            if (orderParts[i].partIndex == partIndex) {
                targetIndex = i;
                found = true;
                break;
            }
        }
        
        require(found, "Part not found");
        require(orderParts[targetIndex].isActive, "Part already cancelled");
        require(orderParts[targetIndex].maker == msg.sender, "Only maker can cancel");

        // Get the escrow contract and call its cancel function
        SourceEscrow escrow = SourceEscrow(payable(orderParts[targetIndex].escrowAddress));
        escrow.cancel();

        orderParts[targetIndex].isActive = false;

        emit OrderCancelled(orderHash, msg.sender, partIndex);
    }

    /**
     * @notice Get all filled order parts
     * @param orderHash Hash of the order
     * @return filledOrderParts Array of filled order parts
     */
    function getOrder(bytes32 orderHash) external view returns (FilledOrder[] memory filledOrderParts) {
        return filledOrders[orderHash];
    }

    /**
     * @notice Get specific filled order part
     * @param orderHash Hash of the order
     * @param partIndex Part index to get
     * @return filledOrder Filled order part details
     */
    function getOrderPart(bytes32 orderHash, uint256 partIndex) external view returns (FilledOrder memory filledOrder) {
        require(partsFilled[orderHash][partIndex], "Part not filled");
        
        FilledOrder[] storage orderParts = filledOrders[orderHash];
        for (uint i = 0; i < orderParts.length; i++) {
            if (orderParts[i].partIndex == partIndex) {
                return orderParts[i];
            }
        }
        revert("Part not found");
    }

    /**
     * @notice Get remaining segments for an order
     * @param orderHash Hash of the order
     * @param totalParts Total parts for the order (needed since we don't store it globally)
     * @return remainingSegments Number of remaining segments to fill
     */
    function getRemainingSegments(bytes32 orderHash, uint16 totalParts) external view returns (uint256 remainingSegments) {
        if (totalParts <= 1) {
            // Complete fill - check if filled
            return partsFilled[orderHash][0] ? 0 : 1;
        } else {
            // Partial fill - calculate remaining segments
            return totalParts - filledSegmentsCount[orderHash];
        }
    }

    /**
     * @notice Get all filled orders for a user
     * @param user User address
     * @return orderHashes Array of order hashes
     */
    function getUserFilledOrders(address user) external view returns (bytes32[] memory orderHashes) {
        return userFilledOrders[user];
    }

    /**
     * @notice Check if a specific part index is available for partial fill
     * @param orderHash Hash of the order
     * @param partIndex Part index to check
     * @return isAvailable Whether the part index is available (not filled)
     */
    function isPartAvailable(bytes32 orderHash, uint256 partIndex) external view returns (bool isAvailable) {
        return !partsFilled[orderHash][partIndex];
    }

    /**
     * @notice Get all available part indices for an order
     * @param orderHash Hash of the order
     * @param totalParts Total parts for the order
     * @return availableIndices Array of available part indices
     */
    function getAvailablePartIndices(bytes32 orderHash, uint16 totalParts) external view returns (uint256[] memory availableIndices) {
        uint256 availableCount = 0;
        
        // First pass: count available parts
        for (uint256 i = 0; i < totalParts; i++) {
            if (!partsFilled[orderHash][i]) {
                availableCount++;
            }
        }
        
        // Second pass: populate array
        availableIndices = new uint256[](availableCount);
        uint256 index = 0;
        for (uint256 i = 0; i < totalParts; i++) {
            if (!partsFilled[orderHash][i]) {
                availableIndices[index] = i;
                index++;
            }
        }
    }

    /**
     * @notice Create escrow for cross-chain transfer
     * @param orderHash Hash of the order
     * @param maker Order creator
     * @param recipient Cross-chain recipient
     * @param tokenAmount Amount of WETH to transfer
     * @param hashedSecret Hash of the secret
     * @param withdrawalStart Start time for withdrawal
     * @param publicWithdrawalStart Start time for public withdrawal
     * @param cancellationStart Start time for cancellation
     * @param publicCancellationStart Start time for public cancellation
     * @param partIndex Part index for partial fills
     * @param totalParts Total parts for the order
     * @return escrowAddress Address of created escrow
     */
    function _createEscrow(
        bytes32 orderHash,
        address maker,
        address recipient,
        uint256 tokenAmount,
        bytes32 hashedSecret,
        uint256 withdrawalStart,
        uint256 publicWithdrawalStart,
        uint256 cancellationStart,
        uint256 publicCancellationStart,
        uint256 partIndex,
        uint16 totalParts
    ) private returns (address escrowAddress) {
        // Validate time windows
        require(
            publicWithdrawalStart > withdrawalStart &&
            cancellationStart > publicWithdrawalStart &&
            publicCancellationStart > cancellationStart,
            "Invalid time windows"
        );

        // Create escrow using the factory
        escrowFactory.createSrcEscrow{value: msg.value}(
            hashedSecret,
            recipient,
            maker, // buyer (maker)
            tokenAmount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart,
            publicCancellationStart,
            partIndex,
            totalParts
        );

        // Get the created escrow address
        address[] memory userEscrows = escrowFactory.getUserEscrows(maker);
        escrowAddress = userEscrows[userEscrows.length - 1]; // Latest escrow
    }

    /**
     * @notice Emergency function to rescue ETH stuck in contract
     * @param to Recipient address
     */
    function rescueETH(address to) external onlyOwner {
        (bool success, ) = to.call{value: address(this).balance}("");
        require(success, "ETH transfer failed");
    }

    receive() external payable {}
} 