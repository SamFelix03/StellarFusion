import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const srcProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);

// Escrow address from the last test
const SRC_ESCROW = "0x7f24a062ed70e67cae551352e7821dd98c57ece3";

async function checkTime() {
  try {
    console.log("=== Checking Time Windows ===");
    
    // Get current block timestamp
    const currentBlock = await srcProvider.getBlock("latest");
    const currentTime = currentBlock.timestamp;
    
    console.log("Current block timestamp:", currentTime);
    console.log("Current time (human readable):", new Date(currentTime * 1000).toISOString());
    
    // Get escrow details
    const escrowContract = new ethers.Contract(
      SRC_ESCROW,
      [
        "function withdrawalStart() view returns (uint256)",
        "function publicWithdrawalStart() view returns (uint256)",
        "function cancellationStart() view returns (uint256)",
        "function publicCancellationStart() view returns (uint256)"
      ],
      srcProvider
    );
    
    const withdrawalStart = await escrowContract.withdrawalStart();
    const publicWithdrawalStart = await escrowContract.publicWithdrawalStart();
    const cancellationStart = await escrowContract.cancellationStart();
    const publicCancellationStart = await escrowContract.publicCancellationStart();
    
    console.log("\nEscrow Time Windows:");
    console.log("Withdrawal Start:", withdrawalStart.toString());
    console.log("Withdrawal Start (human readable):", new Date(withdrawalStart.toNumber() * 1000).toISOString());
    console.log("Public Withdrawal Start:", publicWithdrawalStart.toString());
    console.log("Cancellation Start:", cancellationStart.toString());
    console.log("Public Cancellation Start:", publicCancellationStart.toString());
    
    console.log("\nTime Analysis:");
    console.log("Time until withdrawal starts:", withdrawalStart.sub(currentTime).toString(), "seconds");
    console.log("Time until public withdrawal:", publicWithdrawalStart.sub(currentTime).toString(), "seconds");
    
    if (currentTime >= withdrawalStart.toNumber()) {
      console.log("✅ Withdrawal window is OPEN");
    } else {
      console.log("❌ Withdrawal window is CLOSED");
      const waitTime = withdrawalStart.sub(currentTime);
      console.log(`⏰ Need to wait ${waitTime.toString()} more seconds (${Math.ceil(waitTime.toNumber() / 60)} minutes)`);
    }
    
  } catch (error) {
    console.error("Error checking time:", error);
  }
}

checkTime()
  .then(() => {
    console.log("Time check completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Time check failed:", error);
    process.exit(1);
  }); 