#!/bin/bash

# Test script for minimal escrow factory contract

echo "🧪 Testing minimal escrow factory contract..."

# Check if contract ID is provided
if [ -z "$1" ]; then
    echo "❌ Please provide the contract ID as argument"
    echo "Usage: ./test-contract.sh <CONTRACT_ID>"
    exit 1
fi

CONTRACT_ID="$1"
echo "📋 Using contract ID: $CONTRACT_ID"

# Generate a test secret and hash
echo "🔐 Generating test secret and hash..."
SECRET="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
HASHED_SECRET=$(echo -n "$SECRET" | xxd -r -p | sha256sum | cut -d' ' -f1)

echo "🔑 Secret: $SECRET"
echo "🔒 Hashed Secret: $HASHED_SECRET"

# Test addresses (replace with actual addresses)
CREATOR_ADDRESS="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
RECIPIENT_ADDRESS="GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
CALLER_ADDRESS="GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"

echo ""
echo "📊 Test Addresses:"
echo "   Creator: $CREATOR_ADDRESS"
echo "   Recipient: $RECIPIENT_ADDRESS"
echo "   Caller: $CALLER_ADDRESS"

echo ""
echo "🚀 Starting contract tests..."

# Test 1: Get escrow counter
echo ""
echo "📊 Test 1: Getting escrow counter..."
soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source stellar-resolver \
  --network testnet \
  -- get_escrow_counter

# Test 2: Create an escrow
echo ""
echo "📊 Test 2: Creating an escrow..."
soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source stellar-resolver \
  --network testnet \
  -- create_escrow \
  --creator "$CREATOR_ADDRESS" \
  --recipient "$RECIPIENT_ADDRESS" \
  --hashed_secret "$HASHED_SECRET"

# Test 3: Get escrow details
echo ""
echo "📊 Test 3: Getting escrow details..."
soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source stellar-resolver \
  --network testnet \
  -- get_escrow \
  --escrow_address "$CONTRACT_ID"

# Test 4: Check if address is escrow
echo ""
echo "📊 Test 4: Checking if address is escrow..."
soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source stellar-resolver \
  --network testnet \
  -- is_escrow \
  --address "$CONTRACT_ID"

# Test 5: Get user escrows
echo ""
echo "📊 Test 5: Getting user escrows..."
soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source stellar-resolver \
  --network testnet \
  -- get_user_escrows \
  --user "$CREATOR_ADDRESS"

# Test 6: Withdraw from escrow
echo ""
echo "📊 Test 6: Withdrawing from escrow..."
soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source stellar-resolver \
  --network testnet \
  -- withdraw_escrow \
  --caller "$CALLER_ADDRESS" \
  --escrow_address "$CONTRACT_ID" \
  --secret "$SECRET"

echo ""
echo "✅ Contract tests completed!"
echo ""
echo "💡 To run with your own addresses:"
echo "   # Replace the addresses in this script with your actual Stellar addresses"
echo "   # Then run: ./test-contract.sh $CONTRACT_ID" 