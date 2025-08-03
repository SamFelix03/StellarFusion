// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Merkle proof verification library
library MerkleProof {
    function verify(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                // Hash(current computed hash + current element of the proof)
                computedHash = sha256(abi.encodePacked(computedHash, proofElement));
            } else {
                // Hash(current element of the proof + current computed hash)
                computedHash = sha256(abi.encodePacked(proofElement, computedHash));
            }
        }

        // Check if the computed hash (root) is equal to the provided root
        return computedHash == root;
    }
}

// Helper library for partial fill support
library PartialFillHelper {
    function generateLeaf(uint256 index, bytes32 secretHash) internal pure returns (bytes32) {
        // Pack index (8 bytes) + secret hash (32 bytes) and hash with SHA256
        bytes memory packed = abi.encodePacked(uint64(index), secretHash);
        return sha256(packed);
    }
    
    function isPartialFillOrder(bytes32 hashLock) internal pure returns (bool) {
        // For simplicity, we'll check this based on totalParts parameter instead
        // This function can be removed or simplified
        return true; // We'll determine this from function parameters
    }
    
    function getPartsCount(bytes32 hashLock) internal pure returns (uint16) {
        // This will be passed as a parameter instead of embedded in hashLock
        return 0; // Placeholder - not used anymore
    }
}

contract HashLockedEscrowFactory is ReentrancyGuard {
    uint256 public constant DEPOSIT_AMOUNT = 0.001 ether;
    address public immutable WETH;
    
    mapping(address => address[]) public userEscrows;
    mapping(address => bool) public isEscrowContract;
    
    // Partial fill tracking
    mapping(bytes32 => mapping(uint256 => bool)) public partialFillsUsed; // hashLock => index => used
    mapping(bytes32 => uint256) public partialFillsCount; // hashLock => filled count

    event SrcEscrowCreated(
        address indexed creator,
        address indexed recipient,
        address escrowAddress,
        bytes32 indexed hashedSecret,
        uint256 tokenAmount,
        uint256 withdrawalStart,
        uint256 publicWithdrawalStart,
        uint256 cancellationStart,
        uint256 publicCancellationStart
    );
    
    event DstEscrowCreated(
        address indexed creator,
        address indexed recipient,
        address escrowAddress,
        bytes32 indexed hashedSecret,
        uint256 tokenAmount,
        uint256 withdrawalStart,
        uint256 publicWithdrawalStart,
        uint256 cancellationStart
    );
    
    event PartialFillExecuted(
        bytes32 indexed hashLock,
        uint256 indexed partIndex,
        address indexed executor,
        uint256 amount
    );
    
    event PartialFillCompleted(
        bytes32 indexed hashLock,
        uint256 totalParts,
        uint256 totalAmount
    );

    constructor(address wethAddress) {
        WETH = wethAddress;
    }
    

    function createSrcEscrow(
        bytes32 hashedSecret,
        address recipient,
        address buyer,  // Add buyer parameter
        uint256 tokenAmount,
        uint256 withdrawalStart,
        uint256 publicWithdrawalStart,
        uint256 cancellationStart,
        uint256 publicCancellationStart,
        uint256 partIndex,      // Optional: 0 for complete fill, >0 for partial fill
        uint16 totalParts       // Optional: 1 for complete fill, >1 for partial fill  
    ) external payable nonReentrant {
        require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
        require(tokenAmount > 0, "Token amount must be > 0");
        require(recipient != address(0), "Invalid recipient");
        require(buyer != address(0), "Invalid buyer");
        require(
            publicWithdrawalStart > withdrawalStart &&
            cancellationStart > publicWithdrawalStart &&
            publicCancellationStart > cancellationStart,
            "Invalid time windows"
        );

        // Check if this is a partial fill or complete fill
        bool isPartialFill = totalParts > 1;
        if (isPartialFill) {
            require(partIndex < totalParts, "Invalid part index");
            require(!partialFillsUsed[hashedSecret][partIndex], "Part already used");
            
            // Mark this part as used and update tracking
            partialFillsUsed[hashedSecret][partIndex] = true;
            partialFillsCount[hashedSecret]++;
        }

        // Create enhanced SourceEscrow that supports both modes
        SourceEscrow escrow = new SourceEscrow{value: msg.value}(
            buyer,  // Use buyer as creator
            recipient,
            hashedSecret,
            WETH,
            tokenAmount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart,
            publicCancellationStart,
            partIndex,
            totalParts
        );

        address escrowAddress = address(escrow);
        userEscrows[buyer].push(escrowAddress);  // Use buyer for userEscrows
        isEscrowContract[escrowAddress] = true;

        IERC20(WETH).transferFrom(buyer, escrowAddress, tokenAmount);  // Pull from buyer

        emit SrcEscrowCreated(
            buyer,  // Use buyer as creator
            recipient,
            escrowAddress,
            hashedSecret,
            tokenAmount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart,
            publicCancellationStart
        );
    }

    function createDstEscrow(
        bytes32 hashedSecret,
        address recipient,
        uint256 tokenAmount,
        uint256 withdrawalStart,
        uint256 publicWithdrawalStart,
        uint256 cancellationStart,
        uint256 partIndex,      // Optional: 0 for complete fill, >0 for partial fill
        uint16 totalParts       // Optional: 1 for complete fill, >1 for partial fill
    ) external payable nonReentrant {
        require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
        require(tokenAmount > 0, "Token amount must be > 0");
        require(recipient != address(0), "Invalid recipient");
        require(
            publicWithdrawalStart > withdrawalStart &&
            cancellationStart > publicWithdrawalStart,
            "Invalid time windows"
        );

        // Check if this is a partial fill or complete fill
        bool isPartialFill = totalParts > 1;
        if (isPartialFill) {
            require(partIndex < totalParts, "Invalid part index");
            // Note: For destination escrows, we don't track usage since they're on different chains
            // The merkle proof validation during withdrawal ensures correctness
        }

        // Create enhanced DestinationEscrow that supports both modes
        DestinationEscrow escrow = new DestinationEscrow{value: msg.value}(
            msg.sender,
            recipient,
            hashedSecret,
            WETH,
            tokenAmount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart,
            partIndex,
            totalParts
        );

        address escrowAddress = address(escrow);
        userEscrows[msg.sender].push(escrowAddress);
        isEscrowContract[escrowAddress] = true;

        IERC20(WETH).transferFrom(msg.sender, escrowAddress, tokenAmount);

        emit DstEscrowCreated(
            msg.sender,
            recipient,
            escrowAddress,
            hashedSecret,
            tokenAmount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart
        );
    }

    function getUserEscrows(address user) external view returns (address[] memory) {
        return userEscrows[user];
    }
}

contract SourceEscrow is ReentrancyGuard {
    address public immutable creator;
    address public immutable recipient;
    bytes32 public immutable hashedSecret;
    address public immutable token;
    uint256 public immutable amount;
    uint256 public immutable securityDeposit;
    
    // Partial fill support
    uint256 public immutable partIndex;
    uint16 public immutable totalParts;
    bool public immutable isPartialFill;
    
    // Time lock parameters
    uint256 public immutable withdrawalStart;
    uint256 public immutable publicWithdrawalStart;
    uint256 public immutable cancellationStart;
    uint256 public immutable publicCancellationStart;
    uint256 public constant RESCUE_DELAY = 7 days;

    bool public fundsWithdrawn;
    bool public cancelled;

    event Withdrawal(address indexed caller, bytes secret);
    event FundsTransferred(address indexed to, uint256 amount);
    event SecurityDepositTransferred(address indexed to, uint256 amount);
    event Cancelled(address indexed initiator, uint256 amount);
    event Rescued(address indexed initiator, uint256 amount);

    constructor(
        address _creator,
        address _recipient,
        bytes32 _hashedSecret,
        address _token,
        uint256 _amount,
        uint256 _withdrawalStart,
        uint256 _publicWithdrawalStart,
        uint256 _cancellationStart,
        uint256 _publicCancellationStart,
        uint256 _partIndex,
        uint16 _totalParts
    ) payable {
        creator = _creator;
        recipient = _recipient;
        hashedSecret = _hashedSecret;
        token = _token;
        amount = _amount;
        securityDeposit = msg.value;
        
        // Partial fill support
        partIndex = _partIndex;
        totalParts = _totalParts;
        isPartialFill = _totalParts > 1;
        
        withdrawalStart = _withdrawalStart;
        publicWithdrawalStart = _publicWithdrawalStart;
        cancellationStart = _cancellationStart;
        publicCancellationStart = _publicCancellationStart;
    }

    function withdraw(bytes calldata secret) external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Escrow cancelled");
        require(block.timestamp >= withdrawalStart, "Withdrawal not started");
        require(block.timestamp < cancellationStart, "Withdrawal period ended");
        
        // Caller must be the recipient during private window
        if (block.timestamp < publicWithdrawalStart) {
            require(msg.sender == recipient, "Only recipient in private window");
        }
        
        // Use SHA256 instead of keccak256 for Stellar compatibility
        require(sha256(secret) == hashedSecret, "Invalid secret");

        fundsWithdrawn = true;

        // Unwrap WETH to ETH and send to caller (resolver)
        IWETH(token).withdraw(amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit FundsTransferred(msg.sender, amount);
        
        // Transfer security deposit to caller (resolver)
        (bool depositSuccess, ) = msg.sender.call{value: securityDeposit}("");
        require(depositSuccess, "ETH transfer failed");
        emit SecurityDepositTransferred(msg.sender, securityDeposit);
        
        emit Withdrawal(msg.sender, secret);
    }

    function withdrawWithProof(
        bytes calldata secret,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Escrow cancelled");
        require(block.timestamp >= withdrawalStart, "Withdrawal not started");
        require(block.timestamp < cancellationStart, "Withdrawal period ended");
        require(isPartialFill, "Use withdraw() for complete fills");
        
        // Caller must be the recipient during private window
        if (block.timestamp < publicWithdrawalStart) {
            require(msg.sender == recipient, "Only recipient in private window");
        }
        
        // Use hashedSecret directly as merkle root (no embedded parts count)
        bytes32 merkleRoot = hashedSecret;
        
        // Verify merkle proof
        bytes32 secretHash = sha256(secret);
        bytes32 leaf = PartialFillHelper.generateLeaf(partIndex, secretHash);
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Invalid merkle proof");

        fundsWithdrawn = true;

        // Unwrap WETH to ETH and send to caller (resolver)
        IWETH(token).withdraw(amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit FundsTransferred(msg.sender, amount);
        
        // Transfer security deposit to caller (resolver)
        (bool depositSuccess, ) = msg.sender.call{value: securityDeposit}("");
        require(depositSuccess, "ETH transfer failed");
        emit SecurityDepositTransferred(msg.sender, securityDeposit);
        
        emit Withdrawal(msg.sender, secret);
    }

    function cancel() external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Already cancelled");
        require(block.timestamp >= cancellationStart, "Cancellation not started");
        require(block.timestamp < publicCancellationStart, "Private cancellation ended");
        require(msg.sender == creator, "Only creator can cancel");

        cancelled = true;
        
        // Unwrap WETH to ETH and return to creator
        IWETH(token).withdraw(amount);
        (bool success, ) = creator.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit FundsTransferred(creator, amount);
        
        // Refund security deposit to creator
        (bool depositSuccess, ) = creator.call{value: securityDeposit}("");
        require(depositSuccess, "ETH transfer failed");
        emit SecurityDepositTransferred(creator, securityDeposit);

        emit Cancelled(msg.sender, amount);
    }

    function publicCancel() external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Already cancelled");
        require(block.timestamp >= publicCancellationStart, "Public cancellation not started");

        cancelled = true;
        
        // Unwrap WETH to ETH and return to creator
        IWETH(token).withdraw(amount);
        (bool success, ) = creator.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit FundsTransferred(creator, amount);
        
        // Refund security deposit to creator
        (bool depositSuccess, ) = creator.call{value: securityDeposit}("");
        require(depositSuccess, "ETH transfer failed");
        emit SecurityDepositTransferred(creator, securityDeposit);

        emit Cancelled(msg.sender, amount);
    }

    function rescue() external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Already cancelled");
        require(block.timestamp >= publicCancellationStart + RESCUE_DELAY, "Rescue not available");
        require(msg.sender == recipient, "Only recipient can rescue");

        fundsWithdrawn = true;
        
        // Unwrap WETH to ETH and transfer to recipient
        IWETH(token).withdraw(amount);
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit FundsTransferred(recipient, amount);
        
        // Refund security deposit to creator
        (bool depositSuccess, ) = creator.call{value: securityDeposit}("");
        require(depositSuccess, "ETH transfer failed");
        emit SecurityDepositTransferred(creator, securityDeposit);

        emit Rescued(msg.sender, amount);
    }

    receive() external payable {}
}

contract DestinationEscrow is ReentrancyGuard {
    address public immutable creator;
    address public immutable recipient;
    bytes32 public immutable hashedSecret;
    address public immutable token;
    uint256 public immutable amount;
    uint256 public immutable securityDeposit;
    
    // Partial fill support
    uint256 public immutable partIndex;
    uint16 public immutable totalParts;
    bool public immutable isPartialFill;
    
    // Time lock parameters
    uint256 public immutable withdrawalStart;
    uint256 public immutable publicWithdrawalStart;
    uint256 public immutable cancellationStart;
    uint256 public constant RESCUE_DELAY = 7 days;

    bool public fundsWithdrawn;
    bool public cancelled;

    event Withdrawal(address indexed caller, bytes secret);
    event FundsTransferred(address indexed to, uint256 amount);
    event SecurityDepositTransferred(address indexed to, uint256 amount);
    event Cancelled(address indexed initiator, uint256 amount);
    event Rescued(address indexed initiator, uint256 amount);

    constructor(
        address _creator,
        address _recipient,
        bytes32 _hashedSecret,
        address _token,
        uint256 _amount,
        uint256 _withdrawalStart,
        uint256 _publicWithdrawalStart,
        uint256 _cancellationStart,
        uint256 _partIndex,
        uint16 _totalParts
    ) payable {
        creator = _creator;
        recipient = _recipient;
        hashedSecret = _hashedSecret;
        token = _token;
        amount = _amount;
        securityDeposit = msg.value;
        
        // Partial fill support
        partIndex = _partIndex;
        totalParts = _totalParts;
        isPartialFill = _totalParts > 1;
        
        withdrawalStart = _withdrawalStart;
        publicWithdrawalStart = _publicWithdrawalStart;
        cancellationStart = _cancellationStart;
    }

    function withdraw(bytes calldata secret) external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Escrow cancelled");
        require(block.timestamp >= withdrawalStart, "Withdrawal not started");
        require(block.timestamp < cancellationStart, "Withdrawal period ended");
        
        // During private window, only recipient (buyer) or creator (resolver) can withdraw
        if (block.timestamp < publicWithdrawalStart) {
            require(msg.sender == recipient || msg.sender == creator, "Only recipient or creator in private window");
        }
        
        // Use SHA256 instead of keccak256 for Stellar compatibility
        require(sha256(secret) == hashedSecret, "Invalid secret");

        fundsWithdrawn = true;

        // Unwrap WBNB to BNB and transfer to recipient (buyer) - regardless of who calls
        IWETH(token).withdraw(amount);
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "BNB transfer failed");
        emit FundsTransferred(recipient, amount);
        
        // Transfer security deposit to caller (resolver if resolver calls, buyer if buyer calls)
        (bool depositSuccess, ) = msg.sender.call{value: securityDeposit}("");
        require(depositSuccess, "BNB transfer failed");
        emit SecurityDepositTransferred(msg.sender, securityDeposit);
        
        emit Withdrawal(msg.sender, secret);
    }

    function withdrawWithProof(
        bytes calldata secret,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Escrow cancelled");
        require(block.timestamp >= withdrawalStart, "Withdrawal not started");
        require(block.timestamp < cancellationStart, "Withdrawal period ended");
        require(isPartialFill, "Use withdraw() for complete fills");
        
        // During private window, only recipient (buyer) or creator (resolver) can withdraw
        if (block.timestamp < publicWithdrawalStart) {
            require(msg.sender == recipient || msg.sender == creator, "Only recipient or creator in private window");
        }
        
        // Use hashedSecret directly as merkle root (no embedded parts count)
        bytes32 merkleRoot = hashedSecret;
        
        // Verify merkle proof
        bytes32 secretHash = sha256(secret);
        bytes32 leaf = PartialFillHelper.generateLeaf(partIndex, secretHash);
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Invalid merkle proof");

        fundsWithdrawn = true;

        // Unwrap WBNB to BNB and transfer to recipient (buyer) - regardless of who calls
        IWETH(token).withdraw(amount);
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "BNB transfer failed");
        emit FundsTransferred(recipient, amount);
        
        // Transfer security deposit to caller (resolver if resolver calls, buyer if buyer calls)
        (bool depositSuccess, ) = msg.sender.call{value: securityDeposit}("");
        require(depositSuccess, "BNB transfer failed");
        emit SecurityDepositTransferred(msg.sender, securityDeposit);
        
        emit Withdrawal(msg.sender, secret);
    }

    function cancel() external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Already cancelled");
        require(block.timestamp >= cancellationStart, "Cancellation not started");
        require(msg.sender == creator, "Only creator can cancel");

        cancelled = true;
        
        // Unwrap WBNB to BNB and return to creator
        IWETH(token).withdraw(amount);
        (bool success, ) = creator.call{value: amount}("");
        require(success, "BNB transfer failed");
        emit FundsTransferred(creator, amount);
        
        // Refund security deposit to creator
        (bool depositSuccess, ) = creator.call{value: securityDeposit}("");
        require(depositSuccess, "BNB transfer failed");
        emit SecurityDepositTransferred(creator, securityDeposit);

        emit Cancelled(msg.sender, amount);
    }

    function rescue() external nonReentrant {
        require(!fundsWithdrawn, "Funds already withdrawn");
        require(!cancelled, "Already cancelled");
        require(block.timestamp >= cancellationStart + RESCUE_DELAY, "Rescue not available");
        require(msg.sender == creator, "Only creator can rescue");

        fundsWithdrawn = true;
        
        // Unwrap WBNB to BNB and transfer to creator
        IWETH(token).withdraw(amount);
        (bool success, ) = creator.call{value: amount}("");
        require(success, "BNB transfer failed");
        emit FundsTransferred(creator, amount);
        
        // Refund security deposit to creator
        (bool depositSuccess, ) = creator.call{value: securityDeposit}("");
        require(depositSuccess, "BNB transfer failed");
        emit SecurityDepositTransferred(creator, securityDeposit);

        emit Rescued(msg.sender, amount);
    }

    receive() external payable {}
}

// Interface for WETH/WBNB to enable unwrapping
interface IWETH {
    function withdraw(uint256 amount) external;
    function deposit() external payable;
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}