# Dynamic Cross-Chain Swap Interface

## Overview

This dynamic interface allows you to perform cross-chain atomic swaps between Sepolia Testnet and BSC Testnet with an interactive CLI that guides you through the entire process.

## Features

- 🔄 **Interactive CLI**: Select chains, tokens, and amounts through prompts
- 💰 **Price Calculation**: Automatic destination amount calculation (currently 1:1 for testing)
- 🌐 **Multi-Chain Support**: Sepolia ↔ BSC Testnet
- 🪙 **Token Support**: Native tokens (ETH/BNB), Wrapped tokens (WETH/WBNB), and stablecoins (USDC/USDT)
- 🔒 **Automatic Wrapping**: Native tokens are automatically wrapped when needed
- ⚡ **Gas Optimization**: Reduced gas costs for efficient transactions

## Prerequisites

1. **Environment Setup**: Ensure your `.env` file contains:
   ```
   BUYER_PRIVATE_KEY=your_buyer_private_key
   RESOLVER_PRIVATE_KEY=your_resolver_private_key
   ```

2. **Funded Accounts**:
   - Buyer needs native tokens on the source chain
   - Resolver needs native tokens on both chains

3. **Deployed Contracts**: Factory contracts must be deployed on both chains (addresses in `config/chains.json`)

## Usage

### Run the Dynamic Interface

```bash
npm run swap
```

### Interactive Flow

1. **Select Source Chain**: Choose between Sepolia Testnet or BSC Testnet
2. **Select Destination Chain**: Choose the other chain
3. **Select Source Token**: Pick from available tokens on source chain
4. **Select Destination Token**: Pick from available tokens on destination chain
5. **Enter Amount**: Specify how much of the source token to swap
6. **Review Summary**: Check the swap details and current prices
7. **Confirm**: Proceed with the swap execution

### Example Flow

```
🚀 Welcome to Dynamic Cross-Chain Atomic Swap Interface
========================================================

? Select source chain: Sepolia Testnet
? Select destination chain: BSC Testnet
? Select source token: Ethereum (ETH)
? Select destination token: Binance Coin (BNB)
? Enter amount of ETH to swap: 0.01

💰 Fetching current prices...
💱 Testing mode: 1:1 conversion - 0.01 ETH = 0.01 BNB

📋 Swap Summary
===============
Source: 0.01 ETH on Sepolia Testnet
Destination: 0.010000 BNB on BSC Testnet

💵 Current Prices:
ETH: $1.00
BNB: $1.00

Total Value: ~$0.01

? Do you want to proceed with this swap? Yes

🔄 Executing Cross-Chain Swap...
```

## Token Support

### Sepolia Testnet
- **ETH** (Native): Automatically wrapped to WETH
- **WETH** (ERC-20): Wrapped Ethereum
- **USDC** (ERC-20): USD Coin

### BSC Testnet
- **BNB** (Native): Automatically wrapped to WBNB
- **WBNB** (BEP-20): Wrapped BNB
- **USDT** (BEP-20): Tether USD

## Configuration

### Chain Configuration (`config/chains.json`)

Update this file to:
- Add new chains
- Update factory contract addresses after deployment
- Add new token addresses
- Modify RPC URLs

### Price Service (`src/price-service.ts`)

Currently in testing mode with 1:1 prices. To enable real prices:
1. Uncomment the CoinGecko API code
2. Comment out the testing mode sections

## Swap Process

1. **Buyer Preparation**:
   - Wraps native tokens if needed
   - Approves factory contract to spend tokens

2. **Resolver Execution**:
   - Creates source escrow (pulls buyer's tokens)
   - Wraps destination tokens if needed
   - Creates destination escrow
   - Waits for withdrawal window
   - Executes both withdrawals simultaneously

3. **Completion**:
   - Buyer receives destination tokens (unwrapped to native)
   - Resolver receives source tokens (unwrapped to native)

## Gas Optimization

The interface uses optimized gas settings:
- **Sepolia**: 150k gas limit, 15 gwei max fee
- **BSC**: 150k gas limit, 2 gwei gas price

## Error Handling

- Automatic fallback for price fetching failures
- Manual amount entry if API is unavailable
- Comprehensive error messages for troubleshooting

## Development

### Add New Chain

1. Update `config/chains.json` with chain details
2. Deploy factory contract to new chain
3. Update factory address in config
4. Add token addresses for the new chain

### Add New Token

1. Add token details to appropriate chain in `config/chains.json`
2. Update `TOKEN_ID_MAP` in `src/price-service.ts` if using real prices

## Scripts

- `npm run build`: Compile TypeScript
- `npm run swap`: Run the dynamic swap interface
- `npm test`: Run tests (placeholder)

## Troubleshooting

1. **"Insufficient funds"**: Ensure accounts have enough native tokens for gas
2. **"Contract not deployed"**: Verify factory addresses in config
3. **"Price fetch failed"**: Interface will fallback to manual entry
4. **"Transaction reverted"**: Check time windows and token approvals 