#!/bin/bash

# Deployment script for minimal escrow factory contract

echo "🚀 Deploying minimal escrow factory to Stellar testnet..."

# Check if soroban CLI is installed
if ! command -v soroban &> /dev/null; then
    echo "❌ Soroban CLI not found. Please install it first."
    exit 1
fi

# Check if contract WASM file exists
WASM_FILE="target/wasm32-unknown-unknown/release/minimal_escrow.wasm"
if [ ! -f "$WASM_FILE" ]; then
    echo "❌ Contract WASM file not found. Please build the contract first:"
    echo "   ./build.sh"
    exit 1
fi

echo "📦 Contract WASM file found: $WASM_FILE"

# Deploy the contract
echo "📤 Deploying contract..."
CONTRACT_ID=$(soroban contract deploy \
  --wasm "$WASM_FILE" \
  --source stellar-resolver \
  --network testnet)

if [ $? -eq 0 ]; then
    echo "✅ Contract deployed successfully!"
    echo "📋 Contract ID: $CONTRACT_ID"
    
    # Initialize the contract
    echo "🔧 Initializing contract..."
    soroban contract invoke \
      --id "$CONTRACT_ID" \
      --source stellar-resolver \
      --network testnet \
      -- initialize \
      --native_token CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM
    
    if [ $? -eq 0 ]; then
        echo "✅ Contract initialized successfully!"
        echo ""
        echo "🎉 Deployment completed!"
        echo "📋 Contract ID: $CONTRACT_ID"
        echo ""
        echo "💡 Test the contract:"
        echo "   # Create an escrow"
        echo "   soroban contract invoke --id $CONTRACT_ID --source stellar-resolver --network testnet -- create_escrow --creator <CREATOR_ADDRESS> --recipient <RECIPIENT_ADDRESS> --hashed_secret <HASHED_SECRET>"
        echo ""
        echo "   # Withdraw from escrow"
        echo "   soroban contract invoke --id $CONTRACT_ID --source stellar-resolver --network testnet -- withdraw_escrow --caller <CALLER_ADDRESS> --escrow_address $CONTRACT_ID --secret <SECRET>"
        echo ""
        echo "   # Get escrow details"
        echo "   soroban contract invoke --id $CONTRACT_ID --source stellar-resolver --network testnet -- get_escrow --escrow_address $CONTRACT_ID"
    else
        echo "❌ Contract initialization failed!"
        exit 1
    fi
else
    echo "❌ Contract deployment failed!"
    exit 1
fi 