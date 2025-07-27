import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const srcProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);

// Addresses
const BUYER_ADDRESS = "0x0994b358dC0a58Dd2bD3cc222ef8ab6F1eB7BFEb";
const SEPOLIA_WETH = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";

// Escrow addresses from the test
const SRC_ESCROW = "0x7f24a062ed70e67cae551352e7821dd98c57ece3";
const DST_ESCROW = "0x193da18e7bb3ba6fd3fd657d73bea92e2bfaa577";

async function checkBuyerBalance() {
  try {
    console.log("=== Checking Buyer Balance Changes ===");
    console.log("Buyer Address:", BUYER_ADDRESS);
    
    // Get current balances
    const currentEthBalance = await srcProvider.getBalance(BUYER_ADDRESS);
    
    const wethContract = new ethers.Contract(
      SEPOLIA_WETH,
      ["function balanceOf(address) view returns (uint256)"],
      srcProvider
    );
    
    const currentWethBalance = await wethContract.balanceOf(BUYER_ADDRESS);
    
    console.log("\n--- Current Buyer Balances ---");
    console.log("ETH Balance:", ethers.utils.formatEther(currentEthBalance), "ETH");
    console.log("WETH Balance:", ethers.utils.formatEther(currentWethBalance), "WETH");
    
    // Expected changes based on the test:
    // - Buyer initially had ~0.005 WETH (from wrapping)
    // - Buyer approved 0.005 WETH for the factory
    // - Source escrow was created with 0.005 WETH
    // - After withdrawal, buyer should have 0 WETH (since resolver withdrew)
    
    console.log("\n--- Expected vs Actual ---");
    console.log("Expected WETH after withdrawal: 0.0 WETH");
    console.log("Actual WETH balance:", ethers.utils.formatEther(currentWethBalance), "WETH");
    
    if (currentWethBalance.eq(0)) {
      console.log("✅ Buyer WETH balance is 0 - withdrawal successful!");
    } else {
      console.log("❌ Buyer still has WETH - withdrawal may have failed");
    }
    
    console.log("\n--- Escrow Addresses for Verification ---");
    console.log("Source Escrow (Sepolia):", SRC_ESCROW);
    console.log("Destination Escrow (BSC):", DST_ESCROW);
    
    console.log("\n--- Verification Instructions ---");
    console.log("1. Check Sepolia block explorer for:", SRC_ESCROW);
    console.log("2. Verify WETH balance is 0");
    console.log("3. Check transaction history for withdrawal");
    console.log("4. Verify resolver received 0.025 WETH");
    
    // Also check resolver balance
    const RESOLVER_ADDRESS = "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844";
    const resolverWethBalance = await wethContract.balanceOf(RESOLVER_ADDRESS);
    
    console.log("\n--- Resolver Balance Verification ---");
    console.log("Resolver Address:", RESOLVER_ADDRESS);
    console.log("Resolver WETH Balance:", ethers.utils.formatEther(resolverWethBalance), "WETH");
    
    if (resolverWethBalance.gte(ethers.utils.parseEther("0.025"))) {
      console.log("✅ Resolver has received the WETH from source escrow!");
    } else {
      console.log("❌ Resolver has not received the expected WETH amount");
    }
    
  } catch (error) {
    console.error("Error checking buyer balance:", error);
  }
}

checkBuyerBalance()
  .then(() => {
    console.log("Buyer balance check completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Buyer balance check failed:", error);
    process.exit(1);
  }); 