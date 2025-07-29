#!/bin/bash

# Kill any existing anvil processes
pkill -f anvil

echo "Starting Anvil instances..."

# Start Sepolia fork on port 8545
echo "Starting Sepolia fork on port 8545..."
anvil --fork-url https://eth-sepolia.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF --port 8545 --chain-id 11155111 &
SEPOLIA_PID=$!

# Wait a moment for first instance to start
sleep 2

# Start BSC testnet fork on port 8546
echo "Starting BSC testnet fork on port 8546..."
anvil --fork-url https://bnb-testnet.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF --port 8546 --chain-id 97 &
BSC_PID=$!

echo "Anvil instances started:"
echo "  Sepolia fork: http://localhost:8545 (PID: $SEPOLIA_PID)"
echo "  BSC testnet fork: http://localhost:8546 (PID: $BSC_PID)"
echo ""
echo "Default accounts (same for both chains):"
echo "  Account 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "  Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo "  Account 1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
echo "  Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
echo ""
echo "To stop: pkill -f anvil"

# Keep script running
wait