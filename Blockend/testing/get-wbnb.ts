import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.infura.io/v3/YOUR_KEY";
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY || "YOUR_RESOLVER_PRIVATE_KEY";

// WBNB contract address on BSC testnet
const BSC_TESTNET_WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

// WBNB ABI (minimal for deposit/withdraw)
const WBNB_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

async function getWBNB() {
  try {
    // Initialize provider and signer
    const provider = new ethers.providers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
    const resolverSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, provider);
    
    console.log("Resolver address:", resolverSigner.address);
    
    // Check BNB balance
    const bnbBalance = await provider.getBalance(resolverSigner.address);
    console.log("BNB balance:", ethers.utils.formatEther(bnbBalance), "BNB");
    
    // Check WBNB balance
    const wbnbContract = new ethers.Contract(BSC_TESTNET_WBNB, WBNB_ABI, resolverSigner);
    const wbnbBalance = await wbnbContract.balanceOf(resolverSigner.address);
    console.log("WBNB balance:", ethers.utils.formatEther(wbnbBalance), "WBNB");
    
    // Amount to wrap (0.03 BNB to have enough for the swap)
    const wrapAmount = ethers.utils.parseEther("0.03");
    
    if (bnbBalance.lt(wrapAmount)) {
      console.log("Insufficient BNB balance. Need at least 0.03 BNB");
      console.log("You can get BSC testnet BNB from: https://testnet.binance.org/faucet-smart");
      return;
    }
    
    console.log(`Wrapping ${ethers.utils.formatEther(wrapAmount)} BNB to WBNB...`);
    
    // Wrap BNB to WBNB
    const tx = await wbnbContract.deposit({ value: wrapAmount });
    console.log("Transaction hash:", tx.hash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    
    // Check new balances
    const newBnbBalance = await provider.getBalance(resolverSigner.address);
    const newWbnbBalance = await wbnbContract.balanceOf(resolverSigner.address);
    
    console.log("New BNB balance:", ethers.utils.formatEther(newBnbBalance), "BNB");
    console.log("New WBNB balance:", ethers.utils.formatEther(newWbnbBalance), "WBNB");
    
    console.log("✅ BNB successfully wrapped to WBNB!");
    
  } catch (error) {
    console.error("Error wrapping BNB:", error);
  }
}

// Run the script
getWBNB(); 