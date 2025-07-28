#!/bin/bash

# Build script for Stellar Soroban contracts

echo "🚀 Building Stellar Soroban Escrow Contracts"
echo "============================================="

# Check if soroban CLI is installed
if ! command -v soroban &> /dev/null; then
    echo "❌ Soroban CLI not found. Please install it first:"
    echo "   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "   cargo install --locked soroban-cli"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "Cargo.toml" ]; then
    echo "❌ Cargo.toml not found. Please run this script from the stellar-contracts directory."
    exit 1
fi

echo "📦 Building escrow factory contract..."
cd escrow-factory
soroban contract build
if [ $? -eq 0 ]; then
    echo "✅ Escrow factory built successfully"
else
    echo "❌ Failed to build escrow factory"
    exit 1
fi

cd ..

echo ""
echo "📋 Build Summary"
echo "================"
echo "✅ Escrow Factory: target/wasm32-unknown-unknown/release/escrow_factory.wasm"
echo ""
echo "🚀 Next Steps:"
echo "1. Deploy to Stellar testnet/mainnet using soroban contract deploy"
echo "2. Initialize the factory with XLM token address"
echo "3. Update your dynamic swap interface to include Stellar support"
echo ""
echo "📖 For deployment instructions, see README.md" 