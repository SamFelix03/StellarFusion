import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { localOrders, getOrderById, getAllOrders, Order } from "./buyer";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.infura.io/v3/YOUR_KEY";

const srcProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
const dstProvider = new ethers.providers.JsonRpcProvider(BSC_TESTNET_RPC_URL);

// Private keys
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY || "0x7a425200e31e8409c27abbc9aaae49a94c314426ef2e569d3a33ffc289a34e76";
const resolverSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, srcProvider);
const dstSigner = new ethers.Wallet(RESOLVER_PRIVATE_KEY, dstProvider);

// Contract addresses
const SEPOLIA_FACTORY_ADDRESS = process.env.SEPOLIA_FACTORY_ADDRESS || "0xe3d0a25d1c9D28216F3b1BD975a33E3D9D0CDAe1";
const BSC_TESTNET_FACTORY_ADDRESS = process.env.BSC_TESTNET_FACTORY_ADDRESS || "0x2fc7308a6D40c68fc47990eD29656fF7c8F6FBB2";

// Token addresses
const SEPOLIA_WETH = process.env.SEPOLIA_WETH || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
const BSC_TESTNET_WBNB = process.env.BSC_TESTNET_WBNB || "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

// Factory ABI
const factoryABI = [
  "function createSrcEscrow(bytes32 hashedSecret, address recipient, address buyer, uint256 tokenAmount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 publicCancellationStart) external payable",
  "function createDstEscrow(bytes32 hashedSecret, address recipient, uint256 tokenAmount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart) external payable"
];

// Escrow ABI
const escrowABI = [
  "function withdraw(bytes calldata secret) external",
  "function recipient() view returns (address)",
  "function creator() view returns (address)",
  "function amount() view returns (uint256)",
  "function token() view returns (address)"
];

// WBNB ABI for wrapping
const wbnbABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function deposit() payable",
  "function approve(address spender, uint256 amount) returns (bool)"
];

export async function resolverWorkflow(order: Order): Promise<void> {
  try {
    console.log("=== RESOLVER: Executing Cross-Chain Swap ===");
    console.log("Resolver Address:", resolverSigner.address);
    console.log("Order ID:", order.orderId);
    console.log("Swap: 0.01 WETH (Sepolia) → 0.01 WBNB (BSC Testnet)");
    
    if (!order.srcEscrowAddress) {
      throw new Error("Source escrow address not found in order");
    }

    console.log("\n--- Step 1: Create Destination Escrow on BSC Testnet ---");
    
    // First, wrap BNB to WBNB if needed
    const wbnbContract = new ethers.Contract(
      BSC_TESTNET_WBNB,
      wbnbABI,
      dstSigner
    );

    // Check WBNB balance
    const wbnbBalance = await wbnbContract.balanceOf(dstSigner.address);
    console.log("Current WBNB balance:", ethers.utils.formatEther(wbnbBalance), "WBNB");

    // If not enough WBNB, wrap some BNB
    if (wbnbBalance.lt(order.dstAmount)) {
      const bnbToWrap = order.dstAmount.sub(wbnbBalance).add(ethers.utils.parseEther("0.001")); // Add buffer
      console.log(`Wrapping ${ethers.utils.formatEther(bnbToWrap)} BNB to WBNB...`);

      const wrapTx = await wbnbContract.deposit({ value: bnbToWrap });
      await wrapTx.wait();
      console.log("✅ BNB wrapped to WBNB successfully");
      
      const newWbnbBalance = await wbnbContract.balanceOf(dstSigner.address);
      console.log("New WBNB Balance:", ethers.utils.formatEther(newWbnbBalance), "WBNB");
    }

    // Approve factory to spend WBNB
    const approvalTx = await wbnbContract.approve(BSC_TESTNET_FACTORY_ADDRESS, order.dstAmount);
    await approvalTx.wait();
    console.log("✅ Factory approved to spend WBNB");

    // Create destination escrow
    const dstFactoryContract = new ethers.Contract(BSC_TESTNET_FACTORY_ADDRESS, factoryABI, dstSigner);

    const createDstEscrowTx = await dstFactoryContract.createDstEscrow(
    order.hashedSecret,
      order.buyerAddress, // recipient is the buyer (they will receive BNB)
      order.dstAmount,
    order.withdrawalStart,
    order.publicWithdrawalStart,
    order.cancellationStart,
      { value: ethers.utils.parseEther("0.001") } // deposit amount
  );
  
    const dstReceipt = await createDstEscrowTx.wait();
    console.log("✅ Destination escrow creation transaction:", dstReceipt.transactionHash);
    
    // Debug: Log all events to understand the structure
    console.log("Destination escrow receipt logs:", dstReceipt.logs.length);
    dstReceipt.logs.forEach((log: any, index: number) => {
      console.log(`Log ${index}:`, {
        topics: log.topics,
        data: log.data,
        address: log.address
      });
    });

    // Extract destination escrow address from event - try multiple approaches
    let dstEscrowAddress = "";
    
    // Method 1: Look for DstEscrowCreated event by topic hash
    const dstEscrowCreatedTopic = ethers.utils.id("DstEscrowCreated(address,address,address,bytes32,uint256,uint256,uint256)");
    const dstEscrowCreatedEvent = dstReceipt.logs.find((log: any) => 
      log.topics && log.topics[0] === dstEscrowCreatedTopic
    );
    
    if (dstEscrowCreatedEvent) {
      console.log("Found DstEscrowCreated event:", dstEscrowCreatedEvent);
      // The escrow address should be the first parameter in the event data
      dstEscrowAddress = ethers.utils.getAddress("0x" + dstEscrowCreatedEvent.data.slice(26, 66));
      console.log("✅ Destination Escrow Address (method 1):", dstEscrowAddress);
    } else {
      // Method 2: Look for any event with the factory address
      const factoryEvent = dstReceipt.logs.find((log: any) => 
        log.address.toLowerCase() === BSC_TESTNET_FACTORY_ADDRESS.toLowerCase()
      );
      
      if (factoryEvent) {
        console.log("Found factory event:", factoryEvent);
        // Try to extract address from the first 32 bytes of data
        dstEscrowAddress = ethers.utils.getAddress("0x" + factoryEvent.data.slice(26, 66));
        console.log("✅ Destination Escrow Address (method 2):", dstEscrowAddress);
      } else {
        // Method 3: Use the transaction receipt to find the created contract
        // This is a fallback - the contract address might be in the receipt
        console.log("⚠️ Could not extract destination escrow address from events");
        console.log("Transaction receipt:", dstReceipt);
        throw new Error("Could not determine destination escrow address");
      }
    }

    console.log("\n--- Step 2: Wait for Withdrawal Window to Open ---");
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = order.withdrawalStart - currentTime;
    
    if (timeToWait > 0) {
      console.log(`Waiting ${timeToWait} seconds for withdrawal window to open...`);
      await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
    }

    console.log("\n--- Step 3: Execute Cross-Chain Swap ---");

    // Check escrow details before withdrawal
    console.log("Checking source escrow details...");
    const srcEscrowContract = new ethers.Contract(order.srcEscrowAddress, escrowABI, srcProvider);
    const srcRecipient = await srcEscrowContract.recipient();
    const srcCreator = await srcEscrowContract.creator();
    const srcAmount = await srcEscrowContract.amount();
    console.log("Source Escrow Details:");
    console.log("  - Recipient:", srcRecipient);
    console.log("  - Creator:", srcCreator);
    console.log("  - Amount:", ethers.utils.formatEther(srcAmount), "WETH");
    
    console.log("Checking destination escrow details...");
    const dstEscrowContract = new ethers.Contract(dstEscrowAddress, escrowABI, dstProvider);
    const dstRecipient = await dstEscrowContract.recipient();
    const dstCreator = await dstEscrowContract.creator();
    const dstAmount = await dstEscrowContract.amount();
    console.log("Destination Escrow Details:");
    console.log("  - Recipient:", dstRecipient);
    console.log("  - Creator:", dstCreator);
    console.log("  - Amount:", ethers.utils.formatEther(dstAmount), "WBNB");
    
    // Withdraw from source escrow (Sepolia) - resolver gets ETH (unwrapped from WETH)
    console.log("Withdrawing from source escrow on Sepolia...");
    const srcWithdrawTx = await srcEscrowContract.connect(resolverSigner).withdraw(order.secret);
    const srcWithdrawReceipt = await srcWithdrawTx.wait();
    console.log("✅ Source escrow withdrawal transaction:", srcWithdrawReceipt.transactionHash);
  
    // Withdraw from destination escrow (BSC) - buyer gets BNB (unwrapped from WBNB)
    console.log("Withdrawing from destination escrow on BSC Testnet...");
    const dstWithdrawTx = await dstEscrowContract.connect(dstSigner).withdraw(order.secret);
    const dstWithdrawReceipt = await dstWithdrawTx.wait();
    console.log("✅ Destination escrow withdrawal transaction:", dstWithdrawReceipt.transactionHash);

    console.log("\n=== Cross-Chain Swap Completed Successfully ===");
    console.log("✅ Buyer received 0.01 BNB on BSC Testnet (unwrapped from WBNB)");
    console.log("✅ Resolver received 0.01 ETH on Sepolia (unwrapped from WETH)");
    console.log("✅ Both escrows have been withdrawn");
    
    // Verify final balances - check native ETH/BNB balances
    const finalResolverEth = await srcProvider.getBalance(resolverSigner.address);
    const finalBuyerBnb = await dstProvider.getBalance(order.buyerAddress);
    
    console.log("\n--- Final Balances (Native Tokens) ---");
    console.log("Resolver ETH:", ethers.utils.formatEther(finalResolverEth), "ETH");
    console.log("Buyer BNB:", ethers.utils.formatEther(finalBuyerBnb), "BNB");
    
    // Additional verification
    if (finalBuyerBnb.gt(ethers.utils.parseEther("0.01"))) {
      console.log("✅ SUCCESS: Buyer has received BNB!");
    } else {
      console.log("❌ ERROR: Buyer has not received BNB!");
    }

  } catch (error) {
    console.error("Error in resolver workflow:", error);
    throw error;
  }
}

export async function processAllOrders(): Promise<void> {
  console.log("Processing all available orders...");
  const orders = getAllOrders();
  
  if (orders.length === 0) {
    console.log("No orders found to process");
    return;
  }
  
  for (const order of orders) {
    console.log(`\nProcessing order: ${order.orderId}`);
    try {
      await resolverWorkflow(order);
      console.log(`✅ Order ${order.orderId} processed successfully`);
    } catch (error) {
      console.error(`❌ Failed to process order ${order.orderId}:`, error);
    }
  }
}