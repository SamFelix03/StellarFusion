# EVM Contract Modification for Stellar Compatibility

## Overview

To ensure cross-chain compatibility between EVM and Stellar Soroban contracts, the EVM contract must be modified to use SHA256 hashing instead of keccak256.

## Required Changes

### 1. Add SHA256 Library Import

```solidity
// Add this import at the top of EscrowFactory.sol
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
```

### 2. Modify Secret Verification in Both Escrow Contracts

**In SourceEscrow.withdraw() function:**

```solidity
// BEFORE (using keccak256):
require(keccak256(secret) == hashedSecret, "Invalid secret");

// AFTER (using sha256):
require(sha256(secret) == hashedSecret, "Invalid secret");
```

**In DestinationEscrow.withdraw() function:**

```solidity
// BEFORE (using keccak256):
require(keccak256(secret) == hashedSecret, "Invalid secret");

// AFTER (using sha256):
require(sha256(secret) == hashedSecret, "Invalid secret");
```

### 3. Update Secret Generation in TypeScript/JavaScript

**In buyer.ts and resolver.ts:**

```typescript
// BEFORE (using keccak256):
const hashedSecret = ethers.utils.keccak256(secret);

// AFTER (using sha256):
const hashedSecret = ethers.utils.sha256(secret);
```

### 4. Complete Modified Contract Functions

```solidity
// SourceEscrow withdraw function with SHA256
function withdraw(bytes calldata secret) external nonReentrant {
    require(!fundsWithdrawn, "Funds already withdrawn");
    require(!cancelled, "Escrow cancelled");
    require(block.timestamp >= withdrawalStart, "Withdrawal not started");
    require(block.timestamp < cancellationStart, "Withdrawal period ended");
    
    if (block.timestamp < publicWithdrawalStart) {
        require(msg.sender == recipient, "Only recipient in private window");
    }
    
    // Use SHA256 instead of keccak256 for Stellar compatibility
    require(sha256(secret) == hashedSecret, "Invalid secret");

    fundsWithdrawn = true;
    
    // Rest of the function remains the same...
}

// DestinationEscrow withdraw function with SHA256
function withdraw(bytes calldata secret) external nonReentrant {
    require(!fundsWithdrawn, "Funds already withdrawn");
    require(!cancelled, "Escrow cancelled");
    require(block.timestamp >= withdrawalStart, "Withdrawal not started");
    require(block.timestamp < cancellationStart, "Withdrawal period ended");
    
    if (block.timestamp < publicWithdrawalStart) {
        require(msg.sender == recipient || msg.sender == creator, "Only recipient or creator in private window");
    }
    
    // Use SHA256 instead of keccak256 for Stellar compatibility
    require(sha256(secret) == hashedSecret, "Invalid secret");

    fundsWithdrawn = true;
    
    // Rest of the function remains the same...
}
```

## Benefits

1. **Cross-Chain Compatibility**: Same secret can be used on both EVM and Stellar
2. **Atomic Swaps**: Enables true atomic swaps between EVM and Stellar chains
3. **Security**: SHA256 is cryptographically secure and widely supported
4. **Standardization**: Uses the same hashing algorithm across all chains

## Deployment Notes

- Deploy the modified EVM contract with SHA256 hashing
- Update all TypeScript interfaces to use SHA256
- Test with the same secret on both chains to ensure compatibility
- Update the dynamic swap interface to handle Stellar chains

## Testing Compatibility

```javascript
// Test that the same secret produces the same hash on both chains
const secret = "0x1234567890abcdef";

// EVM (using ethers.js)
const evmHash = ethers.utils.sha256(secret);

// Stellar (in Rust)
// let stellar_hash = env.crypto().sha256(&secret);

// Both should produce identical hashes
console.log("EVM Hash:", evmHash);
console.log("Should match Stellar hash");
``` 