# StellarFusion: Cross-Chain Atomic Swap Platform

## Table of Contents

1. [Introduction](#introduction)

2. [Order Creation](#order-creation)
   - [Fusion+ Swaps](#fusion-swaps)
   - [Partial Fills](#partial-fills)

3. [Dutch Auction](#dutch-auction)

4. [Escrow Creations](#escrow-creations)
   - [Escrow Creations in Fusion+ Swaps](#escrow-creations-in-fusion-swaps)
   - [Escrow Creations in Partial Fills](#escrow-creations-in-partial-fills)

5. [Validation and Checking](#validation-and-checking)

6. [Secret Exchange](#secret-exchange)

7. [Withdrawal](#withdrawal)

8. [Conclusion](#conclusion)

---

## Introduction

### Overview

**Stellar Fusion** is a cross-chain atomic swap platform that enables secure, trustless exchanges between Ethereum and Stellar networks. Inspired by the 1inch Limit Order protocol, StellarFusion provides users with unprecedented flexibility in cross-chain asset transfers.

The platform combines the speed and efficiency of Stellar with the robust smart contract capabilities of Ethereum, creating a seamless bridge between two of the most prominent ecosystems.

### Key Features

🔗 **Cross-Chain Atomic Swaps**: Execute trustless swaps between Ethereum and Stellar.

🛡️ **Hash-Locked Escrows**: Cryptographic escrow system ensures atomic execution - either both parties receive their assets or neither does.

⏰ **Multi-Stage Time Locks**: Four-tier time lock system with withdrawal start (1min), public withdrawal (5min), cancellation start (10min), and public cancellation (15min) ensuring secure atomic execution.

⚡ **Partial Fill Support**: Merkle tree implementation allows large orders to be filled partially by resolvers, improving liquidity and execution efficiency.

🎯 **Dutch Auction Mechanism**: Dynamic pricing system that automatically adjusts rates based on market conditions and order size.

🔒 **Security-First Design**: Built with multiple layers of security including time-locked withdrawals, hash locks, finality lock, emergency cancellation, and comprehensive validation.

---

## Order Creation

### Fusion+ Swaps

Fusion+ Swaps represent the core atomic swap functionality of Stellar Fusion, enabling complete cross-chain exchanges between Ethereum and Stellar networks. This section details the comprehensive flow from user interface interaction to smart contract execution and relayer integration.

#### User Interface Flow

The order creation process begins in the frontend interface

1. **Token Selection**: Users select source and destination tokens from supported chains
2. **Amount Input**: Users specify the amount to swap with real-time price calculations
3. **Order Creation**: The `handleCreateOrder()` function initiates the order creation process

#### Hash Lock Implementation

StellarFusion implements a sophisticated hash lock system that ensures atomic execution of cross-chain swaps:

**Core Hash Lock Class (`src/hash-lock.ts`):**
```typescript
// From hash-lock.ts lines 13-22
public static hashSecret(secret: string): string {
    if (!secret.startsWith('0x') || secret.length !== 66) {
        throw new Error('secret must be 32 bytes hex encoded with 0x prefix');
    }

    const hash = createHash('sha256');
    hash.update(Buffer.from(secret.slice(2), 'hex'));
    return '0x' + hash.digest('hex');
}
```

#### Relayer Integration

The frontend sends order data to the relayer through the `sendOrderToRelayer()` function:

```typescript
// From order-utils.ts lines 370-450
export async function sendOrderToRelayer(orderData: OrderData, isPartialFill: boolean = false): Promise<any> {
  const endpoint = isPartialFill ? 'http://localhost:8000/partialfill' : 'http://localhost:8000/create';
  
  // Prepare request body (including hashedSecret for resolver)
  const requestBody: any = {
    orderId: orderData.orderId,
    buyerAddress: orderData.buyerAddress,
    srcChainId: orderData.srcChainId,
    dstChainId: orderData.dstChainId,
    srcToken: orderData.srcToken,
    dstToken: orderData.dstToken,
    srcAmount: orderData.srcAmount,
    dstAmount: orderData.dstAmount,
    market_price: orderData.market_price,
    slippage: orderData.slippage,
    hashedSecret: orderData.hashedSecret // Include hashedSecret for resolver
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  return await response.json();
}
```

#### Data Sent to Relayer

The following data structure is transmitted to the relayer:

```json
{
  "orderId": "0x...",           // Unique order identifier
  "buyerAddress": "0x...",      // Buyer's wallet address
  "srcChainId": 11155111,       // Source chain ID (Sepolia)
  "dstChainId": "stellar-testnet", // Destination chain ID
  "srcToken": "ETH",            // Source token symbol
  "dstToken": "XLM",            // Destination token symbol
  "srcAmount": "0.1",           // Source amount
  "dstAmount": "100",           // Destination amount
  "market_price": "1000",       // Current market price
  "slippage": "0.5",            // Slippage tolerance
  "hashedSecret": "0x..."       // Cryptographic hash for escrow creation
}
```
#### Price Service Integration

StellarFusion includes a comprehensive price service (`src/price-service.ts`) that provides real-time token pricing from Coin Gecko

#### Order Execution Flow

1. **Frontend Validation**: User inputs are validated for completeness and correctness
2. **Price Calculation**: Real-time token prices are fetched and destination amounts calculated
3. **Secret Generation**: Cryptographically secure random secret and hash are generated
4. **Order Creation**: Complete order data structure is assembled with all necessary parameters
5. **Relayer Transmission**: Order data is sent to the relayer for processing the Dutch Auction


### Partial Fills

Partial Fills represent an advanced feature of StellarFusion that enables large orders to be executed through multiple smaller transactions. This section details the comprehensive flow from user interface configuration to smart contract execution and relayer integration for partial fill orders.

#### User Interface Flow

The partial fill configuration process begins in the frontend interface with the `PartialFillSettings` component:

1. **Partial Fill Toggle**: Users can enable/disable partial fills using a custom switch component
2. **Order Creation**: The `handleCreateOrder()` function includes partial fill parameters

#### Order Data Generation

The `createOrder()` function in `frontend/lib/order-utils.ts` generates partial fill orders with Merkle tree implementation:

```typescript
// From order-utils.ts lines 43-100
export function createOrder(params: OrderCreationParams): OrderData {
  let secret: string;
  let hashedSecret: string;
  let partialFillManager: PartialFillOrderManager | undefined;
  let partialFillSecrets: string[] | undefined;
  let partialFillSecretHashes: string[] | undefined;

  if (params.enablePartialFills && params.partsCount && params.partsCount > 1) {
    console.log(`🌳 Creating partial fill order with ${params.partsCount} parts`);
    
    // Create partial fill manager with merkle tree
    partialFillManager = new PartialFillOrderManager(params.partsCount);
    hashedSecret = partialFillManager.getHashLock();
    // Use first secret as the main order secret (for backwards compatibility)
    secret = partialFillManager.getSecret(0);
    
    // Store all secrets and hashes for UI display
    partialFillSecrets = partialFillManager.getAllSecrets();
    partialFillSecretHashes = partialFillManager.getAllSecretHashes();
    
    console.log(`📋 Generated ${params.partsCount + 1} secrets for partial fill (including extra)`);
    console.log(`🔐 HashLock (Merkle Root): ${hashedSecret}`);
    console.log(`🔑 Main secret (first secret): ${secret.slice(0, 10)}...`);
  } else {
    // Single fill logic (same as Fusion+ Swaps)
    const secretBytes = ethers.utils.randomBytes(32);
    secret = ethers.utils.hexlify(secretBytes);
    hashedSecret = ethers.utils.sha256(secretBytes);
  }
  
  return {
    orderId,
    buyerAddress: params.buyerAddress,
    srcChainId: chainsConfig[params.sourceChain].chainId,
    dstChainId: chainsConfig[params.destinationChain].chainId,
    srcToken: params.sourceToken,
    dstToken: params.destinationToken,
    srcAmount: params.sourceAmount,
    dstAmount: params.destinationAmount,
    hashedSecret,
    secret,
    isPartialFillEnabled: params.enablePartialFills,
    partialFillManager,
    partialFillSecrets,
    partialFillSecretHashes
  };
}
```
#### Relayer Integration

The frontend sends partial fill order data to the relayer through the `sendOrderToRelayer()` function:

#### Data Sent to Relayer

The following data structure is transmitted to the relayer for partial fills:

```json
{
  "orderId": "0x...",           // Unique order identifier
  "buyerAddress": "0x...",      // Buyer's wallet address
  "srcChainId": 11155111,       // Source chain ID (Sepolia)
  "dstChainId": "stellar-testnet", // Destination chain ID
  "srcToken": "ETH",            // Source token symbol
  "dstToken": "XLM",            // Destination token symbol
  "srcAmount": "0.1",           // Source amount
  "dstAmount": "100",           // Destination amount
  "market_price": "1000",       // Current market price
  "slippage": "0.5",            // Slippage tolerance
  "hashedSecret": "0x...",      // Cryptographic hash for escrow creation
  "segmentSecrets": [           // Partial fill segment data
    {
      "segmentId": 1,
      "hashedSecret": "0x..."
    },
    {
      "segmentId": 2,
      "hashedSecret": "0x..."
    }
  ]
}
```

#### Partial Fill Execution Flow

1. **Frontend Configuration**: User enables partial fills
2. **Merkle Tree Generation**: System creates Merkle tree with individual secrets for each part
3. **Segment Creation**: Order is divided into segments with individual cryptographic proofs

**Key Advantages:**
- **Improved Liquidity**: Large orders can be filled by multiple resolvers
- **Risk Mitigation**: Partial execution reduces exposure to market volatility
- **Flexible Execution**: Resolvers can choose which parts to fill based on availability
- **Atomic Security**: Each part maintains atomic execution guarantees
- **Real-time Progress**: Users can track completion status of individual segments

---

## Dutch Auction

### Fusion+ Swaps (Single Auction)

The Dutch auction mechanism for Fusion+ swaps operates as a single auction system that dynamically adjusts pricing based on market conditions and order size. This system ensures optimal price discovery and efficient order execution for complete cross-chain swaps.

#### Auction Initialization

When a Fusion+ swap order is created, the Dutch auction system initializes with the following parameters:

- **Starting Price**: Slightly higher than the market price
- **Minimum Price**: Market price × (1 - slippage) (e.g., $3,822 for 2% slippage)
- **Price Reduction**: 5% of current price every 10 seconds

#### Auction Flow

1. **Order Creation**: Frontend sends order data to relayer with `hashedSecret` and `buyerAddress`
2. **Auction Start**: `startSingleAuction()` function initializes the auction with calculated parameters
3. **Price Broadcasting**: Real-time price updates are broadcast to all connected clients 
4. **Resolver Participation**: Resolvers can join the auction and monitor price movements
5. **Winner Confirmation**: First resolver to confirm at current price becomes the winner

#### Client Communication

The auction system maintains real-time communication with resolvers through WebSocket connections:

```javascript
// From server.js lines 650-680
this.broadcastToAll({
  type: 'single_auction_update',
  orderId: orderId,
  currentPrice: Math.round(auction.currentPrice * 100) / 100,
  startPrice: auction.startPrice,
  endPrice: auction.minimumPrice,
  marketPrice: auction.marketPrice,
  hashedSecret: auction.hashedSecret,
  buyerAddress: auction.buyerAddress
});
```

#### Auction Completion

Upon completion, the system updates the order status and broadcasts final results:

```javascript
// From server.js lines 896-930
const auctionData = {
  winner: auction.winner || null,
  finalPrice: Math.floor(auction.currentPrice),
  startPrice: auction.startPrice,
  endPrice: auction.minimumPrice,
  marketPrice: auction.marketPrice,
  sourceAmount: auction.sourceAmount,
  slippage: auction.slippage,
  auctionType: 'single',
  status: status,
  completedAt: new Date().toISOString()
};
```

### Partial Fills (Segmented Auction)

The Dutch auction mechanism for partial fills operates as a segmented auction system that divides large orders into multiple smaller segments, each with independent pricing and execution. This system enables improved liquidity and risk mitigation for large cross-chain swaps.

#### Auction Initialization

When a partial fill order is created, the Dutch auction system initializes with segmented parameters:

- **Total Segments**: segments of various size
- **Starting Prices**: Different starting prices for each segment based on market conditions
- **Price Reduction**: 5% of current price every 10 seconds per segment

#### Individual Segment Management

Each segment operates independently with its own price reduction mechanism:

```javascript
// From server.js lines 710-740
const interval = setInterval(() => {
  if (segment.winner) {
    clearInterval(interval);
    return;
  }
  
  // Calculate price reduction (5% of current price)
  const priceReduction = segment.currentPrice * 0.05;
  segment.currentPrice = Math.max(segment.endPrice, segment.currentPrice - priceReduction);
  
  // Broadcast updated price for this segment
  this.broadcastToAll({
    type: 'segment_update',
    orderId: orderId,
    segmentId: segmentId,
    currentPrice: Math.round(segment.currentPrice * 100) / 100
  });
}, 10000);
```

#### Segment Winner Determination

Each segment can have its own winner, allowing for distributed execution:

```javascript
// From server.js lines 180-200
if (segment && segment.status === 'active' && !segment.winner) {
  segment.winner = data.name;
  
  console.log(`\n🎉 SEGMENT ${segmentId} WINNER: ${data.name} confirmed at price ${Math.floor(segment.currentPrice)}!`);
  
  // End this specific segment
  this.endSegment(confirmOrderId, segmentId, 'completed');
}
```

#### Comprehensive Auction Results

Upon completion of all segments, the system calculates comprehensive results:

```javascript
// From server.js lines 850-880
const totalWinners = auction.totalWinners.filter(win => win.winner !== null).length;
const totalAmount = auction.totalWinners.reduce((sum, win) => sum + win.amount, 0);
const totalValue = auction.totalWinners.reduce((sum, win) => sum + (win.price * win.amount), 0);
const effectiveRate = totalValue / totalAmount;

console.log(`\n📊 SEGMENTED AUCTION RESULTS for order ${orderId}:`);
console.log(`🏆 Total winners: ${totalWinners}`);
console.log(`💰 Total amount: ${totalAmount}`);
console.log(`💵 Total value: ${totalValue}`);
console.log(`📈 Effective rate: ${effectiveRate.toFixed(2)}`);
```
#### Key Advantages of Segmented Auctions

- **Improved Liquidity**: Multiple resolvers can participate simultaneously
- **Risk Mitigation**: Large orders are distributed across multiple segments
- **Flexible Execution**: Resolvers can choose which segments to fill
- **Atomic Security**: Each segment maintains independent cryptographic verification
- **Real-time Progress**: Users can track completion status of individual segments

---

## Escrow Creations

### Escrow Creations in Fusion+ Swaps

Fusion+ Swaps escrow creation represents the critical phase where atomic swap execution is initiated through escrow contracts. This section details the comprehensive flow from auction winner selection to smart contract deployment and security deposit management.

#### Winner Selection and Information Transmission

When a resolver wins the Dutch auction, the relayer transmits critical information to enable escrow creation:

**Data Transmitted to Winner:**
```json
{
  "orderId": "0x...",
  "hashedSecret": "0x...",           // Cryptographic hash for escrow creation
  "buyerAddress": "0x...",           // Buyer's wallet address
  "srcChainId": 11155111,            // Source chain ID (Sepolia)
  "dstChainId": "stellar-testnet",   // Destination chain ID
  "srcToken": "ETH",                 // Source token symbol
  "dstToken": "XLM",                 // Destination token symbol
  "srcAmount": "0.1",                // Source amount
  "dstAmount": "100",                // Destination amount
  "finalPrice": "3950",              // Final auction price
  "marketPrice": "3900",             // Market price at auction start
  "slippage": "0.02",                // Slippage tolerance
  "auctionType": "single",           // Auction type (single/segmented)
  "winner": "resolver_address",      // Winner's address
  "escrowCreationDeadline": "..."    // Time limit for escrow creation
}
```

#### Multi-Stage Time Lock Implementation

StellarFusion implements a sophisticated four-tier time lock system that ensures secure atomic execution:

**Time Lock Parameters:**
- **Withdrawal Start**: 1 minute after escrow creation (private withdrawal window begins)
- **Public Withdrawal Start**: 5 minutes after escrow creation (public withdrawal window begins)
- **Cancellation Start**: 10 minutes after escrow creation (private cancellation window begins)
- **Public Cancellation Start**: 15 minutes after escrow creation (public cancellation window begins)

```solidity
// From EscrowFactory.sol lines 103-130
function createSrcEscrow(
    bytes32 hashedSecret,
    address recipient,
    address buyer,
    uint256 tokenAmount,
    uint256 withdrawalStart,        // 1 minute after creation
    uint256 publicWithdrawalStart,  // 5 minutes after creation
    uint256 cancellationStart,      // 10 minutes after creation
    uint256 publicCancellationStart, // 15 minutes after creation
    uint256 partIndex,
    uint16 totalParts
) external payable nonReentrant {
    // Validate time window progression
    require(
        publicWithdrawalStart > withdrawalStart &&
        cancellationStart > publicWithdrawalStart &&
        publicCancellationStart > cancellationStart,
        "Invalid time windows"
    );
}
```

#### Security Deposit Management

Each escrow creation requires a security deposit to ensure resolver commitment:

**Security Deposit Requirements:**
- **Amount**: 0.001 ETH per escrow contract
- **Purpose**: Ensures resolver commitment
- **Refund**: Returned to resolver upon successful withdrawal
- **Forfeiture**: Lost if resolver fails to complete the swap

```solidity
// From EscrowFactory.sol lines 50-55
contract HashLockedEscrowFactory is ReentrancyGuard {
    uint256 public constant DEPOSIT_AMOUNT = 0.001 ether;
    
    function createSrcEscrow(...) external payable nonReentrant {
        require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
        // ... rest of function
    }
}
```

#### Cross-Chain Source Escrow Creation

The winner creates the source escrow on the source chain (which could be Ethereum, Stellar, or any supported chain) through the appropriate factory contract:

**Ethereum Source Escrow Creation:**
```solidity
// From EscrowFactory.sol lines 103-170
function createSrcEscrow(
    bytes32 hashedSecret,
    address recipient,
    address buyer,
    uint256 tokenAmount,
    uint256 withdrawalStart,
    uint256 publicWithdrawalStart,
    uint256 cancellationStart,
    uint256 publicCancellationStart,
    uint256 partIndex,
    uint16 totalParts
) external payable nonReentrant {
    require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
    require(tokenAmount > 0, "Token amount must be > 0");
    require(recipient != address(0), "Invalid recipient");
    require(buyer != address(0), "Invalid buyer");
    
    // Validate time window progression
    require(
        publicWithdrawalStart > withdrawalStart &&
        cancellationStart > publicWithdrawalStart &&
        publicCancellationStart > cancellationStart,
        "Invalid time windows"
    );

    // Create SourceEscrow contract
    SourceEscrow escrow = new SourceEscrow{value: msg.value}(
        buyer,  // Creator
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
    userEscrows[buyer].push(escrowAddress);
    isEscrowContract[escrowAddress] = true;

    // Transfer tokens from buyer to escrow
    IERC20(WETH).transferFrom(buyer, escrowAddress, tokenAmount);

    emit SrcEscrowCreated(
        buyer,
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
```

**Stellar Source Escrow Creation:**
```rust
// From limit-order-protocol/src/lib.rs lines 100-180
pub fn fill_order(
    env: Env,
    order_hash: BytesN<32>,
    maker: Address,
    recipient: Address,
    token_amount: i128,
    hashed_secret: BytesN<32>,
    withdrawal_start: u64,
    public_withdrawal_start: u64,
    part_index: u64,
    total_parts: u32,
) -> Address {
    // Validate inputs
    if total_parts == 0 {
        panic!("Total parts must be > 0");
    }
    if part_index >= total_parts as u64 {
        panic!("Invalid part index");
    }
    if token_amount <= 0 {
        panic!("Token amount must be > 0");
    }

    // Check if this part is already filled
    let part_filled: bool = env.storage()
        .persistent()
        .get(&DataKey::PartsFilled(order_hash.clone(), part_index))
        .unwrap_or(false);
    if part_filled {
        panic!("Part already filled");
    }

    // Check allowance - LOP must be approved to spend maker's tokens
    let current_allowance = Self::allowance(env.clone(), maker.clone(), env.current_contract_address());
    if current_allowance < token_amount {
        panic!("Insufficient allowance");
    }
    
    // Reduce allowance
    let new_allowance = current_allowance - token_amount;
    env.storage().persistent().set(
        &DataKey::TokenAllowance(maker.clone(), env.current_contract_address()),
        &new_allowance
    );

    // Get factory address and create escrow
    let factory_address: Address = env.storage().instance().get(&DataKey::EscrowFactory).unwrap();
    let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
    
    // Create escrow using factory client
    let escrow_address = factory_client.create_src_escrow_partial(
        &env.current_contract_address(), // creator (LOP)
        &hashed_secret,
        &recipient,
        &maker,        // buyer
        &token_amount,
        &withdrawal_start,
        &public_withdrawal_start,
        &(withdrawal_start + 86400), // cancellation_start (24 hours after withdrawal)
        &part_index,
        &total_parts,
    );

    // Track the filled order
    let filled_order = FilledOrder {
        order_hash: order_hash.clone(),
        maker: maker.clone(),
        recipient: recipient.clone(),
        escrow_address: escrow_address.clone(),
        part_index,
        total_parts,
        is_active: true,
    };

    // Store order data
    let mut filled_orders: Vec<FilledOrder> = env.storage()
        .persistent()
        .get(&DataKey::FilledOrders(order_hash.clone()))
        .unwrap_or(Vec::new(&env));
    filled_orders.push_back(filled_order);
    env.storage().persistent().set(&DataKey::FilledOrders(order_hash.clone()), &filled_orders);

    // Mark part as filled
    env.storage().persistent().set(&DataKey::PartsFilled(order_hash.clone(), part_index), &true);

    escrow_address
}
```

#### Cross-Chain Destination Escrow Creation

The winner creates the destination escrow on the destination chain through the appropriate factory contract:

**Ethereum Destination Escrow Creation:**
```solidity
// From EscrowFactory.sol lines 175-220
function createDstEscrow(
    bytes32 hashedSecret,
    address recipient,
    uint256 tokenAmount,
    uint256 withdrawalStart,
    uint256 publicWithdrawalStart,
    uint256 cancellationStart,
    uint256 partIndex,
    uint16 totalParts
) external payable nonReentrant {
    require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
    require(tokenAmount > 0, "Token amount must be > 0");
    require(recipient != address(0), "Invalid recipient");
    
    // Validate time windows
    require(
        publicWithdrawalStart > withdrawalStart &&
        cancellationStart > publicWithdrawalStart,
        "Invalid time windows"
    );

    // Create DestinationEscrow contract
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
```

**Stellar Destination Escrow Creation:**
```rust
// From resolver/src/lib.rs lines 304-350
pub fn create_destination_escrow(
    env: Env,
    caller: Address,
    hashed_secret: BytesN<32>,
    recipient: Address,
    amount: i128,
    withdrawal_start: u64,
    public_withdrawal_start: u64,
    cancellation_start: u64,
    part_index: u64,
    total_parts: u32,
) -> Address {
    // Only owner can create destination escrows
    let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
    if caller != owner {
        panic!("Only owner can create destination escrows");
    }
    caller.require_auth();

    // Get factory address
    let factory_address: Address = env.storage()
        .instance()
        .get(&DataKey::EscrowFactory)
        .unwrap();

    // Create destination escrow through factory
    let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
    let escrow_address = factory_client.create_dst_escrow_partial(
        &caller, // creator (resolver)
        &hashed_secret,
        &recipient,
        &amount,
        &withdrawal_start,
        &public_withdrawal_start,
        &cancellation_start,
        &part_index,
        &total_parts,
    );

    log!(&env, "DestinationEscrowCreated: escrowAddress={}, hashedSecret={}, recipient={}, amount={}, partIndex={}", 
         escrow_address, hashed_secret, recipient, amount, part_index);

    escrow_address
}
```

**Cross-Chain Escrow Creation Flow:**
1. **Source Chain**: Winner creates source escrow on the chain where the source tokens are located
2. **Destination Chain**: Winner creates destination escrow on the chain where destination tokens will be received
3. **Synchronization**: Both escrows use identical hashedSecret and time lock parameters
4. **Atomic Execution**: Either both escrows complete successfully or both can be cancelled

#### Cryptographic Security Measures

Stellar Fusion implements multiple layers of cryptographic security:

**Hash Lock Implementation:**
- **Secret Generation**: Cryptographically secure random 32-byte secret
- **Hash Calculation**: SHA256 hash of secret for cross-chain compatibility
- **Hash Verification**: Both Ethereum and Stellar use SHA256 for consistency

```solidity
// From EscrowFactory.sol lines 280-290
function withdraw(bytes calldata secret) external nonReentrant {
    // Use SHA256 instead of keccak256 for Stellar compatibility
    require(sha256(secret) == hashedSecret, "Invalid secret");
    
    fundsWithdrawn = true;
    // ... withdrawal logic
}
```

**Reentrancy Protection:**
- **NonReentrant Modifier**: Prevents reentrancy attacks on all critical functions
- **State Changes**: State variables are updated before external calls
- **Checks-Effects-Interactions Pattern**: Strict adherence to security patterns

```solidity
// From EscrowFactory.sol lines 103-105
function createSrcEscrow(...) external payable nonReentrant {
    require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
    // ... validation and state changes before external calls
}
```

#### Escrow State Management

The system maintains comprehensive state tracking for each escrow:

**Source Escrow State Variables:**
```solidity
// From EscrowFactory.sol lines 230-250
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
    
    bool public fundsWithdrawn;
    bool public cancelled;
}
```

**State Transition Rules:**
- **Active State**: Escrow is created and awaiting withdrawal
- **Withdrawn State**: Funds have been successfully withdrawn
- **Cancelled State**: Escrow has been cancelled by creator
- **Rescue State**: Emergency withdrawal after extended delays

#### Event Emission and Monitoring

Comprehensive event system enables real-time monitoring:

**Key Events:**
```solidity
// From EscrowFactory.sol lines 60-80
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

event Withdrawal(address indexed caller, bytes secret);
event FundsTransferred(address indexed to, uint256 amount);
event SecurityDepositTransferred(address indexed to, uint256 amount);
event Cancelled(address indexed initiator, uint256 amount);
event Rescued(address indexed initiator, uint256 amount);
```

#### Cross-Chain Coordination

The escrow creation process ensures perfect coordination between chains:

**Coordination Requirements:**
- **Synchronized Time Locks**: Both chains use identical time lock parameters
- **Hash Lock Consistency**: Same hashedSecret used on both chains
- **Amount Verification**: Token amounts match across both escrows
- **Address Validation**: Recipient addresses are verified on both chains

**Error Handling:**
- **Invalid Time Windows**: Rejected if time lock progression is invalid
- **Insufficient Deposits**: Rejected if security deposit is incorrect
- **Token Approval**: Rejected if WETH approval is insufficient
- **Address Validation**: Rejected if addresses are invalid or zero

---

### Escrow Creations in Partial Fills

Partial Fills escrow creation represents an advanced cross-chain atomic swap mechanism that enables large orders to be executed through multiple smaller segments, each with independent cryptographic verification. This section details the comprehensive flow from segmented auction completion to Merkle tree-based escrow creation and multi-chain coordination.

#### Segmented Winner Selection and Data Transmission

When multiple resolvers win different segments of a partial fill auction, the relayer transmits segment-specific information to each winner:

**Data Transmitted to Segment Winners:**
```json
{
  "orderId": "0x...",
  "segmentId": 1,                    // Segment identifier (1-4)
  "hashedSecret": "0x...",           // Merkle root for all segments
  "segmentHashedSecret": "0x...",    // Individual segment hash
  "buyerAddress": "0x...",           // Buyer's wallet address
  "srcChainId": 11155111,            // Source chain ID
  "dstChainId": "stellar-testnet",   // Destination chain ID
  "srcToken": "ETH",                 // Source token symbol
  "dstToken": "XLM",                 // Destination token symbol
  "srcAmount": "0.025",              // Segment amount (total/4)
  "dstAmount": "25",                 // Segment destination amount
  "finalPrice": "3950",              // Final auction price for this segment
  "marketPrice": "3900",             // Market price at auction start
  "slippage": "0.02",                // Slippage tolerance
  "auctionType": "segmented",        // Auction type
  "winner": "resolver_address",      // Winner's address
  "totalSegments": 4,                // Total number of segments
  "partIndex": 0,                    // Part index (0-based)
  "totalParts": 4,                   // Total parts
  "escrowCreationDeadline": "..."    // Time limit for escrow creation
}
```

#### Merkle Tree Implementation for Partial Fills

StellarFusion implements a sophisticated Merkle tree system that enables cryptographic verification of individual segments while maintaining atomic execution:

**Merkle Tree Structure:**
```solidity
// From EscrowFactory.sol lines 30-40
library PartialFillHelper {
    function generateLeaf(uint256 index, bytes32 secretHash) internal pure returns (bytes32) {
        // Pack index (8 bytes) + secret hash (32 bytes) and hash with SHA256
        bytes memory packed = abi.encodePacked(uint64(index), secretHash);
        return sha256(packed);
    }
}
```

**Merkle Tree Generation Process:**
1. **Individual Secrets**: Each segment has its own cryptographically secure 32-byte secret
2. **Leaf Generation**: Each secret is hashed with its index to create a unique leaf
3. **Tree Construction**: All leaves are combined to form a Merkle tree
4. **Root Calculation**: The Merkle root serves as the main hashedSecret for all segments

#### Cross-Chain Partial Fill Escrow Creation

Each segment winner creates escrows on both source and destination chains with segment-specific parameters:

**Ethereum Partial Fill Source Escrow Creation:**
```solidity
// From EscrowFactory.sol lines 103-170
function createSrcEscrow(
    bytes32 hashedSecret,            // Merkle root for all segments
    address recipient,
    address buyer,
    uint256 tokenAmount,             // Segment amount
    uint256 withdrawalStart,
    uint256 publicWithdrawalStart,
    uint256 cancellationStart,
    uint256 publicCancellationStart,
    uint256 partIndex,               // Segment index (0-3)
    uint16 totalParts                // Total segments (4)
) external payable nonReentrant {
    require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
    require(tokenAmount > 0, "Token amount must be > 0");
    require(recipient != address(0), "Invalid recipient");
    require(buyer != address(0), "Invalid buyer");
    
    // Validate time window progression
    require(
        publicWithdrawalStart > withdrawalStart &&
        cancellationStart > publicWithdrawalStart &&
        publicCancellationStart > cancellationStart,
        "Invalid time windows"
    );

    // Check if this is a partial fill
    bool isPartialFill = totalParts > 1;
    if (isPartialFill) {
        require(partIndex < totalParts, "Invalid part index");
        require(!partialFillsUsed[hashedSecret][partIndex], "Part already used");
        
        // Mark this part as used and update tracking
        partialFillsUsed[hashedSecret][partIndex] = true;
        partialFillsCount[hashedSecret]++;
    }

    // Create SourceEscrow contract with partial fill support
    SourceEscrow escrow = new SourceEscrow{value: msg.value}(
        buyer,  // Creator
        recipient,
        hashedSecret,                // Merkle root
        WETH,
        tokenAmount,                 // Segment amount
        withdrawalStart,
        publicWithdrawalStart,
        cancellationStart,
        publicCancellationStart,
        partIndex,                   // Segment index
        totalParts                   // Total segments
    );

    address escrowAddress = address(escrow);
    userEscrows[buyer].push(escrowAddress);
    isEscrowContract[escrowAddress] = true;

    // Transfer segment tokens from buyer to escrow
    IERC20(WETH).transferFrom(buyer, escrowAddress, tokenAmount);

    emit SrcEscrowCreated(
        buyer,
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
```

**Stellar Partial Fill Source Escrow Creation:**
```rust
// From limit-order-protocol/src/lib.rs lines 100-180
pub fn fill_order(
    env: Env,
    order_hash: BytesN<32>,
    maker: Address,
    recipient: Address,
    token_amount: i128,              // Segment amount
    hashed_secret: BytesN<32>,       // Merkle root
    withdrawal_start: u64,
    public_withdrawal_start: u64,
    part_index: u64,                 // Segment index
    total_parts: u32,                // Total segments
) -> Address {
    // Validate inputs
    if total_parts == 0 {
        panic!("Total parts must be > 0");
    }
    if part_index >= total_parts as u64 {
        panic!("Invalid part index");
    }
    if token_amount <= 0 {
        panic!("Token amount must be > 0");
    }

    // Check if this part is already filled
    let part_filled: bool = env.storage()
        .persistent()
        .get(&DataKey::PartsFilled(order_hash.clone(), part_index))
        .unwrap_or(false);
    if part_filled {
        panic!("Part already filled");
    }

    // Check allowance - LOP must be approved to spend maker's tokens
    let current_allowance = Self::allowance(env.clone(), maker.clone(), env.current_contract_address());
    if current_allowance < token_amount {
        panic!("Insufficient allowance");
    }
    
    // Reduce allowance
    let new_allowance = current_allowance - token_amount;
    env.storage().persistent().set(
        &DataKey::TokenAllowance(maker.clone(), env.current_contract_address()),
        &new_allowance
    );

    // Get factory address and create escrow
    let factory_address: Address = env.storage().instance().get(&DataKey::EscrowFactory).unwrap();
    let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
    
    // Create escrow using factory client with partial fill support
    let escrow_address = factory_client.create_src_escrow_partial(
        &env.current_contract_address(), // creator (LOP)
        &hashed_secret,                  // Merkle root
        &recipient,
        &maker,                          // buyer
        &token_amount,                   // Segment amount
        &withdrawal_start,
        &public_withdrawal_start,
        &(withdrawal_start + 86400),     // cancellation_start
        &part_index,                     // Segment index
        &total_parts,                    // Total segments
    );

    // Track the filled order part
    let filled_order = FilledOrder {
        order_hash: order_hash.clone(),
        maker: maker.clone(),
        recipient: recipient.clone(),
        escrow_address: escrow_address.clone(),
        part_index,
        total_parts,
        is_active: true,
    };

    // Store order data
    let mut filled_orders: Vec<FilledOrder> = env.storage()
        .persistent()
        .get(&DataKey::FilledOrders(order_hash.clone()))
        .unwrap_or(Vec::new(&env));
    filled_orders.push_back(filled_order);
    env.storage().persistent().set(&DataKey::FilledOrders(order_hash.clone()), &filled_orders);

    // Mark part as filled
    env.storage().persistent().set(&DataKey::PartsFilled(order_hash.clone(), part_index), &true);

    escrow_address
}
```

#### Cross-Chain Partial Fill Destination Escrow Creation

For partial fills, destination escrows are created on the destination chain with segment-specific parameters that enable individual segment withdrawal through Merkle proof verification:

**Ethereum Partial Fill Destination Escrow Creation:**
```solidity
// From EscrowFactory.sol lines 175-220
function createDstEscrow(
    bytes32 hashedSecret,            // Merkle root for all segments
    address recipient,
    address buyer,
    uint256 tokenAmount,             // Segment destination amount
    uint256 withdrawalStart,
    uint256 publicWithdrawalStart,
    uint256 cancellationStart,
    uint256 publicCancellationStart,
    uint256 partIndex,               // Segment index (0-3)
    uint16 totalParts                // Total segments (4)
) external payable nonReentrant {
    require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
    require(tokenAmount > 0, "Token amount must be > 0");
    require(recipient != address(0), "Invalid recipient");
    require(buyer != address(0), "Invalid buyer");
    
    // Validate time window progression
    require(
        publicWithdrawalStart > withdrawalStart &&
        cancellationStart > publicWithdrawalStart &&
        publicCancellationStart > cancellationStart,
        "Invalid time windows"
    );

    // Check if this is a partial fill
    bool isPartialFill = totalParts > 1;
    if (isPartialFill) {
        require(partIndex < totalParts, "Invalid part index");
        require(!partialFillsUsed[hashedSecret][partIndex], "Part already used");
        
        // Mark this part as used and update tracking
        partialFillsUsed[hashedSecret][partIndex] = true;
        partialFillsCount[hashedSecret]++;
    }

    // Create DestinationEscrow contract with partial fill support
    DestinationEscrow escrow = new DestinationEscrow{value: msg.value}(
        buyer,  // Creator
        recipient,
        hashedSecret,                // Merkle root
        WETH,
        tokenAmount,                 // Segment destination amount
        withdrawalStart,
        publicWithdrawalStart,
        cancellationStart,
        publicCancellationStart,
        partIndex,                   // Segment index
        totalParts                   // Total segments
    );

    address escrowAddress = address(escrow);
    userEscrows[buyer].push(escrowAddress);
    isEscrowContract[escrowAddress] = true;

    emit DstEscrowCreated(
        buyer,
        recipient,
        escrowAddress,
        hashedSecret,
        tokenAmount,
        withdrawalStart,
        publicWithdrawalStart,
        cancellationStart,
        publicCancellationStart,
        partIndex,
        totalParts
    );
}
```

**Stellar Partial Fill Destination Escrow Creation:**
```rust
// From resolver/src/lib.rs lines 304-350
pub fn create_destination_escrow(
    env: Env,
    recipient: Address,
    buyer: Address,
    hashed_secret: BytesN<32>,       // Merkle root for all segments
    token_amount: i128,              // Segment destination amount
    withdrawal_start: u64,
    public_withdrawal_start: u64,
    cancellation_start: u64,
    public_cancellation_start: u64,
    part_index: u64,                 // Segment index
    total_parts: u32,                // Total segments
) -> Address {
    // Validate inputs
    if total_parts == 0 {
        panic!("Total parts must be > 0");
    }
    if part_index >= total_parts as u64 {
        panic!("Invalid part index");
    }
    if token_amount <= 0 {
        panic!("Token amount must be > 0");
    }

    // Check if this part is already used
    let part_used: bool = env.storage()
        .persistent()
        .get(&DataKey::PartialFillUsed(hashed_secret.clone(), part_index))
        .unwrap_or(false);
    if part_used {
        panic!("Part already used");
    }

    // Mark this part as used
    env.storage().persistent().set(&DataKey::PartialFillUsed(hashed_secret.clone(), part_index), &true);

    // Get factory address and create destination escrow
    let factory_address: Address = env.storage().instance().get(&DataKey::EscrowFactory).unwrap();
    let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
    
    // Create destination escrow using factory client with partial fill support
    let escrow_address = factory_client.create_dst_escrow_partial(
        &env.current_contract_address(), // creator (resolver)
        &hashed_secret,                  // Merkle root
        &recipient,
        &buyer,
        &token_amount,                   // Segment destination amount
        &withdrawal_start,
        &public_withdrawal_start,
        &cancellation_start,
        &public_cancellation_start,
        &part_index,                     // Segment index
        &total_parts,                    // Total segments
    );

    // Track the destination escrow creation
    let mut dst_escrows: Vec<Address> = env.storage()
        .persistent()
        .get(&DataKey::DestinationEscrows(hashed_secret.clone()))
        .unwrap_or(Vec::new(&env));
    dst_escrows.push_back(escrow_address.clone());
    env.storage().persistent().set(&DataKey::DestinationEscrows(hashed_secret.clone()), &dst_escrows);

    escrow_address
}
```

#### Partial Fill Tracking and State Management

The system maintains comprehensive tracking of partial fill segments across both chains:

**Ethereum Partial Fill Tracking:**
```solidity
// From EscrowFactory.sol lines 45-50
contract HashLockedEscrowFactory is ReentrancyGuard {
    // Partial fill tracking
    mapping(bytes32 => mapping(uint256 => bool)) public partialFillsUsed; // hashLock => index => used
    mapping(bytes32 => uint256) public partialFillsCount; // hashLock => filled count
    
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
}
```

**Stellar Partial Fill Tracking:**
```rust
// From limit-order-protocol/src/lib.rs lines 111-119
pub struct FilledOrder {
    pub order_hash: BytesN<32>,
    pub maker: Address,
    pub recipient: Address,
    pub escrow_address: Address,
    pub part_index: u64,        // Segment index
    pub total_parts: u32,       // Total segments
    pub is_active: bool,
}
```

#### Cross-Chain Partial Fill Coordination

Partial fill escrow creation ensures perfect coordination between chains and segments:

**Coordination Requirements:**
- **Merkle Root Consistency**: Same Merkle root used across all segments on both chains
- **Segment Synchronization**: Each segment maintains identical partIndex and totalParts
- **Amount Distribution**: Total order amount is evenly distributed across segments
- **Time Lock Synchronization**: All segments use identical time lock parameters

**Segment Execution Flow:**
1. **Segment Auction**: Each segment is auctioned independently
2. **Winner Assignment**: Different resolvers can win different segments
3. **Escrow Creation**: Each winner creates escrows for their segment
4. **Merkle Verification**: Withdrawal requires valid Merkle proof for the specific segment
5. **Atomic Completion**: All segments must complete successfully for the full order

**Error Handling for Partial Fills:**
- **Duplicate Segments**: Rejected if segment index is already used
- **Invalid Part Index**: Rejected if partIndex >= totalParts
- **Missing Merkle Proof**: Rejected if Merkle proof is required but not provided
- **Invalid Merkle Proof**: Rejected if Merkle proof verification fails
- **Incomplete Segments**: Order remains active until all segments are filled

---

## Validation and Checking

### Overview

Validation and Checking represents the critical verification phase in StellarFusion's cross-chain atomic swap process. After escrow creation, resolvers must notify the relayer of their escrow deployments, which then performs comprehensive verification to ensure both source and destination escrows are properly created before proceeding with the secret exchange phase.

This validation process ensures the integrity of the atomic swap by verifying that:
- Both escrows are deployed on their respective chains
- Escrows contain the correct token amounts
- Escrows use identical cryptographic parameters
- Transactions are recent and valid

**Verification Criteria:**
- **Transaction Existence**: Internal transactions to escrow address
- **Recent Activity**: Transactions within reasonable time window
- **Address Validation**: Correct escrow contract address
- **Funding Verification**: Account credited with destination tokens
- **Effect Validation**: Transaction effects show proper funding

### Partial Fill Validation

For partial fill orders, the validation process includes segment-specific verification:

**Segment Validation Requirements:**
- **Segment ID Validation**: segmentId must be between 1 and 4
- **Order Type Verification**: Order must be marked as "partialfill"
- **Segment-Specific Escrows**: Each segment has independent escrow verification
- **Merkle Tree Consistency**: All segments use the same Merkle root

### Real-Time Status Updates

The relayer provides real-time status updates through WebSocket events:

**Escrow Created Event:**
```javascript
// From server.js lines 1977-1986
const eventData = {
  type: `${escrowType}_escrow_created`,
  orderId: orderId,
  escrowAddress: escrowAddress,
  transactionHash: transactionHash,
  segmentId: segmentId,
  timestamp: new Date().toISOString()
};

global.auctionServer.broadcastToAll(eventData);
```
### Security Considerations

The validation process includes multiple security measures:

**Data Integrity:**
- **Transaction Hash Verification**: All escrow notifications include transaction hashes
- **Address Validation**: Escrow addresses are validated against blockchain state
- **Amount Verification**: Token amounts are verified against order requirements
- **Time Window Validation**: Only recent transactions are considered valid

**Prevention of Attacks:**
- **Double-Spending Prevention**: Verification ensures escrows are actually funded
- **Replay Attack Prevention**: Transaction timestamps prevent old transaction reuse
- **Invalid Escrow Prevention**: Address validation prevents fake escrow notifications
- **Amount Manipulation Prevention**: Amount verification prevents insufficient funding

---
