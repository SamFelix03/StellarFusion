# Dual Wallet Integration: MetaMask + Freighter

This document describes the implementation of dual wallet support for cross-chain atomic swaps between Ethereum and Stellar networks.

## Overview

The platform now supports connecting both MetaMask (for Ethereum) and Freighter (for Stellar) wallets simultaneously, allowing users to:

- Connect both wallets independently
- View real-time balances for both chains
- Execute cross-chain swaps with proper approvals
- Handle both Ethereum ERC20 approvals and Stellar trustlines

## Wallet Integration

### MetaMask (Ethereum)
- **Connection**: Uses `wagmi` hooks for MetaMask integration
- **Balance Fetching**: Real-time ETH balance via `useBalance` hook
- **Approvals**: ERC20 token approvals and ETH wrapping to WETH
- **Network**: Supports Sepolia testnet and mainnet

### Freighter (Stellar)
- **Connection**: Direct integration with Freighter browser extension
- **Balance Fetching**: Real-time XLM balance via Stellar Horizon API
- **Approvals**: Trustline management for Stellar tokens
- **Network**: Supports testnet and mainnet

## Implementation Details

### Wallet Provider (`WalletProvider.tsx`)

```typescript
interface StellarWallet {
  publicKey: string
  isConnected: boolean
  balance: string
  network: 'testnet' | 'mainnet'
}

interface WalletContextType {
  // Ethereum wallet
  isConnected: boolean
  address: string | undefined
  connect: () => Promise<void>
  disconnect: () => void
  isLoading: boolean
  
  // Stellar wallet
  stellarWallet: StellarWallet | null
  connectStellar: () => Promise<void>
  disconnectStellar: () => void
  isStellarLoading: boolean
}
```

### Key Features

1. **Independent Connection**: Users can connect either wallet independently
2. **Real-time Status**: Visual indicators show connection status for both wallets
3. **Balance Display**: Real-time balance updates for both chains
4. **Smart Validation**: Only requires relevant wallet based on swap direction

### Landing Page Integration

The landing page now shows:
- Connection status indicators for both wallets
- Individual connect/disconnect buttons
- Wallet information display
- Balance information for connected wallets

### Swap Interface Integration

The swap interface includes:
- Wallet requirement validation based on swap direction
- Real-time balance updates from both chains
- Proper approval handling for both networks
- Error handling for missing wallet connections

## Usage Flow

### 1. Wallet Connection
```typescript
// Connect MetaMask
const { connect } = useWallet()
await connect()

// Connect Freighter
const { connectStellar } = useWallet()
await connectStellar()
```

### 2. Balance Fetching
```typescript
// Ethereum balance (via wagmi)
const { data: ethBalance } = useBalance({ address })

// Stellar balance (via Horizon API)
const stellarBalance = stellarWallet?.balance
```

### 3. Order Creation
```typescript
// Validate wallet connections
const isEthereumRequired = fromChain === "Ethereum" || toChain === "Ethereum"
const isStellarRequired = fromChain === "Stellar" || toChain === "Stellar"

if (isEthereumRequired && !ethereumWalletConnected) {
  // Show MetaMask connection prompt
}

if (isStellarRequired && !stellarWalletConnected) {
  // Show Freighter connection prompt
}
```

### 4. Approval Handling
```typescript
// Ethereum approvals
if (fromChain === "Ethereum" || toChain === "Ethereum") {
  await prepareBuyer(sourceChain, sourceToken, sourceAmount, walletClient)
}

// Stellar approvals
if (fromChain === "Stellar" || toChain === "Stellar") {
  await prepareStellarBuyer(sourceToken, sourceAmount, stellarWallet)
}
```

## Error Handling

### Common Issues

1. **Freighter Not Installed**
   ```typescript
   if (!window.freighterApi) {
     throw new Error("Freighter wallet is not installed")
   }
   ```

2. **Wallet Not Connected**
   ```typescript
   if (!stellarWallet?.isConnected) {
     throw new Error('Stellar wallet not connected')
   }
   ```

3. **Network Mismatch**
   - Automatically detects and handles network changes
   - Shows appropriate error messages for network mismatches

## Security Considerations

1. **Connection Validation**: Regular checks for wallet connection status
2. **Network Verification**: Ensures correct network for each operation
3. **Error Boundaries**: Graceful handling of wallet disconnections
4. **User Feedback**: Clear error messages and connection status

## Future Enhancements

1. **Multi-chain Support**: Extend to other EVM chains (BSC, Polygon)
2. **Wallet Aggregation**: Support for additional wallet types
3. **Batch Operations**: Handle multiple approvals in single transactions
4. **Advanced Trustlines**: Sophisticated Stellar token management

## Testing

### Manual Testing Checklist

- [ ] MetaMask connection/disconnection
- [ ] Freighter connection/disconnection
- [ ] Balance updates for both chains
- [ ] Swap validation with missing wallets
- [ ] Approval flows for both networks
- [ ] Error handling for network issues
- [ ] UI responsiveness during wallet operations

### Automated Testing

```typescript
// Example test structure
describe('Dual Wallet Integration', () => {
  it('should connect both wallets independently', async () => {
    // Test MetaMask connection
    // Test Freighter connection
    // Verify both wallets are connected
  })

  it('should validate wallet requirements for swaps', () => {
    // Test Ethereum-only swaps
    // Test Stellar-only swaps
    // Test cross-chain swaps
  })

  it('should handle approval flows correctly', async () => {
    // Test Ethereum approvals
    // Test Stellar trustlines
    // Test error scenarios
  })
})
```

## Troubleshooting

### Common Issues

1. **Freighter Connection Fails**
   - Ensure Freighter extension is installed
   - Check if Freighter is unlocked
   - Verify network settings in Freighter

2. **Balance Not Updating**
   - Check network connectivity
   - Verify wallet connection status
   - Refresh the page if needed

3. **Approval Errors**
   - Ensure sufficient balance for gas fees
   - Check if previous approvals exist
   - Verify token contract addresses

### Debug Information

Enable debug logging by checking browser console for:
- Wallet connection events
- Balance fetch operations
- Approval transaction details
- Error messages and stack traces 