import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY || "YOUR_RESOLVER_PRIVATE_KEY";
const dstProvider = new ethers.providers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
const resolverSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, dstProvider);

// Destination escrow address
const DST_ESCROW = "0x193da18e7bb3ba6fd3fd657d73bea92e2bfaa577";

// Secret from the last test
const SECRET = "0x9eb85442d635cb51697307bd0d21a7946dac25bd38df07ec9a82bf8279a8faab";

async function withdrawDestinationOnly() {
  try {
    console.log("=== Withdrawing from Destination Escrow Only ===");
    console.log("Destination escrow:", DST_ESCROW);
    console.log("Secret:", SECRET);
    
    // Destination chain withdrawal (BSC)
    const dstEscrowContract = new ethers.Contract(
      DST_ESCROW,
      ["function withdraw(bytes)"],
      resolverSigner
    );
    
    console.log("Executing destination withdrawal...");
    
    // Try with manual gas limit
    const tx = await dstEscrowContract.withdraw(
      ethers.utils.arrayify(SECRET),
      { gasLimit: 200000 } // Manual gas limit
    );
    
    console.log("Destination withdrawal transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("✅ Destination withdrawal confirmed in block:", receipt.blockNumber);
    console.log("🎉 Cross-chain swap fully completed!");
    
  } catch (error) {
    console.error("❌ Destination withdrawal failed:", error);
    
    // If it's still the recipient issue, let's check what the recipient should be
    if (error instanceof Error && error.message && error.message.includes("Only recipient in private window")) {
      console.log("\n--- Debugging Recipient Issue ---");
      console.log("The destination escrow recipient might be different from the resolver address.");
      console.log("Resolver address:", resolverSigner.address);
      console.log("This suggests the destination escrow was created with a different recipient.");
    }
    
    throw error;
  }
}

// Run the withdrawal
withdrawDestinationOnly()
  .then(() => {
    console.log("Destination withdrawal script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Destination withdrawal script failed:", error);
    process.exit(1);
  }); 