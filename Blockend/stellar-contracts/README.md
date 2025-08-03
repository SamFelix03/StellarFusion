# Stellar Soroban Escrow Contracts

## Overview

This directory contains Stellar Soroban smart contracts that mirror the functionality of the EVM `EscrowFactory.sol` contract. These contracts enable cross-chain atomic swaps between Stellar and EVM-compatible chains.

## Architecture

### Contracts

1. **HashLockedEscrowFactory** - Main factory contract that deploys escrow contracts
2. **SourceEscrow** - Holds tokens from the source chain (equivalent to EVM SourceEscrow)  
3. **DestinationEscrow** - Holds tokens for the destination chain (equivalent to EVM DestinationEscrow)

### Key Features

- ✅ **Exact Logic Mirror**: Same timelock windows, validation, and flow as EVM contracts
- ✅ **SHA256 Compatibility**: Uses SHA256 hashing for cross-chain secret compatibility
- ✅ **Security Deposits**: 0.1 XLM security deposits (equivalent to 0.001 ETH)
- ✅ **Time-Locked Windows**: Private/public withdrawal and cancellation periods
- ✅ **Rescue Mechanism**: 7-day rescue delay for stuck funds

## Prerequisites

### Install Rust and Soroban CLI

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Soroban CLI
cargo install --locked soroban-cli

# Add wasm32 target
rustup target add wasm32-unknown-unknown
```

### Configure Soroban Network

```bash
# Add Stellar testnet
soroban network add testnet \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"

# Create identity
soroban keys generate alice
soroban keys fund alice --network testnet
```

## Building

### Option 1: Use Build Script

```bash
chmod +x build.sh
./build.sh
```

### Option 2: Manual Build

```bash
cd escrow-factory
soroban contract build
```

## Deployment

### 1. Deploy Factory Contract

```bash
# Deploy the factory
FACTORY_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow_factory.wasm \
  --source alice \
  --network testnet)

echo "Factory deployed at: $FACTORY_ID"
```

### 2. Initialize Factory

```bash
# Get XLM token address (native Stellar asset)
XLM_ADDRESS="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAHHAGCN6"

# Initialize factory with XLM as deposit token
soroban contract invoke \
  --id $FACTORY_ID \
  --source alice \
  --network testnet \
  -- initialize \
  --deposit_token $XLM_ADDRESS
```

## Usage

### Creating Source Escrow

```bash
soroban contract invoke \
  --id $FACTORY_ID \
  --source alice \
  --network testnet \
  -- create_src_escrow \
  --hashed_secret "0x1234567890abcdef..." \
  --recipient "GCXXX..." \
  --buyer "GCYYY..." \
  --token_amount 1000000 \
  --withdrawal_start 1640995200 \
  --public_withdrawal_start 1640995500 \
  --cancellation_start 1640996100 \
  --public_cancellation_start 1640996700
```

### Creating Destination Escrow

```bash
soroban contract invoke \
  --id $FACTORY_ID \
  --source alice \
  --network testnet \
  -- create_dst_escrow \
  --hashed_secret "0x1234567890abcdef..." \
  --recipient "GCXXX..." \
  --token_amount 1000000 \
  --withdrawal_start 1640995200 \
  --public_withdrawal_start 1640995500 \
  --cancellation_start 1640996100
```

### Withdrawing from Escrow

```bash
soroban contract invoke \
  --id $ESCROW_ID \
  --source alice \
  --network testnet \
  -- withdraw \
  --secret "0xabcdef1234567890..."
```

## Cross-Chain Compatibility

### Hash Compatibility

Both EVM and Stellar contracts use **SHA256** for secret hashing:

**Stellar (Rust):**
```rust
let secret_hash = env.crypto().sha256(&secret);
```

**EVM (Solidity):**
```solidity
require(sha256(secret) == hashedSecret, "Invalid secret");
```

**TypeScript:**
```typescript
const hashedSecret = ethers.utils.sha256(secret);
```

### Time Windows

Identical timelock logic across both chains:

| Window | Duration | Description |
|--------|----------|-------------|
| Private Withdrawal | Start → +5min | Only recipient can withdraw |
| Public Withdrawal | +5min → +10min | Anyone can withdraw with secret |
| Private Cancellation | +10min → +15min | Only creator can cancel |
| Public Cancellation | +15min → ∞ | Anyone can cancel |
| Rescue | +7 days after cancel | Recipient can rescue stuck funds |

## Integration with Dynamic Swap

### Update Chain Configuration

Add Stellar to `config/chains.json`:

```json
{
  "stellar-testnet": {
    "name": "Stellar Testnet",
    "chainId": "testnet",
    "rpcUrl": "https://soroban-testnet.stellar.org:443",
    "nativeCurrency": {
      "name": "Stellar Lumens",
      "symbol": "XLM", 
      "decimals": 7
    },
    "factoryAddress": "CXXXXX...", // Your deployed factory ID
    "tokens": {
      "XLM": {
        "name": "Stellar Lumens",
        "symbol": "XLM",
        "address": "native",
        "decimals": 7,
        "isNative": true
      },
      "USDC": {
        "name": "USD Coin",
        "symbol": "USDC", 
        "address": "CXXXXX...",
        "decimals": 6,
        "isNative": false
      }
    }
  }
}
```

### Example Cross-Chain Swap

**ETH (Sepolia) ↔ XLM (Stellar Testnet)**

1. User selects ETH → XLM swap
2. Buyer approves WETH on Sepolia
3. Resolver creates source escrow on Sepolia (pulls buyer's WETH)
4. Resolver creates destination escrow on Stellar (deposits XLM)
5. Both parties withdraw using the same SHA256 secret
6. Buyer receives XLM, Resolver receives ETH

## Error Codes

| Code | Description |
|------|-------------|
| 1 | Token amount must be > 0 |
| 2 | Invalid time windows |
| 3 | Funds already withdrawn |
| 4 | Escrow cancelled |
| 5 | Withdrawal not started |
| 6 | Withdrawal period ended |
| 7 | Only recipient in private window |
| 8 | Invalid secret |
| 9 | Already cancelled |
| 10 | Cancellation not started |
| 11 | Private cancellation ended |
| 12 | Only creator can cancel |
| 13 | Public cancellation not started |
| 14 | No public cancellation for this escrow |
| 15 | Rescue not available |
| 16 | Only recipient can rescue |
| 17 | Only recipient or creator in private window |
| 18 | Only creator can rescue |

## Testing

### Unit Tests

```bash
cd escrow-factory
cargo test
```

### Integration Tests

```bash
# Test cross-chain compatibility
soroban contract invoke --id $FACTORY_ID --source alice --network testnet -- create_src_escrow --hashed_secret $(echo -n "test_secret" | sha256sum | cut -d' ' -f1)
```

## Security Considerations

1. **Time Synchronization**: Ensure both chains have accurate timestamps
2. **Secret Management**: Secrets should be cryptographically random
3. **Gas/Fee Management**: Account for transaction fees on both chains
4. **Network Reliability**: Handle network interruptions gracefully
5. **Rescue Mechanism**: 7-day delay prevents immediate fund recovery

## Deployment Checklist

- [ ] Rust and Soroban CLI installed
- [ ] Network configured (testnet/mainnet)
- [ ] Identity funded with XLM
- [ ] Factory contract built and deployed
- [ ] Factory initialized with XLM token
- [ ] Cross-chain hash compatibility tested
- [ ] Integration with dynamic swap interface
- [ ] Time window synchronization verified

## Support

For issues or questions:
1. Check Soroban documentation: https://soroban.stellar.org/
2. Stellar Discord: https://discord.gg/stellar
3. Review the EVM contract for logic reference 