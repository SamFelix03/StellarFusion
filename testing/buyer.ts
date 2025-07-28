import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.infura.io/v3/YOUR_KEY";

const srcProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
const dstProvider = new ethers.providers.JsonRpcProvider(BSC_TESTNET_RPC_URL);

// Private keys
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY || "0x380c56cf5607c879be45c358b81b60a769e0e8d9064dd7c4ad9fdc0e1cbe7d14";
const buyerSigner = new ethers.Wallet(BUYER_PRIVATE_KEY, srcProvider);

// Contract addresses
const SEPOLIA_FACTORY_ADDRESS = process.env.SEPOLIA_FACTORY_ADDRESS || "0xe3d0a25d1c9D28216F3b1BD975a33E3D9D0CDAe1";
const BSC_TESTNET_FACTORY_ADDRESS = process.env.BSC_TESTNET_FACTORY_ADDRESS || "0x2fc7308a6D40c68fc47990eD29656fF7c8F6FBB2";

// Token addresses
const SEPOLIA_WETH = process.env.SEPOLIA_WETH || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
const BSC_TESTNET_WBNB = process.env.BSC_TESTNET_WBNB || "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

// Chain IDs
const srcChainId = 11155111; // Sepolia
const dstChainId = 97; // BSC Testnet

// Swap amounts: 0.01 WETH for 0.01 WBNB
const srcAmount = ethers.utils.parseEther("0.01");
const dstAmount = ethers.utils.parseEther("0.01");

// Time windows (in seconds from now)
const now = Math.floor(Date.now() / 1000);
const withdrawalStart = now + 60; // 1 minute from now
const publicWithdrawalStart = now + 300; // 5 minutes from now
const cancellationStart = now + 600; // 10 minutes from now
const publicCancellationStart = now + 900; // 15 minutes from now

// Local storage for orders
export interface Order {
  orderId: string;
  buyerAddress: string;
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: ethers.BigNumber;
  dstAmount: ethers.BigNumber;
  hashedSecret: string;
  secret: string;
  withdrawalStart: number;
  publicWithdrawalStart: number;
  cancellationStart: number;
  publicCancellationStart: number;
  srcEscrowAddress?: string;
}

export const localOrders: { [orderId: string]: Order } = {};

// WETH ABI for wrapping and approvals
const wethABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function deposit() payable",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)"
];

export function getOrderById(orderId: string): Order | null {
  return localOrders[orderId] || null;
}

export function getAllOrders(): Order[] {
  return Object.values(localOrders);
}

export async function createOrder(): Promise<{ orderCreation: { orderId: string; status: string; message: string }; shareSecret: () => void; secret: string }> {
  try {
    console.log("=== BUYER: Creating Cross-Chain Swap Order ===");
    console.log("Buyer Address:", buyerSigner.address);
    console.log("Swap: 0.01 WETH (Sepolia) → 0.01 WBNB (BSC Testnet)");
    
    // Generate secret and hash
    const secret = ethers.utils.randomBytes(32);
    const hashedSecret = ethers.utils.sha256(secret); // Changed from keccak256 to sha256
    const orderId = ethers.utils.id(hashedSecret + Date.now().toString()).slice(0, 10);
    
    console.log("Generated Order ID:", orderId);
    console.log("Secret:", secret);
    console.log("Hashed Secret:", hashedSecret);

    // Create order object
    const order: Order = {
      orderId,
      buyerAddress: buyerSigner.address,
      srcChainId,
      dstChainId,
      srcToken: SEPOLIA_WETH,
      dstToken: BSC_TESTNET_WBNB,
      srcAmount,
      dstAmount,
      hashedSecret,
      secret: ethers.utils.hexlify(secret),
      withdrawalStart,
      publicWithdrawalStart,
      cancellationStart,
      publicCancellationStart
    };

    // Store order locally
    localOrders[orderId] = order;

    console.log("\n--- Step 1: Check and Wrap ETH to WETH ---");
    
    // Check ETH balance
    const ethBalance = await srcProvider.getBalance(buyerSigner.address);
    console.log("ETH Balance:", ethers.utils.formatEther(ethBalance), "ETH");
    
    // Check WETH balance
    const wethContract = new ethers.Contract(SEPOLIA_WETH, wethABI, buyerSigner);
    const wethBalance = await wethContract.balanceOf(buyerSigner.address);
    console.log("Current WETH Balance:", ethers.utils.formatEther(wethBalance), "WETH");
    
    // If not enough WETH, wrap some ETH
    if (wethBalance.lt(srcAmount)) {
      const ethToWrap = srcAmount.sub(wethBalance).add(ethers.utils.parseEther("0.001")); // Add buffer
      console.log(`Wrapping ${ethers.utils.formatEther(ethToWrap)} ETH to WETH...`);
      
      const wrapTx = await wethContract.deposit({ value: ethToWrap });
      await wrapTx.wait();
      console.log("✅ ETH wrapped to WETH successfully");
      
      const newWethBalance = await wethContract.balanceOf(buyerSigner.address);
      console.log("New WETH Balance:", ethers.utils.formatEther(newWethBalance), "WETH");
    }

    console.log("\n--- Step 2: Approve Factory to Spend WETH ---");
    
    // Approve factory to spend WETH (resolver will call createSrcEscrow)
    const approvalTx = await wethContract.approve(SEPOLIA_FACTORY_ADDRESS, srcAmount);
    await approvalTx.wait();
    console.log("✅ Factory approved to spend WETH");

    console.log("\n=== Order Created Successfully ===");
    console.log("Order ID:", orderId);
    console.log("Time Windows:");
    console.log("  - Withdrawal Start:", new Date(withdrawalStart * 1000).toLocaleString());
    console.log("  - Public Withdrawal Start:", new Date(publicWithdrawalStart * 1000).toLocaleString());
    console.log("  - Cancellation Start:", new Date(cancellationStart * 1000).toLocaleString());
    console.log("\n⚠️  NOTE: Resolver needs to call createSrcEscrow to create the source escrow");

    return {
      orderCreation: {
        orderId,
        status: "success",
        message: "Order created successfully - waiting for resolver to create source escrow"
      },
      shareSecret: () => {
        console.log("\n=== SHARING SECRET ===");
        console.log("Secret:", ethers.utils.hexlify(secret));
        console.log("Share this secret with the resolver to complete the swap");
      },
      secret: ethers.utils.hexlify(secret)
    };

  } catch (error) {
    console.error("Error creating order:", error);
    return {
      orderCreation: {
        orderId: "",
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      shareSecret: () => {},
      secret: ""
    };
  }
}