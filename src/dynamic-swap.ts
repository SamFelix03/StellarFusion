import { ethers } from "ethers";
import * as dotenv from "dotenv";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import { PriceService } from "./price-service";

dotenv.config();

// Types
interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  factoryAddress: string;
  tokens: {
    [symbol: string]: {
      name: string;
      symbol: string;
      address: string;
      decimals: number;
      isNative: boolean;
    };
  };
}

interface SwapConfig {
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  sourceAmount: number;
  destinationAmount: number;
}

interface Order {
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

class DynamicSwapInterface {
  private chains: { [key: string]: ChainConfig } = {};
  private buyerPrivateKey: string;
  private resolverPrivateKey: string;

  constructor() {
    this.loadChainConfigs();
    this.buyerPrivateKey = process.env.BUYER_PRIVATE_KEY || "";
    this.resolverPrivateKey = process.env.RESOLVER_PRIVATE_KEY || "";
    
    if (!this.buyerPrivateKey || !this.resolverPrivateKey) {
      throw new Error("Please set BUYER_PRIVATE_KEY and RESOLVER_PRIVATE_KEY in .env file");
    }
  }

  private loadChainConfigs() {
    try {
      const configPath = path.join(process.cwd(), "config/chains.json");
      const configData = fs.readFileSync(configPath, "utf8");
      this.chains = JSON.parse(configData);
    } catch (error) {
      console.error("Error loading chain configurations:", error);
      throw new Error("Failed to load chain configurations");
    }
  }

  async start() {
    console.log("🚀 Welcome to Dynamic Cross-Chain Atomic Swap Interface");
    console.log("========================================================\n");

    try {
      const swapConfig = await this.getSwapConfiguration();
      await this.displaySwapSummary(swapConfig);
      
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Do you want to proceed with this swap?",
          default: false
        }
      ]);

      if (!confirm) {
        console.log("Swap cancelled by user.");
        return;
      }

      console.log("\n🔄 Executing Cross-Chain Swap...");
      await this.executeSwap(swapConfig);

    } catch (error) {
      console.error("❌ Error:", error);
    }
  }

  private async getSwapConfiguration(): Promise<SwapConfig> {
    const chainNames = Object.keys(this.chains);
    
    // Select source chain
    const { sourceChain } = await inquirer.prompt([
      {
        type: "list",
        name: "sourceChain",
        message: "Select source chain:",
        choices: chainNames.map(key => ({
          name: this.chains[key].name,
          value: key
        }))
      }
    ]);

    // Select destination chain (exclude source chain)
    const destinationChoices = chainNames
      .filter(key => key !== sourceChain)
      .map(key => ({
        name: this.chains[key].name,
        value: key
      }));

    const { destinationChain } = await inquirer.prompt([
      {
        type: "list",
        name: "destinationChain",
        message: "Select destination chain:",
        choices: destinationChoices
      }
    ]);

    // Select source token
    const sourceTokens = Object.keys(this.chains[sourceChain].tokens);
    const { sourceToken } = await inquirer.prompt([
      {
        type: "list",
        name: "sourceToken",
        message: "Select source token:",
        choices: sourceTokens.map(symbol => ({
          name: `${this.chains[sourceChain].tokens[symbol].name} (${symbol})`,
          value: symbol
        }))
      }
    ]);

    // Select destination token
    const destinationTokens = Object.keys(this.chains[destinationChain].tokens);
    const { destinationToken } = await inquirer.prompt([
      {
        type: "list",
        name: "destinationToken",
        message: "Select destination token:",
        choices: destinationTokens.map(symbol => ({
          name: `${this.chains[destinationChain].tokens[symbol].name} (${symbol})`,
          value: symbol
        }))
      }
    ]);

    // Get source amount
    const { sourceAmount } = await inquirer.prompt([
      {
        type: "number",
        name: "sourceAmount",
        message: `Enter amount of ${sourceToken} to swap:`,
        validate: (input: number) => {
          if (input <= 0) return "Amount must be greater than 0";
          return true;
        }
      }
    ]);

    // Calculate destination amount using price API
    console.log("\n💰 Fetching current prices...");
    try {
      const destinationAmount = await PriceService.calculateDestinationAmount(
        sourceToken,
        destinationToken,
        sourceAmount
      );

      return {
        sourceChain,
        destinationChain,
        sourceToken,
        destinationToken,
        sourceAmount,
        destinationAmount
      };
    } catch (error) {
      console.error("Error fetching prices:", error);
      
      // Fallback: ask user to enter destination amount manually
      const { manualDestAmount } = await inquirer.prompt([
        {
          type: "number",
          name: "manualDestAmount",
          message: `Unable to fetch prices. Enter destination amount of ${destinationToken} manually:`,
          validate: (input: number) => {
            if (input <= 0) return "Amount must be greater than 0";
            return true;
          }
        }
      ]);

      return {
        sourceChain,
        destinationChain,
        sourceToken,
        destinationToken,
        sourceAmount,
        destinationAmount: manualDestAmount
      };
    }
  }

  private async displaySwapSummary(config: SwapConfig) {
    console.log("\n📋 Swap Summary");
    console.log("===============");
    console.log(`Source: ${config.sourceAmount} ${config.sourceToken} on ${this.chains[config.sourceChain].name}`);
    console.log(`Destination: ${config.destinationAmount.toFixed(6)} ${config.destinationToken} on ${this.chains[config.destinationChain].name}`);
    
    try {
      const sourcePrice = await PriceService.getTokenPrice(config.sourceToken);
      const destPrice = await PriceService.getTokenPrice(config.destinationToken);
      
      console.log(`\n💵 Current Prices:`);
      console.log(`${config.sourceToken}: $${sourcePrice.toFixed(2)}`);
      console.log(`${config.destinationToken}: $${destPrice.toFixed(2)}`);
      
      const totalValue = config.sourceAmount * sourcePrice;
      console.log(`\nTotal Value: ~$${totalValue.toFixed(2)}`);
    } catch (error) {
      console.log("\n⚠️ Unable to fetch current prices for display");
    }
  }

  private async executeSwap(config: SwapConfig) {
    // Create providers
    const srcProvider = new ethers.providers.JsonRpcProvider(this.chains[config.sourceChain].rpcUrl);
    const dstProvider = new ethers.providers.JsonRpcProvider(this.chains[config.destinationChain].rpcUrl);
    
    // Create signers
    const buyerSigner = new ethers.Wallet(this.buyerPrivateKey, srcProvider);
    const resolverSigner = new ethers.Wallet(this.resolverPrivateKey, srcProvider);
    const dstSigner = new ethers.Wallet(this.resolverPrivateKey, dstProvider);

    console.log("\n👤 Participants:");
    console.log(`Buyer: ${buyerSigner.address}`);
    console.log(`Resolver: ${resolverSigner.address}`);

    // Generate order
    const order = await this.createOrder(config, buyerSigner.address);
    
    // Step 1: Buyer preparation
    console.log("\n📋 STEP 1: Buyer Preparation");
    console.log("-----------------------------");
    await this.prepareBuyer(config, buyerSigner, order);

    // Step 2: Resolver execution
    console.log("\n🔄 STEP 2: Resolver Execution");
    console.log("------------------------------");
    await this.executeResolverWorkflow(config, order, resolverSigner, dstSigner);

    console.log("\n🎉 Cross-Chain Swap Completed Successfully!");
    console.log("===========================================");
    console.log(`✅ Buyer received ${config.destinationAmount.toFixed(6)} ${config.destinationToken} on ${this.chains[config.destinationChain].name}`);
    console.log(`✅ Resolver received ${config.sourceAmount} ${config.sourceToken} on ${this.chains[config.sourceChain].name}`);
  }

  private async createOrder(config: SwapConfig, buyerAddress: string): Promise<Order> {
    // Generate secret and hash
    const secret = ethers.utils.randomBytes(32);
    const hashedSecret = ethers.utils.keccak256(secret);
    const orderId = ethers.utils.id(hashedSecret + Date.now().toString()).slice(0, 10);
    
    // Time windows (in seconds from now)
    const now = Math.floor(Date.now() / 1000);
    const withdrawalStart = now + 60; // 1 minute from now
    const publicWithdrawalStart = now + 300; // 5 minutes from now
    const cancellationStart = now + 600; // 10 minutes from now
    const publicCancellationStart = now + 900; // 15 minutes from now

    // Convert amounts to BigNumber based on token decimals
    const srcTokenConfig = this.chains[config.sourceChain].tokens[config.sourceToken];
    const dstTokenConfig = this.chains[config.destinationChain].tokens[config.destinationToken];
    
    const srcAmount = ethers.utils.parseUnits(config.sourceAmount.toString(), srcTokenConfig.decimals);
    const dstAmount = ethers.utils.parseUnits(config.destinationAmount.toString(), dstTokenConfig.decimals);

    return {
      orderId,
      buyerAddress,
      srcChainId: this.chains[config.sourceChain].chainId,
      dstChainId: this.chains[config.destinationChain].chainId,
      srcToken: srcTokenConfig.address,
      dstToken: dstTokenConfig.address,
      srcAmount,
      dstAmount,
      hashedSecret,
      secret: ethers.utils.hexlify(secret),
      withdrawalStart,
      publicWithdrawalStart,
      cancellationStart,
      publicCancellationStart
    };
  }

  private async prepareBuyer(config: SwapConfig, buyerSigner: ethers.Wallet, order: Order) {
    const srcTokenConfig = this.chains[config.sourceChain].tokens[config.sourceToken];
    const factoryAddress = this.chains[config.sourceChain].factoryAddress;

    if (srcTokenConfig.isNative) {
      // For native tokens, we need to wrap them first
      const wrappedTokenSymbol = config.sourceChain === 'sepolia' ? 'WETH' : 'WBNB';
      const wrappedTokenAddress = this.chains[config.sourceChain].tokens[wrappedTokenSymbol].address;
      
      console.log(`Wrapping ${config.sourceAmount} ${config.sourceToken} to ${wrappedTokenSymbol}...`);
      
      const wrapperABI = [
        "function deposit() payable",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)"
      ];
      
      const wrapperContract = new ethers.Contract(wrappedTokenAddress, wrapperABI, buyerSigner);
      
      // Wrap native token
      const wrapTx = await wrapperContract.deposit({ value: order.srcAmount });
      await wrapTx.wait();
      console.log("✅ Token wrapped successfully");
      
      // Approve factory
      const approveTx = await wrapperContract.approve(factoryAddress, order.srcAmount);
      await approveTx.wait();
      console.log("✅ Factory approved to spend wrapped tokens");
      
      // Update order to use wrapped token address
      order.srcToken = wrappedTokenAddress;
    } else {
      // For ERC20 tokens, just approve
      const tokenABI = [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)"
      ];
      
      const tokenContract = new ethers.Contract(srcTokenConfig.address, tokenABI, buyerSigner);
      
      console.log(`Approving ${config.sourceAmount} ${config.sourceToken}...`);
      const approveTx = await tokenContract.approve(factoryAddress, order.srcAmount);
      await approveTx.wait();
      console.log("✅ Factory approved to spend tokens");
    }
  }

  private async executeResolverWorkflow(
    config: SwapConfig,
    order: Order,
    resolverSigner: ethers.Wallet,
    dstSigner: ethers.Wallet
  ) {
    const srcProvider = resolverSigner.provider!;
    const dstProvider = dstSigner.provider!;
    
    const srcFactoryAddress = this.chains[config.sourceChain].factoryAddress;
    const dstFactoryAddress = this.chains[config.destinationChain].factoryAddress;

    // Step 1: Create source escrow
    console.log("Creating source escrow...");
    const srcFactoryContract = new ethers.Contract(srcFactoryAddress, factoryABI, resolverSigner);
    
    const createSrcEscrowTx = await srcFactoryContract.createSrcEscrow(
      order.hashedSecret,
      resolverSigner.address, // recipient is resolver
      order.buyerAddress, // buyer provides the tokens
      order.srcAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      { value: ethers.utils.parseEther("0.001") } // deposit amount
    );
    
    const srcReceipt = await createSrcEscrowTx.wait();
    console.log("✅ Source escrow created:", srcReceipt.transactionHash);
    
    // Extract source escrow address
    const srcEscrowCreatedTopic = ethers.utils.id("SrcEscrowCreated(address,address,address,bytes32,uint256,uint256,uint256,uint256,uint256)");
    const srcEscrowCreatedEvent = srcReceipt.logs.find((log: any) => 
      log.topics && log.topics[0] === srcEscrowCreatedTopic
    );
    
    let srcEscrowAddress = "";
    if (srcEscrowCreatedEvent) {
      srcEscrowAddress = ethers.utils.getAddress("0x" + srcEscrowCreatedEvent.data.slice(26, 66));
      console.log("✅ Source Escrow Address:", srcEscrowAddress);
      order.srcEscrowAddress = srcEscrowAddress;
    } else {
      throw new Error("Could not extract source escrow address from event");
    }

    // Step 2: Create destination escrow
    console.log("Creating destination escrow...");
    
    // Handle destination token preparation
    const dstTokenConfig = this.chains[config.destinationChain].tokens[config.destinationToken];
    let dstTokenAddress = order.dstToken;

    if (dstTokenConfig.isNative) {
      // For native tokens, we need to wrap them first
      const wrappedTokenSymbol = config.destinationChain === 'sepolia' ? 'WETH' : 'WBNB';
      const wrappedTokenAddress = this.chains[config.destinationChain].tokens[wrappedTokenSymbol].address;
      
      const wrapperABI = [
        "function deposit() payable",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)"
      ];
      
      const wrapperContract = new ethers.Contract(wrappedTokenAddress, wrapperABI, dstSigner);
      
      // Check balance and wrap if needed
      const balance = await wrapperContract.balanceOf(dstSigner.address);
      if (balance.lt(order.dstAmount)) {
        const amountToWrap = order.dstAmount.sub(balance).add(ethers.utils.parseEther("0.001"));
        console.log(`Wrapping ${ethers.utils.formatEther(amountToWrap)} ${config.destinationToken}...`);
        
        const wrapTx = await wrapperContract.deposit({ value: amountToWrap });
        await wrapTx.wait();
        console.log("✅ Token wrapped successfully");
      }
      
      // Approve factory
      const approveTx = await wrapperContract.approve(dstFactoryAddress, order.dstAmount);
      await approveTx.wait();
      console.log("✅ Factory approved to spend wrapped tokens");
      
      dstTokenAddress = wrappedTokenAddress;
    } else {
      // For ERC20 tokens, just approve
      const tokenABI = [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)"
      ];
      
      const tokenContract = new ethers.Contract(dstTokenConfig.address, tokenABI, dstSigner);
      
      const approveTx = await tokenContract.approve(dstFactoryAddress, order.dstAmount);
      await approveTx.wait();
      console.log("✅ Factory approved to spend tokens");
    }

    // Create destination escrow
    const dstFactoryContract = new ethers.Contract(dstFactoryAddress, factoryABI, dstSigner);
    
    const createDstEscrowTx = await dstFactoryContract.createDstEscrow(
      order.hashedSecret,
      order.buyerAddress, // recipient is buyer
      order.dstAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      { value: ethers.utils.parseEther("0.001") } // deposit amount
    );
    
    const dstReceipt = await createDstEscrowTx.wait();
    console.log("✅ Destination escrow created:", dstReceipt.transactionHash);
    
    // Extract destination escrow address
    const dstEscrowCreatedTopic = ethers.utils.id("DstEscrowCreated(address,address,address,bytes32,uint256,uint256,uint256)");
    const dstEscrowCreatedEvent = dstReceipt.logs.find((log: any) => 
      log.topics && log.topics[0] === dstEscrowCreatedTopic
    );
    
    let dstEscrowAddress = "";
    if (dstEscrowCreatedEvent) {
      dstEscrowAddress = ethers.utils.getAddress("0x" + dstEscrowCreatedEvent.data.slice(26, 66));
      console.log("✅ Destination Escrow Address:", dstEscrowAddress);
    } else {
      // Fallback method
      const factoryEvent = dstReceipt.logs.find((log: any) => 
        log.address.toLowerCase() === dstFactoryAddress.toLowerCase()
      );
      
      if (factoryEvent) {
        dstEscrowAddress = ethers.utils.getAddress("0x" + factoryEvent.data.slice(26, 66));
        console.log("✅ Destination Escrow Address:", dstEscrowAddress);
      } else {
        throw new Error("Could not determine destination escrow address");
      }
    }

    // Step 3: Wait for withdrawal window
    console.log("Waiting for withdrawal window...");
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = order.withdrawalStart - currentTime;
    
    if (timeToWait > 0) {
      console.log(`Waiting ${timeToWait} seconds for withdrawal window to open...`);
      await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
    }

    // Step 4: Execute withdrawals
    console.log("Executing withdrawals...");
    
    const srcEscrowContract = new ethers.Contract(srcEscrowAddress, escrowABI, srcProvider);
    const dstEscrowContract = new ethers.Contract(dstEscrowAddress, escrowABI, dstProvider);
    
    // Withdraw from source escrow (resolver gets tokens)
    console.log("Withdrawing from source escrow...");
    const srcWithdrawTx = await srcEscrowContract.connect(resolverSigner).withdraw(order.secret, {
      gasLimit: 150000,
      maxFeePerGas: ethers.utils.parseUnits("15", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
    });
    await srcWithdrawTx.wait();
    console.log("✅ Source escrow withdrawal completed");
    
    // Withdraw from destination escrow (buyer gets tokens)
    console.log("Withdrawing from destination escrow...");
    const dstWithdrawTx = await dstEscrowContract.connect(dstSigner).withdraw(order.secret, {
      gasLimit: 150000,
      gasPrice: ethers.utils.parseUnits("2", "gwei")
    });
    await dstWithdrawTx.wait();
    console.log("✅ Destination escrow withdrawal completed");
    
    console.log("✅ Swap execution completed successfully!");
  }
}

// ABI definitions
const factoryABI = [
  "function createSrcEscrow(bytes32 hashedSecret, address recipient, address buyer, uint256 tokenAmount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 publicCancellationStart) external payable",
  "function createDstEscrow(bytes32 hashedSecret, address recipient, uint256 tokenAmount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart) external payable"
];

const escrowABI = [
  "function withdraw(bytes calldata secret) external",
  "function recipient() view returns (address)",
  "function creator() view returns (address)",
  "function amount() view returns (uint256)",
  "function token() view returns (address)"
];

// Main execution
async function main() {
  try {
    const swapInterface = new DynamicSwapInterface();
    await swapInterface.start();
  } catch (error) {
    console.error("❌ Application error:", error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main()
    .then(() => {
      console.log("\n✅ Application completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Application failed:", error);
      process.exit(1);
    });
}

export { DynamicSwapInterface }; 