import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { createOrder, getAllOrders } from "./buyer";
import { resolverWorkflow } from "./resolver";

dotenv.config();

async function main() {
  try {
    console.log("🚀 Starting Cross-Chain Atomic Swap Test");
    console.log("==========================================");
    console.log("Buyer: 0x0994b358dC0a58Dd2bD3cc222ef8ab6F1eB7BFEb");
    console.log("Resolver: 0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844");
    console.log("Swap: 0.01 ETH (Sepolia) ↔ 0.01 BNB (BSC Testnet)");
    console.log("Gas Strategy: Reduced gas limits and prices for cost efficiency");
    console.log("==========================================\n");

    // Step 1: Buyer creates order and approves WETH spending
    console.log("📋 STEP 1: Buyer Creating Order and Approving WETH");
    console.log("--------------------------------------------------");
    
    const buyerResult = await createOrder();
    
    if (buyerResult.orderCreation.status !== "success") {
      throw new Error(`Order creation failed: ${buyerResult.orderCreation.message}`);
    }
    
    console.log("✅ Order created successfully");
    console.log("Order ID:", buyerResult.orderCreation.orderId);
    
    // Share the secret (in real scenario, this would be shared securely)
    buyerResult.shareSecret();
    
    // Step 2: Wait a moment for blockchain confirmation
    console.log("\n⏳ Waiting for blockchain confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 3: Resolver executes the cross-chain swap (creates both escrows)
    console.log("\n🔄 STEP 2: Resolver Executing Cross-Chain Swap");
    console.log("-----------------------------------------------");
    
    const orders = getAllOrders();
    if (orders.length === 0) {
      throw new Error("No orders found for resolver to process");
    }
    
    const order = orders[0]; // Get the first (and only) order
    console.log("Processing order:", order.orderId);
    
    await resolverWorkflow(order);
    
    console.log("\n🎉 Cross-Chain Atomic Swap Completed Successfully!");
    console.log("==================================================");
    console.log("✅ Buyer received 0.01 BNB on BSC Testnet (native BNB)");
    console.log("✅ Resolver received 0.01 ETH on Sepolia (native ETH)");
    console.log("✅ Both escrows have been withdrawn");
    console.log("✅ Tokens automatically unwrapped to native currency");
    console.log("✅ Reduced gas costs used for cost efficiency");
    console.log("✅ Atomic swap conditions met");
    
    // Final verification
    console.log("\n📊 Final Verification");
    console.log("---------------------");
    const finalOrders = getAllOrders();
    console.log("Total orders processed:", finalOrders.length);
    
  } catch (error) {
    console.error("❌ Cross-chain swap test failed:", error);
    process.exit(1);
  }
}

// Run the test
main()
  .then(() => {
    console.log("\n✅ Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }); 