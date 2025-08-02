# StellarFusion: Cross-Chain Atomic Swap Platform

## Table of Contents

1. [Introduction](#introduction)

2. [Order Creation](#order-creation)
   - [Fusion+ Swaps](#fusion-swaps)
   - [Partial Fills](#partial-fills)

3. [Dutch Auction](#dutch-auction)

4. [Escrow Creations](#escrow-creations)
   - [Fusion+ Swaps](#fusion-swaps)
   - [Partial Fills](#partial-fills)

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

#### Smart Contract Integration

##### Ethereum Side (EscrowFactory.sol)

The Ethereum smart contract handles order creation through the `createSrcEscrow()` function:

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
    uint256 partIndex,      // 0 for complete fill
    uint16 totalParts       // 1 for complete fill
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

The `createDstEscrow()` function creates destination escrows:

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

##### Stellar Side (LimitOrderProtocol.sol)

The Stellar smart contract handles order creation through the `fill_order()` function:

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

#### Smart Contract Integration

##### Ethereum Side (EscrowFactory.sol)

The Ethereum smart contract handles partial fill order creation through the `createSrcEscrow()` function:

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
    uint256 partIndex,      // >0 for partial fill
    uint16 totalParts       // >1 for partial fill
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

    // Check if this is a partial fill or complete fill
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

##### Stellar Side (LimitOrderProtocol.sol)

The Stellar smart contract handles partial fill order creation through the `fill_order()` function:

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
    
    // Create escrow using factory client with partial fill support
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
