# CLI Cross-Chain Swap Demo Guide

## Environment Setup

#### 1. Copy the example file:
```bash
cp .env.example .env
```

#### 2. Fill in your own values in `.env`:

**EVM Keys (Required):**
- `BUYER_PRIVATE_KEY=your_evm_buyer_private_key`
- `RESOLVER_PRIVATE_KEY=your_evm_resolver_private_key`

**Stellar Keys (Required):**
- `STELLAR_BUYER_SECRET=your_stellar_buyer_secret_key`
- `STELLAR_RESOLVER_SECRET=your_stellar_resolver_secret_key`
- `STELLAR_BUYER_ADDRESS=your_stellar_buyer_public_address`
- `STELLAR_RESOLVER_ADDRESS=your_stellar_resolver_public_address`

#### 3. Configure Stellar CLI Identities:

**Important**: You must run these commands to set up the required Stellar identities:

```bash
# Configure stellar-buyer identity
soroban keys add stellar-buyer --secret-key
# When prompted, enter the value from your STELLAR_BUYER_SECRET environment variable

# Configure stellar-resolver identity  
soroban keys add stellar-resolver --secret-key
# When prompted, enter the value from your STELLAR_RESOLVER_SECRET environment variable
```

**Important:** Make sure your wallets have testnet funds:
- Sepolia ETH for gas fees
- Stellar XLM for transaction fees

---

## Quick Setup & Run (AFTER Configuration Above)

### Prerequisites ✅
You must already have these installed:
- ✅ **soroban-cli** (found at `/Users/sam/.cargo/bin/soroban`)
- ✅ **stellar-cli** (found at `/Users/sam/.cargo/bin/stellar`)

### 3-Step Setup

#### 1. Navigate to Blockend directory
```bash
cd /Users/sam/1inch-final/Blockend
```

#### 2. Install dependencies  
```bash
npm install
```

#### 3. Run the swap interface
```bash
npm run swap
```

---

## Reference Information

**Contract Addresses:**

**Sepolia Testnet:**
- Factory: `0x4F25B17649F0A056138E251487c27A22D793DBA7`
- LOP: `0x13F4118A0C9AA013eeB078f03318aeea84469cDD`

**Stellar Testnet:**
- Factory: `CD3TAVDMTRSPT475FP2APSC3MRQFOHVKEMJYPUGGQRP3KS4B5UBPCFH6`
- LOP: `CCFLX4NZH4MVTQ5DYO74LEB3S7U2GO6OH3VP4NPYF4CXXSXR4GPRXEXV`

**Token Addresses:**

**Sepolia Testnet:**
- ETH (Native): `0x0000000000000000000000000000000000000000`
- WETH: `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`
- USDC: `0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8`

**Stellar Testnet:**
- XLM (Native): `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- USDC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`

**Supported Chains:**
- Sepolia Testnet (ETH, WETH, USDC)
- Stellar Testnet (XLM, USDC)

---

## How Dynamic-Swap.ts Works

### Main Features

#### 1. HashLock & Timelocks (**lines 7, 116-122**)
- **Secret-based coordination**: Uses cryptographic secrets where revealing one unlocks both escrows atomically
- **Multi-tier time windows**: withdrawal_start (resolver priority) → public_withdrawal_start (anyone with secret) → cancellation_start (fund recovery)
- **Cross-chain synchronization**: Same hashlock coordinates escrows on both Stellar and EVM chains

```typescript
import { HashLock, PartialFillOrderManager } from "./hash-lock";
this.stellarBuyerKeypair = Keypair.fromSecret(process.env.STELLAR_BUYER_SECRET);
this.stellarResolverKeypair = Keypair.fromSecret(process.env.STELLAR_RESOLVER_SECRET);
```

#### 2. Atomic Execution (**line 1156+**)
- **Two-phase escrow creation**: Source escrow locks buyer tokens, destination escrow locks resolver tokens
- **All-or-nothing guarantee**: Either both parties get tokens or both transactions fail
- **Coordinated withdrawal**: Revealing secret to claim from one escrow enables claiming from the other

#### 3. EVM LOP Contract Integration (**lines 12, 48**)
- **Order filling on EVM side**: Calls fillOrder function of LOP contract for order execution
- **Token approval handling**: Manages ERC-20 approvals before LOP contract interaction
- **Gas optimization**: Uses efficient gas settings for EVM transactions

```typescript
"lopAddress": "0x13F4118A0C9AA013eeB078f03318aeea84469cDD", // Sepolia LOP
"lopAddress": "CCFLX4NZH4MVTQ5DYO74LEB3S7U2GO6OH3VP4NPYF4CXXSXR4GPRXEXV" // Stellar LOP
```

### Stellar to EVM Flow

#### Order Creation (**lines 697-706**)
- **Dynamic function selection**: Uses `create_src_escrow` for single fills, `create_src_escrow_partial` for partial fills
- **Comprehensive parameters**: Includes creator, hashed_secret, recipient, buyer, token_amount, and time windows
- **Soroban CLI integration**: Executes Stellar contract calls via command-line interface

```typescript
const functionName = (actualPartIndex > 0 || actualTotalParts > 1) ? 'create_src_escrow_partial' : 'create_src_escrow';
command = `soroban contract invoke --id ${contractAddress} --source stellar-resolver --network testnet -- ${functionName}`;
```

#### Secret Management (**lines 350, 475**)
- **Single secret for simple orders**: Uses main order secret for straightforward swaps
- **Consistent hash generation**: Same secret generates identical hashlocks across chains
- **Security through revelation timing**: Secret only revealed during withdrawal phase

#### Order Tracking (**lines 1399-1425**)
- **Remaining parts counter**: Tracks `remainingParts: segments.length` and decrements as filled
- **Amount monitoring**: Updates `fillStatus.totalFilledAmount` for partial completion tracking
- **Status management**: Maintains order state throughout multi-step execution

### EVM to Stellar Flow

#### Destination Escrow (**lines 627-636**)
- **Mirror escrow logic**: Uses `create_dst_escrow` or `create_dst_escrow_partial` based on order type
- **Resolver commitment**: Locks resolver's tokens on Stellar before buyer commits EVM tokens
- **Identical timelock parameters**: Uses same time windows for coordinated execution

```typescript
const functionName = (actualPartIndex > 0 || actualTotalParts > 1) ? 'create_dst_escrow_partial' : 'create_dst_escrow';
command = `soroban contract invoke --id ${contractAddress} --source stellar-resolver --network testnet -- ${functionName}`;
```

#### Secret Coordination (**lines 383, 570**)
- **Unified secret management**: Same approach as Stellar→EVM for consistency
- **Cross-chain hashlock**: Identical secret coordinates both Stellar and EVM escrows
- **Atomic revelation**: Unlocking one chain automatically enables unlocking the other

#### LOP Contract Execution
- **EVM-side order filling**: Executes fillOrder on LOP contract for EVM portion of swap
- **Token transfer coordination**: Manages ERC-20 transfers through LOP contract
- **Fee and slippage handling**: LOP contract manages pricing and execution parameters

### Partial Fill Cases

#### Secret Architecture (**lines 1248-1256**)
- **Multiple secret management**: `PartialFillOrderManager` handles array of secrets for segments
- **Master secret derivation**: All segment secrets derived from common source for coordination
- **Backward compatibility**: First secret serves as main order secret for existing logic

```typescript
if (config.partsCount && config.partsCount > 1) {
  partialFillManager = new PartialFillOrderManager(config.partsCount!);
  hashedSecret = partialFillManager.getHashLock();
}
```

#### Progress Monitoring (**lines 1479-1496, 1531**)
- **Segment completion tracking**: Decrements `fillStatus.remainingParts` as segments finish
- **Amount aggregation**: Sums filled amounts across all completed segments
- **Real-time display**: Shows remaining unfilled amounts in readable format

```typescript
fillStatus.remainingParts--;
console.log(`Remaining: ${ethers.utils.formatUnits(order.srcAmount.sub(fillStatus.totalFilledAmount))}`);
```

#### Independent Segment Execution
- **Parallel processing capability**: Each segment can be filled independently with own secret
- **Isolated failure handling**: One segment failure doesn't affect others
- **Coordinated completion**: All segments must complete for full order fulfillment

### Resolver Execution Flow

#### Application Entry (**lines 2480-2501**)
- **Clean initialization**: Creates `DynamicSwapInterface` instance and starts execution
- **Error handling**: Catches and reports application-level errors with proper exit codes
- **Lifecycle management**: Ensures clean shutdown on completion or failure

```typescript
async function main() {
  const swapInterface = new DynamicSwapInterface();
  await swapInterface.start();
}
```

#### Stellar Integration (**lines 113-126**)
- **SDK connection**: Initializes `SorobanRpc.Server` for Stellar testnet interactions
- **Keypair management**: Loads buyer and resolver keypairs from environment variables
- **Fallback handling**: Uses hardcoded addresses if environment setup fails

```typescript
this.stellarServer = new SorobanRpc.Server('https://soroban-testnet.stellar.org:443');
this.stellarBuyerKeypair = Keypair.fromSecret(process.env.STELLAR_BUYER_SECRET);
```

#### Balance Monitoring (**lines 174-194**)
- **Cross-chain awareness**: Tracks balances on both Stellar and EVM networks simultaneously
- **Real-time updates**: Displays current wallet states before and after transactions
- **Address format handling**: Manages different address formats between Stellar and EVM chains