# StellarFusion: An Intent-Based Cross-Chain Atomic Swap Platform
<img width="1024" height="1024" alt="589860EB-794D-42CB-938B-53355DF79665" src="https://github.com/user-attachments/assets/a821ff01-fadd-4327-804f-972fdd36bc91" />


## Table of Contents

1. [Introduction](#introduction)

2. [Important Files](#important-files)

3. [Deployed Contract Addresses](#deployed-contract-addresses)

4. [Swap Results](#swap-results)

5. [Order Creation](#order-creation)
   - [Fusion+ Swaps](#fusion-swaps)
   - [Partial Fills](#partial-fills)

6. [Dutch Auction](#dutch-auction)

7. [Escrow Creations](#escrow-creations)
   - [Escrow Creations in Fusion+ Swaps](#escrow-creations-in-fusion-swaps)
   - [Escrow Creations in Partial Fills](#escrow-creations-in-partial-fills)

8. [Validation and Checking](#validation-and-checking)

9. [Secret Exchange](#secret-exchange)

10. [Withdrawal](#withdrawal)

11. [Conclusion](#conclusion)

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

## Important Files

### Smart Contracts
- **Ethereum Contracts**: [EscrowFactory.sol](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/contracts/EscrowFactory.sol) - Factory contract for creating hash-locked escrows
- **Stellar Contracts**: [Escrow Factory](https://github.com/SamFelix03/StellarFusion/tree/master/Blockend/stellar-contracts/escrow-factory) - Soroban smart contracts for Stellar-side escrows
- **Stellar LOP Contract**: [limit-order-protocol](https://github.com/SamFelix03/StellarFusion/tree/master/Blockend/stellar-contracts/escrow-factory/contracts/limit-order-protocol) - Limit Order Protocol integration

### Backend Services
- **Relayer Server**: [server.js](https://github.com/SamFelix03/StellarFusion/blob/master/relayer/server.js) - Dutch auction coordination and cross-chain validation

### CLI Tools
- **CLI Demo**: [dynamic-swap.ts](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/src/dynamic-swap.ts) - Interactive command-line interface for testing swaps

### Frontend Components
- **Resolver Contracts**: [resolver-contracts.ts](https://github.com/SamFelix03/StellarFusion/blob/master/frontend/lib/resolver-contracts.ts) - Contract interaction utilities
- **Resolver Execution Modal**: [ResolverExecutionModal.tsx](https://github.com/SamFelix03/StellarFusion/blob/master/frontend/components/ResolverExecutionModal.tsx) - UI for resolver operations
- **Auction Client**: [auction-client.ts](https://github.com/SamFelix03/StellarFusion/blob/master/frontend/lib/auction-client.ts) - WebSocket client for real-time auction updates

### Utility Files
- **Order Utils**: [order-utils.ts](https://github.com/SamFelix03/StellarFusion/blob/master/frontend/lib/order-utils.ts) - Order creation and secret management
- **Hash Lock**: [hash-lock.ts](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/src/hash-lock.ts) - SHA256 hash lock implementation

## Deployed Contract Addresses

### Ethereum Sepolia Testnet
- **Factory Contract**: `0x4F25B17649F0A056138E251487c27A22D793DBA7`
- **LOP Contract**: `0x13F4118A0C9AA013eeB078f03318aeea84469cDD`

### Stellar Testnet
- **Factory Contract**: `CD3TAVDMTRSPT475FP2APSC3MRQFOHVKEMJYPUGGQRP3KS4B5UBPCFH6`
- **LOP Contract**: `CCFLX4NZH4MVTQ5DYO74LEB3S7U2GO6OH3VP4NPYF4CXXSXR4GPRXEXV`

## Swap Results

### Successful Cross-Chain Swap Transactions

**Part 1 Transactions:**
- **Stellar Source Escrow Creation**: [239fdd28a1847f860c8908636763fc7744290e7131cb45751224c3a94fcc98a7](https://stellar.expert/explorer/testnet/tx/239fdd28a1847f860c8908636763fc7744290e7131cb45751224c3a94fcc98a7)
- **Ethereum Destination Escrow Creation**: [0x4bd8638a50daa0cb39a235e20dc5a9a55340d2a92579618c85b157f164c3d3ac](https://sepolia.etherscan.io/tx/0x4bd8638a50daa0cb39a235e20dc5a9a55340d2a92579618c85b157f164c3d3ac)
- **Stellar Source Withdrawal**: [30ffc4bc1bce688cf5214aa9df3fedc142c34230be95e0bdd7240cbfdef6190d](https://stellar.expert/explorer/testnet/tx/30ffc4bc1bce688cf5214aa9df3fedc142c34230be95e0bdd7240cbfdef6190d)
- **Ethereum Destination Withdrawal**: [0xa83fffc99e07ca10b328b9181e4bed55bd5a5d5f7c0a3bfe73f3a10d6ea6377a](https://sepolia.etherscan.io/tx/0xa83fffc99e07ca10b328b9181e4bed55bd5a5d5f7c0a3bfe73f3a10d6ea6377a)

**Part 2 Transactions:**
- **Stellar Source Escrow Creation**: [5a0a052789a903e19f4e510a39eb0931a79d088488654b5eed11d2ec6746c69d](https://stellar.expert/explorer/testnet/tx/5a0a052789a903e19f4e510a39eb0931a79d088488654b5eed11d2ec6746c69d)
- **Ethereum Destination Escrow Creation**: [0x7a11bfccbc125c625bbd7764a9af3f107664ee22acb958649f43045043a79d6e](https://sepolia.etherscan.io/tx/0x7a11bfccbc125c625bbd7764a9af3f107664ee22acb958649f43045043a79d6e)
- **Stellar Source Withdrawal**: [81126b251e89114539509f541bdee598f4fee1d6c07094088f3f420c551b09a4](https://stellar.expert/explorer/testnet/tx/81126b251e89114539509f541bdee598f4fee1d6c07094088f3f420c551b09a4)
- **Ethereum Destination Withdrawal**: [0xacfdc6e2424363da2573f1fc9fb9242816e1d3a03502c59ca91b421471771ed5](https://sepolia.etherscan.io/tx/0xacfdc6e2424363da2573f1fc9fb9242816e1d3a03502c59ca91b421471771ed5)

[Click here to see logs of a successful swap transaction](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/logs/success-log.md)

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

**Core Hash Lock Implementation** ([hash-lock.ts](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/src/hash-lock.ts)):
```typescript
public static hashSecret(secret: string): string {
    const hash = createHash('sha256');
    hash.update(Buffer.from(secret.slice(2), 'hex'));
    return '0x' + hash.digest('hex');
}
```

#### Relayer Integration

The frontend sends order data to the relayer through the `sendOrderToRelayer()` function ([order-utils.ts](https://github.com/SamFelix03/StellarFusion/blob/master/frontend/lib/order-utils.ts)):

```typescript
export async function sendOrderToRelayer(orderData: OrderData, isPartialFill: boolean): Promise<any> {
  const endpoint = isPartialFill ? 'http://localhost:8000/partialfill' : 'http://localhost:8000/create';
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: orderData.orderId,
      buyerAddress: orderData.buyerAddress,
      hashedSecret: orderData.hashedSecret,
      srcChainId: orderData.srcChainId,
      dstChainId: orderData.dstChainId,
      srcToken: orderData.srcToken,
      dstToken: orderData.dstToken,
      srcAmount: orderData.srcAmount,
      dstAmount: orderData.dstAmount
    }),
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

The `createOrder()` function generates partial fill orders with Merkle tree implementation ([order-utils.ts](https://github.com/SamFelix03/StellarFusion/blob/master/frontend/lib/order-utils.ts)):

```typescript
export function createOrder(params: OrderCreationParams): OrderData {
  let secret: string;
  let hashedSecret: string;

  if (params.enablePartialFills && params.partsCount > 1) {
    // Create partial fill manager with merkle tree
    const partialFillManager = new PartialFillOrderManager(params.partsCount);
    hashedSecret = partialFillManager.getHashLock();
    secret = partialFillManager.getSecret(0);
  } else {
    // Single fill logic
    const secretBytes = ethers.utils.randomBytes(32);
    secret = ethers.utils.hexlify(secretBytes);
    hashedSecret = ethers.utils.sha256(secretBytes);
  }
  
  return {
    orderId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(Date.now().toString())),
    buyerAddress: params.buyerAddress,
    srcChainId: chainsConfig[params.sourceChain].chainId,
    dstChainId: chainsConfig[params.destinationChain].chainId,
    hashedSecret,
    secret,
    isPartialFillEnabled: params.enablePartialFills
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

The auction system maintains real-time communication with resolvers through WebSocket connections ([server.js](https://github.com/SamFelix03/StellarFusion/blob/master/relayer/server.js)):

```javascript
this.broadcastToAll({
  type: 'single_auction_update',
  orderId: orderId,
  currentPrice: Math.round(auction.currentPrice * 100) / 100,
  hashedSecret: auction.hashedSecret,
  buyerAddress: auction.buyerAddress
});
```

#### Auction Completion

Upon completion, the system updates the order status and broadcasts final results ([server.js](https://github.com/SamFelix03/StellarFusion/blob/master/relayer/server.js)):

```javascript
const auctionData = {
  winner: auction.winner || null,
  finalPrice: Math.floor(auction.currentPrice),
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

Each segment operates independently with its own price reduction mechanism ([server.js](https://github.com/SamFelix03/StellarFusion/blob/master/relayer/server.js)):

```javascript
const interval = setInterval(() => {
  if (segment.winner) {
    clearInterval(interval);
    return;
  }
  
  // Calculate price reduction (5% of current price)
  const priceReduction = segment.currentPrice * 0.05;
  segment.currentPrice = Math.max(segment.endPrice, segment.currentPrice - priceReduction);
  
  this.broadcastToAll({
    type: 'segment_update',
    orderId: orderId,
    segmentId: segmentId,
    currentPrice: Math.round(segment.currentPrice * 100) / 100
  });
}, 10000);
```

#### Segment Winner Determination

Each segment can have its own winner, allowing for distributed execution ([server.js](https://github.com/SamFelix03/StellarFusion/blob/master/relayer/server.js)):

```javascript
if (segment && segment.status === 'active' && !segment.winner) {
  segment.winner = data.name;
  console.log(`🎉 SEGMENT ${segmentId} WINNER: ${data.name} confirmed!`);
  this.endSegment(confirmOrderId, segmentId, 'completed');
}
```

#### Comprehensive Auction Results

Upon completion of all segments, the system calculates comprehensive results ([server.js](https://github.com/SamFelix03/StellarFusion/blob/master/relayer/server.js)):

```javascript
const totalWinners = auction.totalWinners.filter(win => win.winner !== null).length;
const totalAmount = auction.totalWinners.reduce((sum, win) => sum + win.amount, 0);

console.log(`📊 SEGMENTED AUCTION RESULTS for order ${orderId}:`);
console.log(`🏆 Total winners: ${totalWinners}`);
console.log(`💰 Total amount: ${totalAmount}`);
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

**Factory Contract Implementation** ([EscrowFactory.sol](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/contracts/EscrowFactory.sol)):
```solidity
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
    
    // Create and deploy escrow contract
    SourceEscrow escrow = new SourceEscrow{value: msg.value}(
        buyer, recipient, hashedSecret, WETH, tokenAmount,
        withdrawalStart, publicWithdrawalStart, cancellationStart, publicCancellationStart,
        partIndex, totalParts
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

**Security Deposit Implementation** ([EscrowFactory.sol](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/contracts/EscrowFactory.sol)):
```solidity
contract HashLockedEscrowFactory is ReentrancyGuard {
    uint256 public constant DEPOSIT_AMOUNT = 0.001 ether;
    
    function createSrcEscrow(...) external payable nonReentrant {
        require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
    }
}
```

#### Cross-Chain Source Escrow Creation

The winner creates the source escrow on the source chain (which could be Ethereum, Stellar, or any supported chain) through the appropriate factory contract:

**Ethereum Source Escrow Creation** ([EscrowFactory.sol](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/contracts/EscrowFactory.sol)):
```solidity
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
    
    // Create SourceEscrow contract
    SourceEscrow escrow = new SourceEscrow{value: msg.value}(
        buyer, recipient, hashedSecret, WETH, tokenAmount,
        withdrawalStart, publicWithdrawalStart, cancellationStart, publicCancellationStart,
        partIndex, totalParts
    );

    // Transfer tokens from buyer to escrow
    IERC20(WETH).transferFrom(buyer, address(escrow), tokenAmount);
    
    emit SrcEscrowCreated(buyer, recipient, address(escrow), hashedSecret, tokenAmount);
}
```

**Stellar Source Escrow Creation** ([limit-order-protocol/src/lib.rs](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/stellar-contracts/escrow-factory/contracts/limit-order-protocol/src/lib.rs)):
```rust
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
    // Validate allowance
    let current_allowance = Self::allowance(env.clone(), maker.clone(), env.current_contract_address());
    if current_allowance < token_amount {
        panic!("Insufficient allowance");
    }

    // Get factory and create escrow
    let factory_address: Address = env.storage().instance().get(&DataKey::EscrowFactory).unwrap();
    let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
    
    let escrow_address = factory_client.create_src_escrow_partial(
        &env.current_contract_address(),
        &hashed_secret,
        &recipient,
        &maker,
        &token_amount,
        &withdrawal_start,
        &public_withdrawal_start,
        &(withdrawal_start + 86400),
        &part_index,
        &total_parts,
    );

    // Mark part as filled
    env.storage().persistent().set(&DataKey::PartsFilled(order_hash.clone(), part_index), &true);
    escrow_address
}
```

#### Cross-Chain Destination Escrow Creation

The winner creates the destination escrow on the destination chain through the appropriate factory contract:

**Ethereum Destination Escrow Creation** ([EscrowFactory.sol](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/contracts/EscrowFactory.sol)):
```solidity
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

    // Create DestinationEscrow contract
    DestinationEscrow escrow = new DestinationEscrow{value: msg.value}(
        msg.sender, recipient, hashedSecret, WETH, tokenAmount,
        withdrawalStart, publicWithdrawalStart, cancellationStart,
        partIndex, totalParts
    );

    IERC20(WETH).transferFrom(msg.sender, address(escrow), tokenAmount);
    emit DstEscrowCreated(msg.sender, recipient, address(escrow), hashedSecret, tokenAmount);
}
```

**Stellar Destination Escrow Creation** ([resolver/src/lib.rs](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/stellar-contracts/escrow-factory/contracts/resolver/src/lib.rs)):
```rust
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
    caller.require_auth();

    // Get factory and create destination escrow
    let factory_address: Address = env.storage().instance().get(&DataKey::EscrowFactory).unwrap();
    let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
    
    let escrow_address = factory_client.create_dst_escrow_partial(
        &caller,
        &hashed_secret,
        &recipient,
        &amount,
        &withdrawal_start,
        &public_withdrawal_start,
        &cancellation_start,
        &part_index,
        &total_parts,
    );

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

**Withdrawal Implementation** ([EscrowFactory.sol](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/contracts/EscrowFactory.sol)):
```solidity
function withdraw(bytes calldata secret) external nonReentrant {
    require(sha256(secret) == hashedSecret, "Invalid secret");
    fundsWithdrawn = true;
    // Transfer funds and security deposit to caller
}
```

**Reentrancy Protection:**
- **NonReentrant Modifier**: Prevents reentrancy attacks on all critical functions
- **State Changes**: State variables are updated before external calls
- **Checks-Effects-Interactions Pattern**: Strict adherence to security patterns

**Reentrancy Protection Implementation** ([EscrowFactory.sol](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/contracts/EscrowFactory.sol)):
```solidity
function createSrcEscrow(...) external payable nonReentrant {
    require(msg.value == DEPOSIT_AMOUNT, "Incorrect ETH deposit");
    // Validation and state changes before external calls
}
```

#### Escrow State Management

The system maintains comprehensive state tracking for each escrow:

**Source Escrow State Variables** ([EscrowFactory.sol](https://github.com/SamFelix03/StellarFusion/blob/master/Blockend/contracts/EscrowFactory.sol)):
```solidity
contract SourceEscrow is ReentrancyGuard {
    address public immutable creator;
    address public immutable recipient;
    bytes32 public immutable hashedSecret;
    uint256 public immutable amount;
    uint256 public immutable withdrawalStart;
    uint256 public immutable publicWithdrawalStart;
    uint256 public immutable cancellationStart;
    
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

## Secret Exchange

### Overview

Secret Exchange represents the critical phase in StellarFusion's cross-chain atomic swap process where cryptographic secrets are shared between parties to enable the final withdrawal phase. After the relayer verifies that both source and destination escrows are properly created and funded, it signals the buyer to reveal the secret (for single orders) or a segment-specific secret (for partial fill orders).

This secret exchange process ensures the atomic execution of cross-chain swaps by providing the cryptographic proof necessary to unlock funds from both escrows simultaneously.

### Secret Exchange Flow

The secret exchange process follows a structured flow that ensures secure and timely secret revelation:

#### 1. Resolver Secret Request

After successful escrow verification, resolvers request the secret through the `/resolver/request-secret` endpoint:

**Endpoint:** `POST /resolver/request-secret`

**Request Body:**
```json
{
  "orderId": "0x...",           // Unique order identifier
  "segmentId": 1                // Optional: segment ID for partial fills
}
```

**Verification Response:**
```json
{
  "success": true,
  "message": "Secret requested successfully",
  "data": {
    "orderId": "0x...",
    "segmentId": 1,
    "verification": {
      "ethResult": true,
      "xlmResult": true,
      "overallResult": true
    },
    "timestamp": "2024-01-15T10:35:00.000Z"
  }
}
```

#### 2. Relayer Status Update

Upon successful verification, the relayer updates the order status and broadcasts a WebSocket event:

```javascript
// From server.js lines 2490-2500
const eventData = {
  type: segmentId ? 'segment_secret_requested' : 'secret_requested',
  orderId: orderId,
  segmentId: segmentId,
  timestamp: new Date().toISOString()
};

global.auctionServer.broadcastToAll(eventData);
```

#### 3. Buyer Secret Sharing

The buyer receives the secret request notification and shares the appropriate secret through the relayer:

**For Single Fill Orders:**
```typescript
// From order-utils.ts lines 507-545
export async function shareSecretsWithRelayer(orderData: OrderData): Promise<any> {
  console.log('🔐 SHARING SECRETS WITH RELAYER');
  console.log('📋 Order ID:', orderData.orderId);
  
  // Only handle single fill orders - partial fills use shareSegmentSecret
  if (orderData.isPartialFillEnabled) {
    throw new Error('Partial fill orders should use shareSegmentSecret() instead of shareSecretsWithRelayer()');
  }
  
  try {
    // For single fill orders, send the main secret
    console.log('🔑 Sharing single fill secret...');
    
    const response = await fetch(`http://localhost:8000/orders/${orderData.orderId}/secret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        secret: orderData.secret,
        hashedSecret: orderData.hashedSecret 
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Main secret shared successfully');
    return result;
    
  } catch (error) {
    console.error('❌ Error sharing secrets with relayer:', error);
    throw new Error(`Failed to share secrets: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**For Partial Fill Orders:**
```typescript
// From order-utils.ts lines 554-605
export async function shareSegmentSecret(orderId: string, segmentId: number, orderData: OrderData): Promise<any> {
  console.log('🔐 SHARING SPECIFIC SEGMENT SECRET');
  console.log('📋 Order ID:', orderId);
  console.log('📋 Segment ID:', segmentId);
  
  if (!orderData.isPartialFillEnabled || !orderData.partialFillSecrets || !orderData.partialFillSecretHashes) {
    throw new Error('Order is not a partial fill order or missing segment data');
  }
  
  // Validate segment ID
  if (segmentId < 1 || segmentId > orderData.partialFillSecrets.length) {
    throw new Error(`Invalid segment ID: ${segmentId}. Must be between 1 and ${orderData.partialFillSecrets.length}`);
  }
  
  // Get the specific segment secret (segmentId is 1-based, array is 0-based)
  const secretIndex = segmentId - 1;
  const secret = orderData.partialFillSecrets[secretIndex];
  const hashedSecret = orderData.partialFillSecretHashes![secretIndex];
  
  console.log(`🔐 Sharing secret for segment ${segmentId}:`);
  console.log(`   Secret: ${secret.slice(0, 10)}...`);
  console.log(`   Hash: ${hashedSecret.slice(0, 10)}...`);
  
  try {
    const response = await fetch(`http://localhost:8000/orders/${orderId}/segment-secret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        segmentId: segmentId,
        secret: secret,
        hashedSecret: hashedSecret
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Segment secret shared successfully');
    return result;
    
  } catch (error) {
    console.error('❌ Error sharing segment secret:', error);
    throw new Error(`Failed to share segment secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

### Resolver Secret Retrieval

Resolvers poll the relayer to retrieve secrets after they have been shared by the buyer:

#### Secret Polling Process

```typescript
// From resolver-contracts.ts lines 1290-1350
async requestSecretFromBuyer(
  orderId: string,
  segmentId?: number
): Promise<ExecutionResult & { secret?: string }> {
  try {
    console.log('🔑 Requesting secret from buyer for order:', orderId, segmentId ? `segment ${segmentId}` : '')
    
    // Step 1: Request secret from relayer
    const requestResponse = await fetch(`http://localhost:8000/resolver/request-secret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId,
        segmentId
      })
    });

    if (!requestResponse.ok) {
      throw new Error(`Failed to request secret: ${requestResponse.statusText}`);
    }

    console.log('📞 Secret request sent to relayer successfully')
    console.log('⏳ Waiting for buyer to share secret...')
    
    // Step 2: Poll for secret (in a real implementation, this would be WebSocket-based)
    let attempts = 0
    const maxAttempts = 60 // 5 minutes with 5-second intervals
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      
      // Check if secret has been shared
      const checkResponse = await fetch(`http://localhost:8000/orders/${orderId}`)
      if (checkResponse.ok) {
        const orderData = await checkResponse.json()
        const order = orderData.data
        
        if (segmentId) {
          // Check for segment secret
          if (order.segmentSecrets) {
            const segmentSecrets = JSON.parse(order.segmentSecrets)
            const segmentSecret = segmentSecrets.find((s: any) => s.segmentId === segmentId)
            if (segmentSecret && segmentSecret.secret) {
              console.log('✅ Segment secret received from buyer')
              return {
                success: true,
                secret: segmentSecret.secret,
                message: `Segment ${segmentId} secret received successfully`
              }
            }
          }
        } else {
          // Check for main secret
          if (order.secret) {
            console.log('✅ Main secret received from buyer')
            return {
              success: true,
              secret: order.secret,
              message: 'Main secret received successfully'
            }
          }
        }
      }
      
      attempts++
      console.log(`⏳ Waiting for secret... (attempt ${attempts}/${maxAttempts})`)
    }
    
    throw new Error('Timeout waiting for buyer to share secret')
    
  } catch (error) {
    console.error('❌ Secret request failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Secret request failed'
    }
  }
}
```

#### Secret Retrieval Response

**Single Fill Secret Response:**
```json
{
  "success": true,
  "secret": "0x...",
  "message": "Main secret received successfully"
}
```

**Partial Fill Secret Response:**
```json
{
  "success": true,
  "secret": "0x...",
  "message": "Segment 1 secret received successfully"
}
```

### Real-Time Secret Exchange Events

The relayer provides real-time updates through WebSocket events during the secret exchange process:

#### Secret Requested Event
```javascript
// From server.js lines 2490-2500
const eventData = {
  type: segmentId ? 'segment_secret_requested' : 'secret_requested',
  orderId: orderId,
  segmentId: segmentId,
  timestamp: new Date().toISOString()
};

global.auctionServer.broadcastToAll(eventData);
```

#### Secret Shared Event
```javascript
// From server.js lines 1670-1680
const eventData = {
  type: segmentId ? 'segment_secret_shared' : 'secret_shared',
  orderId: orderId,
  segmentId: segmentId,
  timestamp: new Date().toISOString()
};

global.auctionServer.broadcastToAll(eventData);
```

### Partial Fill Secret Management

Partial fill orders require sophisticated secret management to handle multiple segments:

#### Segment Secret Structure
```json
{
  "segmentSecrets": [
    {
      "segmentId": 1,
      "secret": "0x...",
      "hashedSecret": "0x..."
    },
    {
      "segmentId": 2,
      "secret": "0x...",
      "hashedSecret": "0x..."
    },
    {
      "segmentId": 3,
      "secret": "0x...",
      "hashedSecret": "0x..."
    },
    {
      "segmentId": 4,
      "secret": "0x...",
      "hashedSecret": "0x..."
    }
  ]
}
```

#### Segment-Specific Secret Sharing

Each segment can be shared independently, allowing for flexible execution:

```typescript
// From SwapInterface.tsx lines 586-620
const handleShareSecret = async (orderId: string, segmentId?: number) => {
  try {
    setSharingSecret(true);
    
    if (segmentId) {
      // Share segment secret for partial fills
      await shareSegmentSecret(orderId, segmentId, orderData)
    } else {
      // Share main secret for single fills
      await shareSecretsWithRelayer(orderData)
    }
    
    toast({
      title: "Secret Shared Successfully",
      description: segmentId ? `Segment ${segmentId} secret shared` : "Main secret shared",
    });
    
  } catch (error) {
    console.error('Error sharing secret:', error);
    toast({
      title: "Failed to Share Secret",
      description: error instanceof Error ? error.message : "Failed to share secret",
      variant: "destructive",
    });
  } finally {
    setSharingSecret(false);
  }
};
```

### Security Considerations

The secret exchange process includes multiple security measures:

#### Cryptographic Security
- **Secret Generation**: Cryptographically secure random 32-byte secrets
- **Hash Verification**: SHA256 hashing ensures cross-chain compatibility
- **Secret Validation**: All secrets are validated against their hashes before storage
- **Secure Transmission**: HTTPS encryption for all secret transmission

#### Access Control
- **Order Ownership**: Only the original buyer can share secrets
- **Segment Isolation**: Each segment secret is independent and isolated
- **Time-Limited Access**: Secrets are only available during the withdrawal window
- **Audit Trail**: All secret operations are logged for security monitoring

#### Error Handling
- **Invalid Secrets**: Rejected if secret doesn't match hash
- **Duplicate Segments**: Prevented for partial fill orders
- **Timeout Protection**: Automatic timeout if secrets aren't shared

---

## Withdrawal

The withdrawal process is the final step in the atomic swap execution, where funds are released from escrow contracts using the shared secret. StellarFusion implements a multi-stage timelock system with hash-locked escrows to ensure secure and atomic cross-chain transfers.

### Time Lock System

StellarFusion uses a four-tier time lock system to ensure secure atomic execution:

```typescript
// Time lock parameters (in seconds)
const TIME_LOCKS = {
  WITHDRAWAL_START: 60,        // 1 minute - withdrawal begins
  PUBLIC_WITHDRAWAL: 300,      // 5 minutes - public withdrawal window
  CANCELLATION_START: 600,     // 10 minutes - cancellation begins
  PUBLIC_CANCELLATION: 900     // 15 minutes - public cancellation
};
```

#### Time Lock Stages

1. **Private Withdrawal Window** (1-5 minutes): Only authorized parties can withdraw
2. **Public Withdrawal Window** (5-10 minutes): Anyone with the secret can withdraw
3. **Private Cancellation Window** (10-15 minutes): Only creator can cancel
4. **Public Cancellation Window** (15+ minutes): Anyone can cancel

### Hash Lock Implementation

The withdrawal process relies on SHA256 hash locks for cross-chain compatibility:

```typescript
// From hash-lock.ts
public static hashSecret(secret: string): string {
    if (!secret.startsWith('0x') || secret.length !== 66) {
        throw new Error('secret must be 32 bytes hex encoded with 0x prefix');
    }
    
    const hash = createHash('sha256');
    hash.update(Buffer.from(secret.slice(2), 'hex'));
    return '0x' + hash.digest('hex');
}
```

### Ethereum Source Escrow Withdrawal

Source escrows hold the seller's funds on Ethereum and are withdrawn by the resolver:

#### Withdrawal Function
```solidity
// From EscrowFactory.sol lines 295-325
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
    
    // Transfer security deposit to caller (resolver)
    (bool depositSuccess, ) = msg.sender.call{value: securityDeposit}("");
    require(depositSuccess, "ETH transfer failed");
    
    emit Withdrawal(msg.sender, secret);
}
```

#### Partial Fill Support
```solidity
// From EscrowFactory.sol lines 328-365
function withdrawWithProof(
    bytes calldata secret,
    bytes32[] calldata merkleProof
) external nonReentrant {
    require(isPartialFill, "Use withdraw() for complete fills");
    
    // Verify merkle proof for partial fills
    bytes32 secretHash = sha256(secret);
    bytes32 leaf = PartialFillHelper.generateLeaf(partIndex, secretHash);
    require(MerkleProof.verify(merkleProof, hashedSecret, leaf), "Invalid merkle proof");
    
    // Same withdrawal logic as above
}
```

### Ethereum Destination Escrow Withdrawal

Destination escrows hold the buyer's funds on the destination chain (BSC):

#### Key Differences from Source Escrow
```solidity
// From EscrowFactory.sol lines 480-520
function withdraw(bytes calldata secret) external nonReentrant {
    // Same validation logic as source escrow
    
    // During private window, both recipient (buyer) and creator (resolver) can withdraw
    if (block.timestamp < publicWithdrawalStart) {
        require(msg.sender == recipient || msg.sender == creator, 
                "Only recipient or creator in private window");
    }
    
    // Funds ALWAYS go to recipient (buyer), regardless of who calls
    IWETH(token).withdraw(amount);
    (bool success, ) = recipient.call{value: amount}("");
    require(success, "BNB transfer failed");
    
    // Security deposit goes to caller (resolver if resolver calls, buyer if buyer calls)
    (bool depositSuccess, ) = msg.sender.call{value: securityDeposit}("");
    require(depositSuccess, "BNB transfer failed");
}
```

### Stellar Source Escrow Withdrawal

Stellar source escrows use the same time lock and hash lock principles:

#### Withdrawal Implementation
```rust
// From lib.rs lines 360-415
pub fn withdraw_src_escrow(
    env: Env,
    caller: Address,
    escrow_address: Address,
    secret: Bytes,
) {
    caller.require_auth();
    
    let mut escrow_data: SourceEscrowData = env.storage()
        .persistent()
        .get(&DataKey::SourceEscrow(escrow_address.clone()))
        .unwrap_or_else(|| panic!("Invalid address"));
    
    // Validate escrow state and time locks
    if escrow_data.funds_withdrawn {
        panic!("Already withdrawn");
    }
    if escrow_data.cancelled {
        panic!("Already cancelled");
    }
    
    let current_time = env.ledger().timestamp();
    if current_time < escrow_data.withdrawal_start {
        panic!("Withdrawal not started");
    }
    if current_time >= escrow_data.cancellation_start {
        panic!("Withdrawal ended");
    }
    
    // Private window check - only recipient (resolver) can withdraw
    if current_time < escrow_data.public_withdrawal_start {
        if caller != escrow_data.recipient {
            panic!("Only recipient in private window");
        }
    }
    
    // Verify secret using SHA256
    let computed_hash = env.crypto().sha256(&secret);
    let computed_bytes = BytesN::from_array(&env, &computed_hash.to_array());
    if computed_bytes != escrow_data.hashed_secret {
        panic!("Invalid secret");
    }
    
    // Mark as withdrawn and transfer funds
    escrow_data.funds_withdrawn = true;
    env.storage().persistent().set(&DataKey::SourceEscrow(escrow_address.clone()), &escrow_data);
    
    // Transfer funds to caller (resolver)
    Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &caller, escrow_data.amount, false);
    
    // Transfer security deposit to caller (resolver)
    Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &caller, escrow_data.security_deposit, false);
}
```

### Stellar Destination Escrow Withdrawal

Stellar destination escrows mirror the Ethereum destination escrow behavior:

#### Key Features
```rust
// From lib.rs lines 485-540
pub fn withdraw_dst_escrow(
    env: Env,
    caller: Address,
    escrow_address: Address,
    secret: Bytes,
) {
    // Same validation logic as source escrow
    
    // Check private window - both recipient (buyer) and creator (resolver) can withdraw
    if current_time < escrow_data.public_withdrawal_start {
        if caller != escrow_data.recipient && caller != escrow_data.creator {
            panic!("Private window only");
        }
    }
    
    // Transfer funds to recipient (buyer) regardless of who calls - matches EVM behavior
    Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.recipient, escrow_data.amount, false);
    
    // Transfer security deposit to caller
    Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &caller, escrow_data.security_deposit, false);
}
```

### Cancellation and Rescue Mechanisms

Both Ethereum and Stellar contracts include cancellation and rescue functions:

#### Cancellation
```solidity
// From EscrowFactory.sol lines 370-405
function cancel() external nonReentrant {
    require(!fundsWithdrawn, "Funds already withdrawn");
    require(!cancelled, "Already cancelled");
    require(block.timestamp >= cancellationStart, "Cancellation not started");
    require(block.timestamp < publicCancellationStart, "Private cancellation ended");
    require(msg.sender == creator, "Only creator can cancel");
    
    cancelled = true;
    
    // Return funds to creator
    IWETH(token).withdraw(amount);
    (bool success, ) = creator.call{value: amount}("");
    require(success, "ETH transfer failed");
    
    // Refund security deposit to creator
    (bool depositSuccess, ) = creator.call{value: securityDeposit}("");
    require(depositSuccess, "ETH transfer failed");
}
```

#### Rescue Function
```solidity
// From EscrowFactory.sol lines 405-430
function rescue() external nonReentrant {
    require(!fundsWithdrawn, "Funds already withdrawn");
    require(!cancelled, "Already cancelled");
    require(block.timestamp >= publicCancellationStart + RESCUE_DELAY, "Rescue not available");
    require(msg.sender == recipient, "Only recipient can rescue");
    
    fundsWithdrawn = true;
    
    // Transfer funds to recipient
    IWETH(token).withdraw(amount);
    (bool success, ) = recipient.call{value: amount}("");
    require(success, "ETH transfer failed");
    
    // Refund security deposit to creator
    (bool depositSuccess, ) = creator.call{value: securityDeposit}("");
    require(depositSuccess, "ETH transfer failed");
}
```

### Withdrawal Flow Summary

1. **Secret Exchange**: Buyer shares the secret with the resolver
2. **Time Lock Validation**: Contract checks current time against withdrawal windows
3. **Hash Lock Verification**: SHA256 hash of secret must match stored hash
4. **Access Control**: Private window restrictions apply based on caller identity
5. **Fund Transfer**: Funds are transferred to appropriate recipient
6. **Security Deposit**: Security deposit is returned to the caller
7. **State Update**: Escrow is marked as withdrawn to prevent double-spending

---


## Conclusion

Stellar Fusion successfully demonstrates that secure, user-friendly cross-chain atomic swaps are not only possible but can be implemented with enterprise-grade reliability thereby extending the 1inch Fusion+ Swap successfully to Stellar

