#!/bin/bash

# Build script for minimal escrow factory contract

echo "🔨 Building minimal escrow factory contract..."

# Build the contract
cargo build --package minimal-escrow --target wasm32-unknown-unknown --release

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📁 Contract WASM file location: target/wasm32-unknown-unknown/release/minimal_escrow.wasm"
else
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "🚀 To deploy to Stellar testnet:"
echo "1. soroban contract deploy --wasm target/wasm32-unknown-unknown/release/minimal_escrow.wasm --source stellar-resolver --network testnet"
echo "2. soroban contract invoke --id <CONTRACT_ID> --source stellar-resolver --network testnet -- initialize --native_token CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
echo ""
echo "💡 To create an escrow:"
echo "soroban contract invoke --id <CONTRACT_ID> --source stellar-resolver --network testnet -- create_escrow --creator <CREATOR_ADDRESS> --recipient <RECIPIENT_ADDRESS> --hashed_secret <HASHED_SECRET>"
echo ""
echo "💡 To withdraw from escrow:"
echo "soroban contract invoke --id <CONTRACT_ID> --source stellar-resolver --network testnet -- withdraw_escrow --caller <CALLER_ADDRESS> --escrow_address <CONTRACT_ID> --secret <SECRET>" 