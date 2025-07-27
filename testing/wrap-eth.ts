import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY || "YOUR_RESOLVER_PRIVATE_KEY";

// WETH contract address on Sepolia
const SEPOLIA_WETH = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";

// WETH ABI (minimal for deposit/withdraw)
const WETH_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

async function wrapETH() {
  try {
    // Initialize provider and signer
    const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const resolverSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, provider);
    
    console.log("Resolver address:", resolverSigner.address);
    
    // Check ETH balance
    const ethBalance = await provider.getBalance(resolverSigner.address);
    console.log("ETH balance:", ethers.utils.formatEther(ethBalance), "ETH");
    
    // Check WETH balance
    const wethContract = new ethers.Contract(SEPOLIA_WETH, WETH_ABI, resolverSigner);
    const wethBalance = await wethContract.balanceOf(resolverSigner.address);
    console.log("WETH balance:", ethers.utils.formatEther(wethBalance), "WETH");
    
    // Amount to wrap (0.02 ETH to have enough for the swap)
    const wrapAmount = ethers.utils.parseEther("0.02");
    
    if (ethBalance.lt(wrapAmount)) {
      console.log("Insufficient ETH balance. Need at least 0.02 ETH");
      return;
    }
    
    console.log(`Wrapping ${ethers.utils.formatEther(wrapAmount)} ETH to WETH...`);
    
    // Wrap ETH to WETH
    const tx = await wethContract.deposit({ value: wrapAmount });
    console.log("Transaction hash:", tx.hash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    
    // Check new balances
    const newEthBalance = await provider.getBalance(resolverSigner.address);
    const newWethBalance = await wethContract.balanceOf(resolverSigner.address);
    
    console.log("New ETH balance:", ethers.utils.formatEther(newEthBalance), "ETH");
    console.log("New WETH balance:", ethers.utils.formatEther(newWethBalance), "WETH");
    
    console.log("✅ ETH successfully wrapped to WETH!");
    
  } catch (error) {
    console.error("Error wrapping ETH:", error);
  }
}

// Run the script
wrapETH(); 