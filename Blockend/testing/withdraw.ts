import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY || "YOUR_RESOLVER_PRIVATE_KEY";

// Initialize providers for both chains
const srcProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
const dstProvider = new ethers.providers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
const resolverSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, srcProvider);

// Escrow addresses from the last test
const SRC_ESCROW = "0x7f24a062ed70e67cae551352e7821dd98c57ece3";
const DST_ESCROW = "0x193da18e7bb3ba6fd3fd657d73bea92e2bfaa577";

// Secret from the last test (this would normally come from the buyer)
const SECRET = "0x9eb85442d635cb51697307bd0d21a7946dac25bd38df07ec9a82bf8279a8faab";

async function executeWithdrawal() {
  try {
    console.log("=== Executing Cross-Chain Withdrawal ===");
    console.log("Source escrow:", SRC_ESCROW);
    console.log("Destination escrow:", DST_ESCROW);
    console.log("Secret:", SECRET);
    
    // Source chain withdrawal (Sepolia)
    const srcEscrowContract = new ethers.Contract(
      SRC_ESCROW,
      ["function withdraw(bytes)"],
      resolverSigner
    );
    
    // Destination chain withdrawal (BSC)
    const dstEscrowContract = new ethers.Contract(
      DST_ESCROW,
      ["function withdraw(bytes)"],
      resolverSigner.connect(dstProvider)
    );
    
    console.log("Executing withdrawals on both chains...");
    
    // Execute simultaneously
    const srcTx = await srcEscrowContract.withdraw(ethers.utils.arrayify(SECRET));
    const dstTx = await dstEscrowContract.withdraw(ethers.utils.arrayify(SECRET));
    
    console.log("Source withdrawal transaction:", srcTx.hash);
    console.log("Destination withdrawal transaction:", dstTx.hash);
    
    // Wait for both transactions to be mined
    const [srcReceipt, dstReceipt] = await Promise.all([srcTx.wait(), dstTx.wait()]);
    
    console.log("✅ Source withdrawal confirmed in block:", srcReceipt.blockNumber);
    console.log("✅ Destination withdrawal confirmed in block:", dstReceipt.blockNumber);
    console.log("🎉 Cross-chain swap completed successfully!");
    
  } catch (error) {
    console.error("❌ Withdrawal failed:", error);
    throw error;
  }
}

// Run the withdrawal
executeWithdrawal()
  .then(() => {
    console.log("Withdrawal script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Withdrawal script failed:", error);
    process.exit(1);
  }); 