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

async function checkEscrowDetails() {
  try {
    console.log("=== Checking Escrow Details ===");
    
    // Source escrow details
    const srcEscrowContract = new ethers.Contract(
      SRC_ESCROW,
      [
        "function recipient() view returns (address)",
        "function creator() view returns (address)",
        "function withdrawalStart() view returns (uint256)",
        "function publicWithdrawalStart() view returns (uint256)",
        "function tokenAmount() view returns (uint256)",
        "function token() view returns (address)"
      ],
      srcProvider
    );
    
    // Destination escrow details
    const dstEscrowContract = new ethers.Contract(
      DST_ESCROW,
      [
        "function recipient() view returns (address)",
        "function creator() view returns (address)",
        "function withdrawalStart() view returns (uint256)",
        "function publicWithdrawalStart() view returns (uint256)",
        "function tokenAmount() view returns (uint256)",
        "function token() view returns (address)"
      ],
      dstProvider
    );
    
    console.log("\n--- Source Escrow (Sepolia) ---");
    const srcRecipient = await srcEscrowContract.recipient();
    const srcCreator = await srcEscrowContract.creator();
    const srcTokenAmount = await srcEscrowContract.tokenAmount();
    const srcToken = await srcEscrowContract.token();
    
    console.log("Recipient:", srcRecipient);
    console.log("Creator:", srcCreator);
    console.log("Token Amount:", ethers.utils.formatEther(srcTokenAmount));
    console.log("Token Address:", srcToken);
    
    console.log("\n--- Destination Escrow (BSC) ---");
    const dstRecipient = await dstEscrowContract.recipient();
    const dstCreator = await dstEscrowContract.creator();
    const dstTokenAmount = await dstEscrowContract.tokenAmount();
    const dstToken = await dstEscrowContract.token();
    
    console.log("Recipient:", dstRecipient);
    console.log("Creator:", dstCreator);
    console.log("Token Amount:", ethers.utils.formatEther(dstTokenAmount));
    console.log("Token Address:", dstToken);
    
    console.log("\n--- Resolver Address ---");
    const RESOLVER_ADDRESS = "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844";
    console.log("Resolver:", RESOLVER_ADDRESS);
    
    console.log("\n--- Analysis ---");
    if (srcRecipient.toLowerCase() === RESOLVER_ADDRESS.toLowerCase()) {
      console.log("✅ Source escrow recipient matches resolver");
    } else {
      console.log("❌ Source escrow recipient does NOT match resolver");
    }
    
    if (dstRecipient.toLowerCase() === RESOLVER_ADDRESS.toLowerCase()) {
      console.log("✅ Destination escrow recipient matches resolver");
    } else {
      console.log("❌ Destination escrow recipient does NOT match resolver");
    }
    
  } catch (error) {
    console.error("Error checking escrow details:", error);
  }
}

checkEscrowDetails()
  .then(() => {
    console.log("Escrow check completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Escrow check failed:", error);
    process.exit(1);
  }); 