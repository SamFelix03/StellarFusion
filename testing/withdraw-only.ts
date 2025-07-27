import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF";
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://bnb-testnet.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF";

const srcProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
const dstProvider = new ethers.providers.JsonRpcProvider(BSC_TESTNET_RPC_URL);

// Private keys
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY || "0x7a425200e31e8409c27abbc9aaae49a94c314426ef2e569d3a33ffc289a34e76";
const resolverSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, srcProvider);
const dstSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, dstProvider);

// Escrow ABI
const escrowABI = [
  "function withdraw(bytes calldata secret) external",
  "function recipient() view returns (address)",
  "function creator() view returns (address)",
  "function amount() view returns (uint256)",
  "function token() view returns (address)"
];

async function executeWithdrawals() {
  try {
    console.log("=== EXECUTING WITHDRAWALS ONLY ===");
    
    // Values from the successful test run
    const secret = "0x6a44cfcfc7ee1a749ba9543f5c40e44989e60206758341fd4a89021ec404e3b3";
    const srcEscrowAddress = "0xb4f21ED11dd23A79777Cd3360CfEd285Bd05812E";
    const dstEscrowAddress = "0x3dD0fbe05DC88cb07AB3b40EeAC6C3cD708b08c1";
    const buyerAddress = "0x0994b358dC0a58Dd2bD3cc222ef8ab6F1eB7BFEb";
    const resolverAddress = "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844";
    
    console.log("Secret:", secret);
    console.log("Source Escrow:", srcEscrowAddress);
    console.log("Destination Escrow:", dstEscrowAddress);
    console.log("Buyer Address:", buyerAddress);
    console.log("Resolver Address:", resolverAddress);
    
    // Check current balances before withdrawal
    const resolverEthBefore = await srcProvider.getBalance(resolverAddress);
    const buyerBnbBefore = await dstProvider.getBalance(buyerAddress);
    
    console.log("\n--- Balances Before Withdrawal ---");
    console.log("Resolver ETH:", ethers.utils.formatEther(resolverEthBefore), "ETH");
    console.log("Buyer BNB:", ethers.utils.formatEther(buyerBnbBefore), "BNB");
    
    // Withdraw from source escrow (Sepolia) - resolver gets ETH
    console.log("\n--- Withdrawing from Source Escrow (Sepolia) ---");
    const srcEscrowContract = new ethers.Contract(srcEscrowAddress, escrowABI, resolverSigner);
    
    const srcWithdrawTx = await srcEscrowContract.withdraw(secret, {
      gasLimit: 150000, // Even lower gas limit
      maxFeePerGas: ethers.utils.parseUnits("15", "gwei"), // Lower gas price
      maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
    });
    
    console.log("Source withdrawal transaction:", srcWithdrawTx.hash);
    const srcReceipt = await srcWithdrawTx.wait();
    console.log("✅ Source escrow withdrawal confirmed");
    
    // Withdraw from destination escrow (BSC) - buyer gets BNB
    console.log("\n--- Withdrawing from Destination Escrow (BSC) ---");
    const dstEscrowContract = new ethers.Contract(dstEscrowAddress, escrowABI, dstSigner);
    
    const dstWithdrawTx = await dstEscrowContract.withdraw(secret, {
      gasLimit: 150000, // Lower gas limit
      gasPrice: ethers.utils.parseUnits("2", "gwei") // Lower gas price for BSC
    });
    
    console.log("Destination withdrawal transaction:", dstWithdrawTx.hash);
    const dstReceipt = await dstWithdrawTx.wait();
    console.log("✅ Destination escrow withdrawal confirmed");
    
    // Check final balances
    const resolverEthAfter = await srcProvider.getBalance(resolverAddress);
    const buyerBnbAfter = await dstProvider.getBalance(buyerAddress);
    
    console.log("\n--- Final Balances ---");
    console.log("Resolver ETH:", ethers.utils.formatEther(resolverEthAfter), "ETH");
    console.log("Buyer BNB:", ethers.utils.formatEther(buyerBnbAfter), "BNB");
    
    console.log("\n--- Balance Changes ---");
    console.log("Resolver ETH change:", ethers.utils.formatEther(resolverEthAfter.sub(resolverEthBefore)), "ETH");
    console.log("Buyer BNB change:", ethers.utils.formatEther(buyerBnbAfter.sub(buyerBnbBefore)), "BNB");
    
    console.log("\n✅ Withdrawals completed successfully!");
    
  } catch (error) {
    console.error("❌ Withdrawal failed:", error);
  }
}

// Run the withdrawals
executeWithdrawals()
  .then(() => {
    console.log("\n✅ Withdrawal script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Withdrawal script failed:", error);
    process.exit(1);
  }); 