import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.infura.io/v3/YOUR_KEY";
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY || "YOUR_BUYER_PRIVATE_KEY";
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY || "YOUR_RESOLVER_PRIVATE_KEY";

// Token addresses
const SEPOLIA_WETH = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
const BSC_TESTNET_WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

// WETH ABI
const WETH_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function deposit() payable",
  "function approve(address spender, uint256 amount) returns (bool)"
];

async function checkBalances() {
  try {
    // Initialize providers
    const sepoliaProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const bscProvider = new ethers.providers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
    
    const buyerSigner = new ethers.Wallet(BUYER_PRIVATE_KEY, sepoliaProvider);
    const resolverSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, sepoliaProvider);
    
    console.log("=== BALANCE CHECK ===");
    
    // Check buyer balances on Sepolia
    console.log("\n--- BUYER (Sepolia) ---");
    console.log("Address:", buyerSigner.address);
    
    const buyerEthBalance = await sepoliaProvider.getBalance(buyerSigner.address);
    console.log("ETH balance:", ethers.utils.formatEther(buyerEthBalance), "ETH");
    
    const buyerWethContract = new ethers.Contract(SEPOLIA_WETH, WETH_ABI, buyerSigner);
    const buyerWethBalance = await buyerWethContract.balanceOf(buyerSigner.address);
    console.log("WETH balance:", ethers.utils.formatEther(buyerWethBalance), "WETH");
    
    // Check resolver balances on Sepolia
    console.log("\n--- RESOLVER (Sepolia) ---");
    console.log("Address:", resolverSigner.address);
    
    const resolverEthBalance = await sepoliaProvider.getBalance(resolverSigner.address);
    console.log("ETH balance:", ethers.utils.formatEther(resolverEthBalance), "ETH");
    
    const resolverWethContract = new ethers.Contract(SEPOLIA_WETH, WETH_ABI, resolverSigner);
    const resolverWethBalance = await resolverWethContract.balanceOf(resolverSigner.address);
    console.log("WETH balance:", ethers.utils.formatEther(resolverWethBalance), "WETH");
    
    // Check resolver balances on BSC
    console.log("\n--- RESOLVER (BSC Testnet) ---");
    const resolverBscSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, bscProvider);
    
    const resolverBnbBalance = await bscProvider.getBalance(resolverBscSigner.address);
    console.log("BNB balance:", ethers.utils.formatEther(resolverBnbBalance), "BNB");
    
    const resolverWbnbContract = new ethers.Contract(BSC_TESTNET_WBNB, WETH_ABI, resolverBscSigner);
    const resolverWbnbBalance = await resolverWbnbContract.balanceOf(resolverBscSigner.address);
    console.log("WBNB balance:", ethers.utils.formatEther(resolverWbnbBalance), "WBNB");
    
    console.log("\n=== SUMMARY ===");
    console.log("Buyer needs WETH for source escrow");
    console.log("Resolver needs WBNB for destination escrow");
    
  } catch (error) {
    console.error("Error checking balances:", error);
  }
}

// Run the script
checkBalances(); 