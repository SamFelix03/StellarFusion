// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract HashLockedEscrowFactory is ReentrancyGuard {
    uint256 public constant DEPOSIT_AMOUNT = 0.001 ether;
    address public immutable WETH;
    
    mapping(address => address[]) public userEscrows;
    mapping(address => bool) public isEscrowContract;

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
        uint256 publicCancellationStart
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

        SourceEscrow escrow = new SourceEscrow{value: msg.value}(
            buyer,  // Use buyer as creator
            recipient,
            hashedSecret,
            WETH,
            tokenAmount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart,
            publicCancellationStart
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
        uint256 cancellationStart
    ) external payable nonReentrant {
        require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
        require(tokenAmount > 0, "Token amount must be > 0");
        require(recipient != address(0), "Invalid recipient");
        require(
            publicWithdrawalStart > withdrawalStart &&
            cancellationStart > publicWithdrawalStart,
            "Invalid time windows"
        );

        DestinationEscrow escrow = new DestinationEscrow{value: msg.value}(
            msg.sender,
            recipient,
            hashedSecret,
            WETH,
            tokenAmount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart
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
        uint256 _publicCancellationStart
    ) payable {
        creator = _creator;
        recipient = _recipient;
        hashedSecret = _hashedSecret;
        token = _token;
        amount = _amount;
        securityDeposit = msg.value;
        
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
        uint256 _cancellationStart
    ) payable {
        creator = _creator;
        recipient = _recipient;
        hashedSecret = _hashedSecret;
        token = _token;
        amount = _amount;
        securityDeposit = msg.value;
        
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