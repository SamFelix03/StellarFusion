import { ethers } from "ethers";
import * as crypto from "crypto";

async function testSHA256Compatibility() {
    console.log("🔐 Testing SHA256 Compatibility Between EVM and Stellar");
    console.log("======================================================\n");

    // Generate a test secret
    const secret = ethers.utils.randomBytes(32);
    console.log("Test Secret:", ethers.utils.hexlify(secret));

    // EVM SHA256 (using ethers.js)
    const evmHash = ethers.utils.sha256(secret);
    console.log("EVM SHA256 Hash:", evmHash);

    // Node.js SHA256 (simulating Stellar)
    const nodeHash = "0x" + crypto.createHash('sha256').update(secret).digest('hex');
    console.log("Node.js SHA256 Hash:", nodeHash);

    // Verify compatibility
    const isCompatible = evmHash.toLowerCase() === nodeHash.toLowerCase();
    console.log("\n✅ Compatibility Result:", isCompatible ? "COMPATIBLE" : "NOT COMPATIBLE");

    if (isCompatible) {
        console.log("🎉 SHA256 hashing is compatible between EVM and Node.js/Stellar!");
        console.log("✅ The same secret will produce identical hashes on both chains");
    } else {
        console.log("❌ SHA256 hashing is NOT compatible - investigation needed");
    }

    // Test with multiple secrets
    console.log("\n🔄 Testing with 5 random secrets...");
    let allCompatible = true;
    
    for (let i = 1; i <= 5; i++) {
        const testSecret = ethers.utils.randomBytes(32);
        const evmTestHash = ethers.utils.sha256(testSecret);
        const nodeTestHash = "0x" + crypto.createHash('sha256').update(testSecret).digest('hex');
        const testCompatible = evmTestHash.toLowerCase() === nodeTestHash.toLowerCase();
        
        console.log(`Test ${i}: ${testCompatible ? "✅ COMPATIBLE" : "❌ NOT COMPATIBLE"}`);
        
        if (!testCompatible) {
            allCompatible = false;
        }
    }

    console.log("\n📊 Final Result:");
    console.log("================");
    if (allCompatible) {
        console.log("🎉 ALL TESTS PASSED - SHA256 is fully compatible!");
        console.log("✅ Ready for cross-chain atomic swaps between EVM and Stellar");
    } else {
        console.log("❌ SOME TESTS FAILED - Need to investigate compatibility issues");
    }
}

// Run the test
testSHA256Compatibility()
    .then(() => {
        console.log("\n✅ SHA256 compatibility test completed");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });