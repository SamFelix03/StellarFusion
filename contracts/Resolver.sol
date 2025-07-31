// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./LimitOrderProtocol.sol";
import "./EscrowFactory.sol";

/**
 * @title Simple Resolver for Cross-Chain Swaps
 * @notice Resolver that coordinates between SimpleLimitOrderProtocol and EscrowFactory
 * for cross-chain swap execution. Focuses on order filling and segment tracking.
 */
contract SimpleResolver is Ownable {
    using SafeERC20 for IERC20;

    SimpleLimitOrderProtocol public immutable lop;
    HashLockedEscrowFactory public immutable escrowFactory;

    event CrossChainSwapInitiated(
        bytes32 indexed orderHash,
        address indexed escrowAddress,
        bytes32 hashedSecret,
        uint256 partIndex
    );

    event CrossChainSwapCompleted(
        bytes32 indexed orderHash,
        address indexed escrowAddress,
        bytes32 secret,
        uint256 partIndex
    );

    constructor(
        address _lop,
        address _escrowFactory,
        address initialOwner
    ) Ownable(initialOwner) {
        lop = SimpleLimitOrderProtocol(payable(_lop));
        escrowFactory = HashLockedEscrowFactory(_escrowFactory);
    }

    /**
     * @notice Execute a cross-chain swap by filling an order and creating escrow
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
    function executeCrossChainSwap(
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
    ) external onlyOwner payable returns (address escrowAddress) {
        // Fill the order through LOP (this creates the escrow)
        escrowAddress = lop.fillOrder{value: msg.value}(
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

        emit CrossChainSwapInitiated(orderHash, escrowAddress, hashedSecret, partIndex);
    }

    /**
     * @notice Complete a cross-chain swap by withdrawing from escrow
     * @param escrowAddress Address of the escrow contract
     * @param secret Secret to unlock the escrow
     * @param partIndex Part index for tracking (0 for complete fill)
     * @param merkleProof Merkle proof for partial fills (empty array for complete fills)
     */
    function completeCrossChainSwap(
        address escrowAddress, 
        bytes32 secret,
        uint256 partIndex,
        bytes32[] calldata merkleProof
    ) external onlyOwner {
        // Get the escrow contract
        SourceEscrow escrow = SourceEscrow(payable(escrowAddress));
        
        // Check if this is a partial fill escrow
        if (escrow.isPartialFill()) {
            // For partial fills, use withdrawWithProof with merkle proof
            require(merkleProof.length > 0, "Merkle proof required for partial fills");
            escrow.withdrawWithProof(abi.encodePacked(secret), merkleProof);
        } else {
            // For complete fills, use regular withdraw
            escrow.withdraw(abi.encodePacked(secret));
        }
        
        emit CrossChainSwapCompleted(
            bytes32(0), // We don't track orderHash in this simple version
            escrowAddress,
            secret,
            partIndex
        );
    }

    /**
     * @notice Withdraw from source escrow after finality lock passes
     * @param escrowAddress Address of the source escrow contract
     * @param secret Secret to unlock the escrow
     * @param partIndex Part index for tracking (0 for complete fill)
     * @param merkleProof Merkle proof for partial fills (empty array for complete fills)
     */
    function withdrawFromSourceEscrow(
        address escrowAddress, 
        bytes32 secret,
        uint256 partIndex,
        bytes32[] calldata merkleProof
    ) external {
        // Get the escrow contract
        SourceEscrow escrow = SourceEscrow(payable(escrowAddress));
        
        // Check if this is a partial fill escrow
        if (escrow.isPartialFill()) {
            // For partial fills, use withdrawWithProof with merkle proof
            require(merkleProof.length > 0, "Merkle proof required for partial fills");
            escrow.withdrawWithProof(abi.encodePacked(secret), merkleProof);
        } else {
            // For complete fills, use regular withdraw
            escrow.withdraw(abi.encodePacked(secret));
        }
        
        emit CrossChainSwapCompleted(
            bytes32(0), // We don't track orderHash in this simple version
            escrowAddress,
            secret,
            partIndex
        );
    }

    /**
     * @notice Withdraw from destination escrow after finality lock passes
     * @param escrowAddress Address of the destination escrow contract
     * @param secret Secret to unlock the escrow
     * @param partIndex Part index for tracking (0 for complete fill)
     * @param merkleProof Merkle proof for partial fills (empty array for complete fills)
     */
    function withdrawFromDestinationEscrow(
        address escrowAddress, 
        bytes32 secret,
        uint256 partIndex,
        bytes32[] calldata merkleProof
    ) external {
        // Get the escrow contract
        DestinationEscrow escrow = DestinationEscrow(payable(escrowAddress));
        
        // Check if this is a partial fill escrow
        if (escrow.isPartialFill()) {
            // For partial fills, use withdrawWithProof with merkle proof
            require(merkleProof.length > 0, "Merkle proof required for partial fills");
            escrow.withdrawWithProof(abi.encodePacked(secret), merkleProof);
        } else {
            // For complete fills, use regular withdraw
            escrow.withdraw(abi.encodePacked(secret));
        }
        
        emit CrossChainSwapCompleted(
            bytes32(0), // We don't track orderHash in this simple version
            escrowAddress,
            secret,
            partIndex
        );
    }

    /**
     * @notice Create destination escrow on target chain
     * @param hashedSecret Hash of the secret
     * @param recipient Recipient address
     * @param amount Amount to transfer
     * @param withdrawalStart Start time for withdrawal
     * @param publicWithdrawalStart Start time for public withdrawal
     * @param cancellationStart Start time for cancellation
     * @param partIndex Part index for partial fills (0 for complete fill)
     * @param totalParts Total parts for the order (1 for complete fill)
     */
    function createDestinationEscrow(
        bytes32 hashedSecret,
        address recipient,
        uint256 amount,
        uint256 withdrawalStart,
        uint256 publicWithdrawalStart,
        uint256 cancellationStart,
        uint256 partIndex,
        uint16 totalParts
    ) external onlyOwner payable returns (address escrowAddress) {
        // Create destination escrow
        escrowFactory.createDstEscrow{value: escrowFactory.DEPOSIT_AMOUNT()}(
            hashedSecret,
            recipient,
            amount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart,
            partIndex,
            totalParts
        );

        // Get the created escrow address
        address[] memory userEscrows = escrowFactory.getUserEscrows(msg.sender);
        escrowAddress = userEscrows[userEscrows.length - 1];
    }

    /**
     * @notice Cancel a specific order part (only by owner)
     * @param orderHash Hash of the order to cancel
     * @param partIndex Part index to cancel
     */
    function cancelOrder(bytes32 orderHash, uint256 partIndex) external onlyOwner {
        lop.cancelOrder(orderHash, partIndex);
    }

    /**
     * @notice Get all filled order parts
     * @param orderHash Hash of the order
     * @return filledOrderParts Array of filled order parts
     */
    function getOrder(bytes32 orderHash) external view returns (SimpleLimitOrderProtocol.FilledOrder[] memory filledOrderParts) {
        return lop.getOrder(orderHash);
    }

    /**
     * @notice Get specific filled order part
     * @param orderHash Hash of the order
     * @param partIndex Part index to get
     * @return filledOrder Filled order part details
     */
    function getOrderPart(bytes32 orderHash, uint256 partIndex) external view returns (SimpleLimitOrderProtocol.FilledOrder memory filledOrder) {
        return lop.getOrderPart(orderHash, partIndex);
    }

    /**
     * @notice Get remaining segments for an order
     * @param orderHash Hash of the order
     * @param totalParts Total parts for the order
     * @return remainingSegments Number of remaining segments to fill
     */
    function getRemainingSegments(bytes32 orderHash, uint16 totalParts) external view returns (uint256 remainingSegments) {
        return lop.getRemainingSegments(orderHash, totalParts);
    }

    /**
     * @notice Check if a specific part index is available for partial fill
     * @param orderHash Hash of the order
     * @param partIndex Part index to check
     * @return isAvailable Whether the part index is available
     */
    function isPartAvailable(bytes32 orderHash, uint256 partIndex) external view returns (bool isAvailable) {
        return lop.isPartAvailable(orderHash, partIndex);
    }

    /**
     * @notice Get all available part indices for an order
     * @param orderHash Hash of the order
     * @param totalParts Total parts for the order
     * @return availableIndices Array of available part indices
     */
    function getAvailablePartIndices(bytes32 orderHash, uint16 totalParts) external view returns (uint256[] memory availableIndices) {
        return lop.getAvailablePartIndices(orderHash, totalParts);
    }

    /**
     * @notice Get all filled orders for a user
     * @param user User address
     * @return orderHashes Array of order hashes
     */
    function getUserFilledOrders(address user) external view returns (bytes32[] memory orderHashes) {
        return lop.getUserFilledOrders(user);
    }

    /**
     * @notice Emergency function to rescue tokens stuck in contract
     * @param token Token address to rescue
     * @param amount Amount to rescue
     * @param to Recipient address
     */
    function rescueTokens(address token, uint256 amount, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
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