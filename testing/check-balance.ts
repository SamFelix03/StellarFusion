import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";
const srcProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
const dstProvider = new ethers.providers.JsonRpcProvider(BSC_TESTNET_RPC_URL);

// Escrow addresses from the last test
const SRC_ESCROW = "0x7f24a062ed70e67cae551352e7821dd98c57ece3";
const DST_ESCROW = "0x193da18e7bb3ba6fd3fd657d73bea92e2bfaa577";

// Token addresses
const SEPOLIA_WETH = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
const BSC_TESTNET_WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

async function checkBalances() {
  try {
    console.log("=== Checking Escrow Balances ===");
    
    // Check ETH/BNB balances of escrows
    const srcEthBalance = await srcProvider.getBalance(SRC_ESCROW);
    const dstBnbBalance = await dstProvider.getBalance(DST_ESCROW);
    
    console.log("\n--- Native Token Balances ---");
    console.log("Source escrow ETH balance:", ethers.utils.formatEther(srcEthBalance), "ETH");
    console.log("Destination escrow BNB balance:", ethers.utils.formatEther(dstBnbBalance), "BNB");
    
    // Check WETH/WBNB balances of escrows
    const wethContract = new ethers.Contract(
      SEPOLIA_WETH,
      ["function balanceOf(address) view returns (uint256)"],
      srcProvider
    );
    
    const wbnbContract = new ethers.Contract(
      BSC_TESTNET_WBNB,
      ["function balanceOf(address) view returns (uint256)"],
      dstProvider
    );
    
    const srcWethBalance = await wethContract.balanceOf(SRC_ESCROW);
    const dstWbnbBalance = await wbnbContract.balanceOf(DST_ESCROW);
    
    console.log("\n--- Wrapped Token Balances ---");
    console.log("Source escrow WETH balance:", ethers.utils.formatEther(srcWethBalance), "WETH");
    console.log("Destination escrow WBNB balance:", ethers.utils.formatEther(dstWbnbBalance), "WBNB");
    
    // Check resolver balances
    const RESOLVER_ADDRESS = "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844";
    
    const resolverSrcEth = await srcProvider.getBalance(RESOLVER_ADDRESS);
    const resolverDstBnb = await dstProvider.getBalance(RESOLVER_ADDRESS);
    const resolverSrcWeth = await wethContract.balanceOf(RESOLVER_ADDRESS);
    const resolverDstWbnb = await wbnbContract.balanceOf(RESOLVER_ADDRESS);
    
    console.log("\n--- Resolver Balances ---");
    console.log("Resolver ETH (Sepolia):", ethers.utils.formatEther(resolverSrcEth), "ETH");
    console.log("Resolver BNB (BSC):", ethers.utils.formatEther(resolverDstBnb), "BNB");
    console.log("Resolver WETH (Sepolia):", ethers.utils.formatEther(resolverSrcWeth), "WETH");
    console.log("Resolver WBNB (BSC):", ethers.utils.formatEther(resolverDstWbnb), "WBNB");
    
    // Check buyer balances
    const BUYER_ADDRESS = "0x0994b358dC0a58Dd2bD3cc222ef8ab6F1eB7BFEb";
    
    const buyerSrcEth = await srcProvider.getBalance(BUYER_ADDRESS);
    const buyerSrcWeth = await wethContract.balanceOf(BUYER_ADDRESS);
    
    console.log("\n--- Buyer Balances ---");
    console.log("Buyer ETH (Sepolia):", ethers.utils.formatEther(buyerSrcEth), "ETH");
    console.log("Buyer WETH (Sepolia):", ethers.utils.formatEther(buyerSrcWeth), "WETH");
    
    console.log("\n--- Analysis ---");
    if (srcWethBalance.gt(0)) {
      console.log("✅ Source escrow still has WETH funds");
    } else {
      console.log("❌ Source escrow has no WETH funds (may have been withdrawn)");
    }
    
    if (dstWbnbBalance.gt(0)) {
      console.log("✅ Destination escrow still has WBNB funds");
    } else {
      console.log("❌ Destination escrow has no WBNB funds (may have been withdrawn)");
    }
    
  } catch (error) {
    console.error("Error checking balances:", error);
  }
}

checkBalances()
  .then(() => {
    console.log("Balance check completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Balance check failed:", error);
    process.exit(1);
  }); 