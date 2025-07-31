import { ethers } from "ethers";
import * as dotenv from "dotenv";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import { PriceService } from "./price-service";
import { HashLock, PartialFillOrderManager } from "./hash-lock";
import { 
  Keypair, 
  TransactionBuilder, 
  Networks, 
  Operation, 
  Asset, 
  Contract, 
  SorobanRpc,
  Address,
  nativeToScVal,
  scValToNative
} from "stellar-sdk";

dotenv.config();

// Types
interface ChainConfig {
  name: string;
  chainId: number | string; // Support both number (EVM) and string (Stellar)
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  factoryAddress: string;
  lopAddress?: string; // Optional LOP address for ETH/EVM chains
  tokens: {
    [symbol: string]: {
      name: string;
      symbol: string;
      address: string;
      decimals: number;
      isNative: boolean;
    };
  };
  isStellar?: boolean; // Flag to identify Stellar chains
}

interface SwapConfig {
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  sourceAmount: number;
  destinationAmount: number;
  enablePartialFills?: boolean;
  partsCount?: number;
}

interface Order {
  orderId: string;
  buyerAddress: string;
  srcChainId: number | string; // Support both EVM (number) and Stellar (string)
  dstChainId: number | string; // Support both EVM (number) and Stellar (string)
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
  // Partial fill support
  isPartialFillEnabled?: boolean;
  partialFillManager?: PartialFillOrderManager;
  filledParts?: boolean[]; // Track which parts have been filled
  partAmounts?: ethers.BigNumber[]; // Amount for each part
}

interface PartialFillSegment {
  index: number;
  secret: string;
  secretHash: string;
  leaf: string;
  proof: string[];
  srcAmount: ethers.BigNumber;
  dstAmount: ethers.BigNumber;
  percentage: number;
  filled: boolean;
  srcEscrowAddress?: string;
  dstEscrowAddress?: string;
}

class DynamicSwapInterface {
  private chains: { [key: string]: ChainConfig } = {};
  private buyerPrivateKey: string;
  private resolverPrivateKey: string;
  private stellarServer: SorobanRpc.Server;
  private stellarBuyerKeypair: Keypair | null = null;
  private stellarResolverKeypair: Keypair | null = null;

  constructor() {
    this.loadChainConfigs();
    this.buyerPrivateKey = process.env.BUYER_PRIVATE_KEY || "";
    this.resolverPrivateKey = process.env.RESOLVER_PRIVATE_KEY || "";
    
    if (!this.buyerPrivateKey || !this.resolverPrivateKey) {
      throw new Error("Please set BUYER_PRIVATE_KEY and RESOLVER_PRIVATE_KEY in .env file");
    }

    // Initialize Stellar SDK
    this.stellarServer = new SorobanRpc.Server('https://soroban-testnet.stellar.org:443');
    
    // Initialize Stellar keypairs from env if available
    try {
      if (process.env.STELLAR_BUYER_SECRET) {
        this.stellarBuyerKeypair = Keypair.fromSecret(process.env.STELLAR_BUYER_SECRET);
      }
      if (process.env.STELLAR_RESOLVER_SECRET) {
        this.stellarResolverKeypair = Keypair.fromSecret(process.env.STELLAR_RESOLVER_SECRET);
      }
    } catch (error) {
      console.warn("⚠️ Stellar keypairs not configured properly. Using hardcoded addresses.");
    }
  }

  private loadChainConfigs() {
    try {
      const configPath = path.join(process.cwd(), "config/chains.json");
      const configData = fs.readFileSync(configPath, "utf8");
      this.chains = JSON.parse(configData);
      
      // Mark Stellar chains
      Object.keys(this.chains).forEach(chainKey => {
        if (chainKey.includes('stellar')) {
          this.chains[chainKey].isStellar = true;
        }
      });
    } catch (error) {
      console.error("Error loading chain configurations:", error);
      throw new Error("Failed to load chain configurations");
    }
  }

  private isStellarChain(chainKey: string): boolean {
    return this.chains[chainKey]?.isStellar === true;
  }

  private getStellarAddresses() {
    return {
      buyer: process.env.STELLAR_BUYER_ADDRESS || "",
      resolver: process.env.STELLAR_RESOLVER_ADDRESS || ""
    };
  }

  private async executeStellarSwap(config: SwapConfig, isSrcStellar: boolean, isDstStellar: boolean) {
    console.log("\n🌟 STELLAR CROSS-CHAIN SWAP");
    console.log("============================");
    
    const stellarAddresses = this.getStellarAddresses();
    console.log(`Stellar Buyer: ${stellarAddresses.buyer}`);
    console.log(`Stellar Resolver: ${stellarAddresses.resolver}`);
    
    // Generate order with proper buyer address
    const buyerAddress = isSrcStellar ? stellarAddresses.buyer : 
                        new ethers.Wallet(this.buyerPrivateKey).address;
    const order = await this.createOrder(config, buyerAddress);
    
    console.log("\n📋 Order Details:");
    console.log(`Order ID: ${order.orderId}`);
    console.log(`Source Chain: ${config.sourceChain} ${isSrcStellar ? '(Stellar)' : '(EVM)'}`);
    console.log(`Destination Chain: ${config.destinationChain} ${isDstStellar ? '(Stellar)' : '(EVM)'}`);
    console.log(`Amount: ${config.sourceAmount} ${config.sourceToken} → ${config.destinationAmount} ${config.destinationToken}`);
    console.log(`Secret: ${order.secret}`);
    console.log(`Hashed Secret: ${order.hashedSecret}`);
    
    if (isSrcStellar && isDstStellar) {
      console.log("\n🔄 STELLAR ↔ STELLAR SWAP");
      await this.executeStellarToStellarSwap(config, order);
    } else if (isSrcStellar) {
      console.log("\n🔄 STELLAR → EVM SWAP");
      await this.executeStellarToEvmSwap(config, order);
    } else if (isDstStellar) {
      console.log("\n🔄 EVM → STELLAR SWAP");
      await this.executeEvmToStellarSwap(config, order);
    }
    
    console.log("\n🎉 Stellar Cross-Chain Swap Process Completed!");
    console.log("==============================================");
  }

  private async executeStellarToStellarSwap(config: SwapConfig, order: Order) {
    console.log("\n🔧 STELLAR → STELLAR SWAP EXECUTION");
    console.log("-----------------------------------");
    
    const stellarAddresses = this.getStellarAddresses();
    
    // Step 1: Prepare buyer on Stellar source chain
    console.log(`\n📝 Step 1: Prepare buyer on Stellar source chain`);
    await this.prepareStellarBuyer(config, order);
    
    // Step 2: Prepare resolver on Stellar destination chain  
    console.log(`\n📝 Step 2: Prepare resolver on Stellar destination chain`);
    await this.prepareStellarResolver(config, order);
    
    // Step 3: Create source escrow on Stellar
    console.log(`\n📝 Step 3: Create source escrow on Stellar`);
    const stellarSrcResult = await this.createStellarSourceEscrow(
      stellarAddresses.resolver, // creator (resolver)
      stellarAddresses.resolver, // recipient (resolver)
      order.hashedSecret,
      config.sourceAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      order.isPartialFillEnabled ? 0 : 0, // part index (0 for first part, whether partial or single)
      order.isPartialFillEnabled && order.partialFillManager ? order.partialFillManager.getPartsCount() : 1 // total parts
    );
    
    if (!stellarSrcResult.success) {
      console.log(`❌ Stellar source escrow creation failed: ${stellarSrcResult.error}`);
      return;
    }
    
    // Step 4: Create destination escrow on Stellar
    console.log(`\n📝 Step 4: Create destination escrow on Stellar`);
    const stellarDstResult = await this.createStellarDestinationEscrow(
      stellarAddresses.resolver, // creator (resolver)
      stellarAddresses.buyer, // recipient (buyer)
      order.hashedSecret,
      config.destinationAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.isPartialFillEnabled ? 0 : 0, // part index (0 for first part, whether partial or single)
      order.isPartialFillEnabled && order.partialFillManager ? order.partialFillManager.getPartsCount() : 1 // total parts
    );
    
    if (!stellarDstResult.success) {
      console.log(`❌ Stellar destination escrow creation failed: ${stellarDstResult.error}`);
      return;
    }
    
    // Step 5: Wait for withdrawal window
    console.log(`\n📝 Step 5: Wait for withdrawal window`);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = order.withdrawalStart - currentTime;
    
    if (timeToWait > 0) {
      console.log(`⏳ Waiting ${timeToWait} seconds for withdrawal window...`);
      await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
    }
    
    // Step 6: Execute withdrawals
    console.log(`\n📝 Step 6: Execute Stellar source escrow withdrawal (resolver gets source tokens)`);
    
    let srcWithdrawal;
    if (order.isPartialFillEnabled && order.partialFillManager) {
      // For partial fills, we need to use the first segment's proof
      const segments = this.createPartialFillSegments(order, config);
      if (segments.length > 0) {
        const firstSegment = segments[0];
        srcWithdrawal = await this.withdrawFromStellarEscrow(
          stellarSrcResult.escrowAddress || "",
          firstSegment.secret, // Use segment-specific secret
          stellarAddresses.resolver,
          firstSegment.proof, // Pass the merkle proof
          true, // is partial fill
          true // this is source escrow withdrawal
        );
      } else {
        console.log("❌ No partial fill segments found");
        return;
      }
    } else {
      // For single fills, use the main order secret
      srcWithdrawal = await this.withdrawFromStellarEscrow(
        stellarSrcResult.escrowAddress || "",
        order.secret,
        stellarAddresses.resolver,
        undefined, // no merkle proof for full fills
        false, // not partial fill
        true // this is source escrow withdrawal
      );
    }
    
    if (srcWithdrawal.success) {
      console.log(`\n📝 Step 7: Execute Stellar destination escrow withdrawal (buyer gets destination tokens)`);
      
      let dstWithdrawal;
      if (order.isPartialFillEnabled && order.partialFillManager) {
        // For partial fills, use the first segment's proof
        const segments = this.createPartialFillSegments(order, config);
        if (segments.length > 0) {
          const firstSegment = segments[0];
          dstWithdrawal = await this.withdrawFromStellarEscrow(
            stellarDstResult.escrowAddress || "",
            firstSegment.secret, // Use segment-specific secret
            stellarAddresses.resolver, // Resolver calls withdrawal for buyer
            firstSegment.proof, // Pass the merkle proof
            true, // is partial fill
            false // this is destination escrow withdrawal
          );
        } else {
          console.log("❌ No partial fill segments found");
          return;
        }
      } else {
        // For single fills, use the main order secret
        dstWithdrawal = await this.withdrawFromStellarEscrow(
          stellarDstResult.escrowAddress || "",
          order.secret,
          stellarAddresses.resolver, // Resolver calls withdrawal for buyer
          undefined, // no merkle proof for full fills
          false, // not partial fill
          false // this is destination escrow withdrawal
        );
      }
      
      if (dstWithdrawal.success) {
        console.log("\n🎉 STELLAR ↔ STELLAR SWAP COMPLETED SUCCESSFULLY!");
        console.log("===============================================");
        console.log(`✅ Buyer received ${config.destinationAmount} ${config.destinationToken} on Stellar`);
        console.log(`✅ Resolver received ${config.sourceAmount} ${config.sourceToken} on Stellar`);
        console.log(`🔗 Both used SHA256 hashing for cross-chain compatibility`);
      } else {
        console.log(`❌ Stellar destination withdrawal failed: ${dstWithdrawal.error}`);
      }
    } else {
      console.log(`❌ Stellar source withdrawal failed: ${srcWithdrawal.error}`);
    }
    
    console.log("\n✅ Stellar → Stellar swap execution completed!");
  }

  private async executeStellarToEvmSwap(config: SwapConfig, order: Order) {
    console.log("\n🔧 STELLAR → EVM SWAP EXECUTION");
    console.log("-------------------------------");
    
    const stellarAddresses = this.getStellarAddresses();
    
    // Step 1: Prepare buyer on Stellar source chain
    console.log(`\n📝 Step 1: Prepare buyer on Stellar source chain`);
    await this.prepareStellarBuyer(config, order);
    
    // Step 2: Create source escrow on Stellar
    console.log(`\n📝 Step 2: Create source escrow on Stellar`);
    console.log(`   Stellar Factory: ${this.chains['stellar-testnet']?.factoryAddress}`);
    console.log(`   Buyer: ${stellarAddresses.buyer}`);
    console.log(`   Amount: ${config.sourceAmount} ${config.sourceToken}`);
    
    const stellarSrcResult = await this.createStellarSourceEscrow(
      stellarAddresses.resolver, // creator (resolver)
      stellarAddresses.resolver, // recipient (resolver gets source tokens)
      order.hashedSecret,
      config.sourceAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      order.isPartialFillEnabled ? 0 : 0, // part index (0 for first part, whether partial or single)
      order.isPartialFillEnabled && order.partialFillManager ? order.partialFillManager.getPartsCount() : 1 // total parts
    );
    
    if (!stellarSrcResult.success) {
      console.log(`❌ Stellar source escrow creation failed: ${stellarSrcResult.error}`);
      return;
    }
    
    // Step 3: Create destination escrow on EVM
    console.log(`\n📝 Step 3: Create destination escrow on EVM (${config.destinationChain})`);
    console.log(`   EVM Factory: ${this.chains[config.destinationChain].factoryAddress}`);
    
    const dstProvider = new ethers.providers.JsonRpcProvider(this.chains[config.destinationChain].rpcUrl);
    const dstSigner = new ethers.Wallet(this.resolverPrivateKey, dstProvider);
    const buyerAddress = new ethers.Wallet(this.buyerPrivateKey).address;
    
    const evmDstEscrowAddress = await this.createEvmDestinationEscrow(config, order, dstSigner, buyerAddress);
    
    // Step 4: Wait for withdrawal window and execute swaps
    console.log(`\n📝 Step 4: Wait for withdrawal window and execute swaps`);
    console.log(`   Withdrawal starts at: ${new Date(order.withdrawalStart * 1000).toLocaleString()}`);
    
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = order.withdrawalStart - currentTime;
    
    if (timeToWait > 0) {
      console.log(`\n⏳ Waiting ${timeToWait} seconds for withdrawal window...`);
      await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
    }
    
    // Step 5: Execute Stellar withdrawal first (resolver gets source tokens)
    console.log(`\n📝 Step 5: Execute Stellar source escrow withdrawal`);
    
    let stellarWithdrawal;
    if (order.isPartialFillEnabled && order.partialFillManager) {
      // For partial fills, we need to use the first segment's proof
      const segments = this.createPartialFillSegments(order, config);
      if (segments.length > 0) {
        const firstSegment = segments[0];
        stellarWithdrawal = await this.withdrawFromStellarEscrow(
          stellarSrcResult.escrowAddress || "",
          firstSegment.secret, // Use segment-specific secret
          stellarAddresses.resolver,
          firstSegment.proof, // Pass the merkle proof
          true, // is partial fill
          true // this is source escrow withdrawal (Stellar→EVM withdraws from src escrow on Stellar)
        );
      } else {
        console.log("❌ No partial fill segments found");
        return;
      }
    } else {
      // For single fills, use the main order secret
      stellarWithdrawal = await this.withdrawFromStellarEscrow(
        stellarSrcResult.escrowAddress || "",
        order.secret,
        stellarAddresses.resolver,
        undefined, // no merkle proof for full fills
        false, // not partial fill
        true // this is source escrow withdrawal (Stellar→EVM withdraws from src escrow on Stellar)
      );
    }
    
    if (stellarWithdrawal.success) {
      // Step 6: Execute EVM withdrawal (buyer gets destination tokens)
      console.log(`\n📝 Step 6: Execute EVM destination escrow withdrawal`);
      await this.withdrawFromEvmEscrow(evmDstEscrowAddress, order.secret, dstSigner);
      
      console.log("\n🎉 CROSS-CHAIN SWAP COMPLETED SUCCESSFULLY!");
      console.log("==============================================");
      console.log(`✅ Buyer received ${config.destinationAmount} ${config.destinationToken} on EVM`);
      console.log(`✅ Resolver received ${config.sourceAmount} ${config.sourceToken} on Stellar`);
    } else {
      console.log(`❌ Stellar withdrawal failed: ${stellarWithdrawal.error}`);
    }
    
    console.log("\n✅ Stellar → EVM swap execution completed!");
  }

  private async executeEvmToStellarSwap(config: SwapConfig, order: Order) {
    console.log("\n🔧 EVM → STELLAR SWAP EXECUTION");
    console.log("-------------------------------");
    
    const stellarAddresses = this.getStellarAddresses();
    
    // Create EVM provider and signers for source chain
    const srcProvider = new ethers.providers.JsonRpcProvider(this.chains[config.sourceChain].rpcUrl);
    const buyerSigner = new ethers.Wallet(this.buyerPrivateKey, srcProvider);
    const resolverSigner = new ethers.Wallet(this.resolverPrivateKey, srcProvider);
    
    // Step 1: Prepare buyer on EVM source chain
    console.log(`\n📝 Step 1: Prepare buyer on EVM (${config.sourceChain})`);
    console.log(`   Buyer: ${buyerSigner.address}`);
    console.log(`   Amount: ${config.sourceAmount} ${config.sourceToken}`);
    
    await this.prepareBuyer(config, buyerSigner, order);

    // Step 2: Prepare resolver on Stellar destination chain
    console.log(`\n📝 Step 2: Prepare resolver on Stellar destination chain`);
    await this.prepareStellarResolver(config, order);

    // Step 3: Create source escrow on EVM
    console.log(`\n📝 Step 3: Create source escrow on EVM`);
    console.log(`   EVM Factory: ${this.chains[config.sourceChain].factoryAddress}`);
    
    await this.executeSourceEscrowOnly(config, order, resolverSigner);

    // Step 4: Create destination escrow on Stellar
    console.log(`\n📝 Step 4: Create destination escrow on Stellar`);
    console.log(`   Stellar Factory: ${this.chains['stellar-testnet']?.factoryAddress}`);
    console.log(`   Resolver: ${stellarAddresses.resolver}`);
    console.log(`   Recipient: ${stellarAddresses.buyer}`);
    console.log(`   Amount: ${config.destinationAmount} ${config.destinationToken}`);
    
    const stellarResult = await this.createStellarDestinationEscrow(
      stellarAddresses.resolver,
      stellarAddresses.buyer,
      order.hashedSecret,
      config.destinationAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.isPartialFillEnabled ? 0 : 0, // part index (0 for first part, whether partial or single)
      order.isPartialFillEnabled && order.partialFillManager ? order.partialFillManager.getPartsCount() : 1 // total parts
    );
    
    if (stellarResult.success) {
      // Step 5: Wait for withdrawal window and execute atomic swap
      console.log(`\n📝 Step 5: Execute cross-chain atomic swap`);
      console.log(`   Secret will be revealed on Stellar and used to withdraw from EVM`);
      console.log(`   Withdrawal starts at: ${new Date(order.withdrawalStart * 1000).toLocaleString()}`);
      
      const currentTime = Math.floor(Date.now() / 1000);
      const timeToWait = order.withdrawalStart - currentTime;
      
      if (timeToWait > 0) {
        console.log(`\n⏳ Waiting ${timeToWait} seconds for withdrawal window...`);
        await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
      }
      
      // Step 6: Execute EVM withdrawal first (resolver gets the source tokens)
      console.log(`\n📝 Step 6: Execute EVM source escrow withdrawal`);
      await this.withdrawFromEvmEscrow(order.srcEscrowAddress!, order.secret, resolverSigner);
      
      // Step 7: Execute Stellar withdrawal (buyer gets destination tokens)
      console.log(`\n📝 Step 7: Execute Stellar destination escrow withdrawal`);
      
      let withdrawalResult;
      if (order.isPartialFillEnabled && order.partialFillManager) {
        // For partial fills, we need to use the first segment's proof
        const segments = this.createPartialFillSegments(order, config);
        if (segments.length > 0) {
          const firstSegment = segments[0];
          withdrawalResult = await this.withdrawFromStellarEscrow(
            stellarResult.escrowAddress || "",
            firstSegment.secret, // Use segment-specific secret
            this.getStellarAddresses().resolver, // RESOLVER calls the withdrawal, not buyer
            firstSegment.proof, // Pass the merkle proof
            true, // is partial fill
            false // this is destination escrow withdrawal (EVM→Stellar creates dst escrow on Stellar)
          );
        } else {
          console.log("❌ No partial fill segments found");
          return;
        }
      } else {
        // For single fills, use the main order secret
        withdrawalResult = await this.withdrawFromStellarEscrow(
          stellarResult.escrowAddress || "",
          order.secret,
          this.getStellarAddresses().resolver, // RESOLVER calls the withdrawal, not buyer
          undefined, // no merkle proof for full fills
          false, // not partial fill
          false // this is destination escrow withdrawal (EVM→Stellar creates dst escrow on Stellar)
        );
      }
      
      if (withdrawalResult.success) {
        console.log("\n🎉 CROSS-CHAIN SWAP COMPLETED SUCCESSFULLY!");
        console.log("==============================================");
        console.log(`✅ Buyer received ${config.destinationAmount} ${config.destinationToken} on Stellar`);
        console.log(`✅ Resolver received ${config.sourceAmount} ${config.sourceToken} on EVM`);
        console.log(`🔗 Both chains used SHA256 hashing for cross-chain compatibility`);
      } else {
        console.log(`❌ Stellar withdrawal failed: ${withdrawalResult.error}`);
      }
    } else {
      console.log(`❌ Stellar destination escrow creation failed: ${stellarResult.error}`);
    }
    
    console.log("\n✅ EVM → Stellar swap execution completed!");
  }

  // Stellar contract interaction methods
  private async createStellarDestinationEscrow(
    creator: string,
    recipient: string,
    hashedSecret: string,
    amount: number,
    withdrawalStart: number,
    publicWithdrawalStart: number,
    cancellationStart: number,
    partIndex?: number,
    totalParts?: number
  ) {
    console.log(`\n🌟 Creating Stellar Destination Escrow...`);
    
    try {

      const contractAddress = this.chains['stellar-testnet']?.factoryAddress;
      if (!contractAddress) {
        throw new Error("Stellar factory address not configured");
      }

      // Convert amount to stroops (XLM has 7 decimals)
      const amountInStroops = Math.floor(amount * 10000000);
      
      // Set default values for partial fill parameters
      const actualPartIndex = partIndex || 0;
      const actualTotalParts = totalParts || 1;
      
      console.log("🔍 Debug - Parameters being passed:");
      console.log(`  creator: ${creator}`);
      console.log(`  hashed_secret: ${hashedSecret}`);
      console.log(`  recipient: ${recipient}`);
      console.log(`  token_amount: ${amountInStroops} (${amount} XLM)`);
      console.log(`  withdrawal_start: ${withdrawalStart}`);
      console.log(`  public_withdrawal_start: ${publicWithdrawalStart}`);
      console.log(`  cancellation_start: ${cancellationStart}`);
      console.log(`  part_index: ${actualPartIndex}`);
      console.log(`  total_parts: ${actualTotalParts}`);
      
      // Use CLI approach instead of SDK for better compatibility
      const { execSync } = require('child_process');
      
      // Use separate partial fill function if needed, otherwise use regular function
      const functionName = (actualPartIndex > 0 || actualTotalParts > 1) ? 'create_dst_escrow_partial' : 'create_dst_escrow';
      
      let command: string;
      if (functionName === 'create_dst_escrow_partial') {
        // Partial fill function with all parameters
        command = `soroban contract invoke --id ${contractAddress} --source stellar-resolver --network testnet -- ${functionName} --creator ${creator} --hashed_secret ${hashedSecret.slice(2)} --recipient ${recipient} --token_amount ${amountInStroops} --withdrawal_start ${withdrawalStart} --public_withdrawal_start ${publicWithdrawalStart} --cancellation_start ${cancellationStart} --part_index ${actualPartIndex} --total_parts ${actualTotalParts}`;
      } else {
        // Regular function without partial fill parameters
        command = `soroban contract invoke --id ${contractAddress} --source stellar-resolver --network testnet -- ${functionName} --creator ${creator} --hashed_secret ${hashedSecret.slice(2)} --recipient ${recipient} --token_amount ${amountInStroops} --withdrawal_start ${withdrawalStart} --public_withdrawal_start ${publicWithdrawalStart} --cancellation_start ${cancellationStart}`;
      }
      
      console.log("📤 Executing CLI command...");
      console.log(`Command: ${command}`);
      
      const result = execSync(command, { encoding: 'utf8' });
      
      console.log("✅ Stellar destination escrow created successfully!");
      console.log(`📋 Result: ${result.trim()}`);
      
      return {
        success: true,
        escrowAddress: result.trim().replace(/"/g, ''),
        transactionHash: 'CLI_SUCCESS',
        message: 'Destination escrow created successfully'
      };
      
    } catch (error) {
      console.error(`❌ Error creating Stellar destination escrow:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async createStellarSourceEscrow(
    creator: string,
    recipient: string,
    hashedSecret: string,
    amount: number,
    withdrawalStart: number,
    publicWithdrawalStart: number,
    cancellationStart: number,
    publicCancellationStart: number,
    partIndex?: number,
    totalParts?: number
  ) {
    console.log(`\n🌟 Creating Stellar Source Escrow...`);
    
    try {
      const contractAddress = this.chains['stellar-testnet']?.factoryAddress;
      if (!contractAddress) {
        throw new Error("Stellar factory address not configured");
      }

      const stellarAddresses = this.getStellarAddresses();
      const amountInStroops = Math.floor(amount * 10000000);
      
      // Set default values for partial fill parameters
      const actualPartIndex = partIndex || 0;
      const actualTotalParts = totalParts || 1;
      
      console.log("🔍 Debug - Parameters being passed:");
      console.log(`  creator: ${creator}`);
      console.log(`  hashed_secret: ${hashedSecret}`);
      console.log(`  recipient: ${recipient}`);
      console.log(`  buyer: ${stellarAddresses.buyer}`);
      console.log(`  token_amount: ${amountInStroops} (${amount} XLM)`);
      console.log(`  withdrawal_start: ${withdrawalStart}`);
      console.log(`  public_withdrawal_start: ${publicWithdrawalStart}`);
      console.log(`  cancellation_start: ${cancellationStart}`);
      console.log(`  public_cancellation_start: ${publicCancellationStart}`);
      console.log(`  part_index: ${actualPartIndex}`);
      console.log(`  total_parts: ${actualTotalParts}`);
      
      // Use CLI approach for better compatibility
      const { execSync } = require('child_process');
      
      // Use separate partial fill function if needed, otherwise use regular function
      const functionName = (actualPartIndex > 0 || actualTotalParts > 1) ? 'create_src_escrow_partial' : 'create_src_escrow';
      
      let command: string;
      if (functionName === 'create_src_escrow_partial') {
        // Partial fill function with all parameters (note: no public_cancellation_start as we reduced params)
        command = `soroban contract invoke --id ${contractAddress} --source stellar-resolver --network testnet -- ${functionName} --creator ${creator} --hashed_secret ${hashedSecret.slice(2)} --recipient ${recipient} --buyer ${stellarAddresses.buyer} --token_amount ${amountInStroops} --withdrawal_start ${withdrawalStart} --public_withdrawal_start ${publicWithdrawalStart} --cancellation_start ${cancellationStart} --part_index ${actualPartIndex} --total_parts ${actualTotalParts}`;
      } else {
        // Regular function without partial fill parameters
        command = `soroban contract invoke --id ${contractAddress} --source stellar-resolver --network testnet -- ${functionName} --creator ${creator} --hashed_secret ${hashedSecret.slice(2)} --recipient ${recipient} --buyer ${stellarAddresses.buyer} --token_amount ${amountInStroops} --withdrawal_start ${withdrawalStart} --public_withdrawal_start ${publicWithdrawalStart} --cancellation_start ${cancellationStart} --public_cancellation_start ${publicCancellationStart}`;
      }
      
      console.log("📤 Executing CLI command...");
      console.log(`Command: ${command}`);
      
      const result = execSync(command, { encoding: 'utf8' });
      
      console.log("✅ Stellar source escrow created successfully!");
      console.log(`📋 Result: ${result.trim()}`);
      
      return {
        success: true,
        escrowAddress: result.trim().replace(/"/g, ''),
        transactionHash: 'CLI_SUCCESS',
        message: 'Source escrow created successfully'
      };
      
    } catch (error) {
      console.error(`❌ Error creating Stellar source escrow:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async withdrawFromStellarEscrow(
    escrowAddress: string,
    secret: string,
    caller: string,
    merkleProof?: string[],
    isPartialFill?: boolean,
    isSourceEscrow?: boolean
  ) {
    console.log(`\n🌟 Withdrawing from Stellar Escrow...`);
    
    try {
      const stellarAddresses = this.getStellarAddresses();
      const isResolver = caller === stellarAddresses.resolver;
      const sourceKey = isResolver ? 'stellar-resolver' : 'stellar-buyer';

      const contractAddress = this.chains['stellar-testnet']?.factoryAddress;
      if (!contractAddress) {
        throw new Error("Stellar factory address not configured");
      }

      // Determine method name based on escrow type and partial fill
      const isSource = isSourceEscrow !== undefined ? isSourceEscrow : escrowAddress.includes('src');
      let methodName = isSource ? 'withdraw_src_escrow' : 'withdraw_dst_escrow';
      
      // If partial fill, use the proof-based method
      if (isPartialFill && merkleProof && merkleProof.length > 0) {
        methodName = isSource ? 'withdraw_src_escrow_with_proof' : 'withdraw_dst_escrow_with_proof';
      }
      
      // Use CLI approach for better compatibility
      const { execSync } = require('child_process');
      
      let command: string;
      if (isPartialFill && merkleProof && merkleProof.length > 0) {
        // Convert merkle proof to CLI format - Soroban CLI expects JSON array format
        // Format: --merkle_proof '[ "hex1", "hex2" ]' (with quotes around each element)
        const proofArray = merkleProof.map(p => `"${p.slice(2)}"`); // Remove 0x prefix and add quotes
        const proofStr = `[ ${proofArray.join(', ')} ]`;
        command = `soroban contract invoke --id ${contractAddress} --source ${sourceKey} --network testnet -- ${methodName} --caller ${caller} --escrow_address ${escrowAddress} --secret ${secret.slice(2)} --merkle_proof '${proofStr}'`;
        console.log(`🔍 Partial fill withdrawal with merkle proof (${merkleProof.length} elements)`);
        console.log(`   Proof format: ${proofStr}`);
      } else {
        command = `soroban contract invoke --id ${contractAddress} --source ${sourceKey} --network testnet -- ${methodName} --caller ${caller} --escrow_address ${escrowAddress} --secret ${secret.slice(2)}`;
        console.log(`🔍 Single fill withdrawal (no merkle proof needed)`);
      }
      
      console.log("📤 Executing withdrawal CLI command...");
      console.log(`Command: ${command}`);
      
      const result = execSync(command, { encoding: 'utf8' });
      
      console.log("✅ Stellar escrow withdrawal completed successfully!");
      console.log(`📋 Result: ${result.trim()}`);
      
      return {
        success: true,
        transactionHash: 'CLI_SUCCESS',
        message: 'Withdrawal completed successfully'
      };
      
    } catch (error) {
      console.error(`❌ Error withdrawing from Stellar escrow:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async withdrawFromStellarEscrowPartial(
    escrowAddress: string,
    segment: PartialFillSegment,
    caller: string,
    isSourceEscrow?: boolean
  ) {
    console.log(`\n🌟 Withdrawing from Stellar Escrow (Partial Fill - Part ${segment.index})...`);
    
    try {
      const stellarAddresses = this.getStellarAddresses();
      const isResolver = caller === stellarAddresses.resolver;
      const sourceKey = isResolver ? 'stellar-resolver' : 'stellar-buyer';

      const contractAddress = this.chains['stellar-testnet']?.factoryAddress;
      if (!contractAddress) {
        throw new Error("Stellar factory address not configured");
      }

      // Determine method name based on escrow type
      const isSource = isSourceEscrow !== undefined ? isSourceEscrow : escrowAddress.includes('src');
      const methodName = isSource ? 'withdraw_src_escrow_with_proof' : 'withdraw_dst_escrow_with_proof';
      
      // Use CLI approach for better compatibility
      const { execSync } = require('child_process');
      
      // Convert merkle proof to CLI format - Soroban CLI expects a specific format for Vec<BytesN<32>>
      // Each proof element should be passed as a separate argument
      const proofArgs = segment.proof.map(p => p.slice(2)).join(' ');
      const command = `soroban contract invoke --id ${contractAddress} --source ${sourceKey} --network testnet -- ${methodName} --caller ${caller} --escrow_address ${escrowAddress} --secret ${segment.secret.slice(2)} --merkle_proof ${proofArgs}`;
      
      console.log(`🔍 Partial fill withdrawal for part ${segment.index}:`);
      console.log(`   Secret: ${segment.secret.slice(0, 10)}...`);
      console.log(`   Proof elements: ${segment.proof.length}`);
      console.log(`   Leaf: ${segment.leaf}`);
      
      console.log("📤 Executing withdrawal CLI command...");
      console.log(`Command: ${command}`);
      
      const result = execSync(command, { encoding: 'utf8' });
      
      console.log("✅ Stellar partial fill escrow withdrawal completed successfully!");
      console.log(`📋 Result: ${result.trim()}`);
      
      return {
        success: true,
        transactionHash: 'CLI_SUCCESS',
        message: `Partial fill withdrawal completed for part ${segment.index}`
      };
      
    } catch (error) {
      console.error(`❌ Error withdrawing from Stellar partial fill escrow:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async withdrawFromEvmEscrow(escrowAddress: string, secret: string, signer: ethers.Wallet) {
    console.log(`\n🔧 Withdrawing from EVM Escrow: ${escrowAddress}`);
    
    try {
      const escrowContract = new ethers.Contract(escrowAddress, escrowABI, signer);
      
      const withdrawTx = await escrowContract.withdraw(secret, {
        gasLimit: 150000,
        maxFeePerGas: ethers.utils.parseUnits("15", "gwei"),
        maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
      });
      
      await withdrawTx.wait();
      console.log("✅ EVM escrow withdrawal completed");
      console.log(`📋 Transaction Hash: ${withdrawTx.hash}`);
      
    } catch (error) {
      console.error(`❌ Error withdrawing from EVM escrow:`, error);
      throw error;
    }
  }

  private async createEvmDestinationEscrow(config: SwapConfig, order: Order, dstSigner: ethers.Wallet, buyerAddress: string): Promise<string> {
    // Handle destination token preparation
    const dstTokenConfig = this.chains[config.destinationChain].tokens[config.destinationToken];
    let dstTokenAddress = order.dstToken;
    const dstFactoryAddress = this.chains[config.destinationChain].factoryAddress;

    if (dstTokenConfig.isNative) {
      // For native tokens, we need to wrap them first
      const wrappedTokenSymbol = config.destinationChain.includes('sepolia') ? 'WETH' : 'WBNB';
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
      buyerAddress, // recipient is buyer
      order.dstAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      0,  // partIndex = 0 for complete fill
      1,  // totalParts = 1 for complete fill
      { value: ethers.utils.parseEther("0.001") } // deposit amount
    );
    
    const dstReceipt = await createDstEscrowTx.wait();
    console.log("✅ EVM destination escrow created:", dstReceipt.transactionHash);
    
    // Extract escrow address from receipt
    const escrowAddress = this.extractEscrowAddressFromReceipt(dstReceipt);
    console.log("📋 EVM destination escrow address:", escrowAddress);
    
    return escrowAddress;
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

    // Ask about partial fills
    const { enablePartialFills } = await inquirer.prompt([
      {
        type: "confirm",
        name: "enablePartialFills",
        message: "Enable partial fills (allow order to be filled in multiple parts)?",
        default: false
      }
    ]);

    let partsCount = 1;
    if (enablePartialFills) {
      const { partsCountInput } = await inquirer.prompt([
        {
          type: "number",
          name: "partsCountInput",
          message: "How many parts should the order be divided into? (2-8):",
          default: 4,
          validate: (input: number) => {
            if (input < 2 || input > 8) return "Parts count must be between 2 and 8";
            if (!Number.isInteger(input)) return "Parts count must be a whole number";
            return true;
          }
        }
      ]);
      partsCount = partsCountInput;
    }

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
        destinationAmount,
        enablePartialFills,
        partsCount
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
        destinationAmount: manualDestAmount,
        enablePartialFills,
        partsCount
      };
    }
  }

  private async displaySwapSummary(config: SwapConfig) {
    console.log("\n📋 Swap Summary");
    console.log("===============");
    console.log(`Source: ${config.sourceAmount} ${config.sourceToken} on ${this.chains[config.sourceChain].name}`);
    console.log(`Destination: ${config.destinationAmount.toFixed(6)} ${config.destinationToken} on ${this.chains[config.destinationChain].name}`);
    
    if (config.enablePartialFills) {
      console.log(`\n🔀 Partial Fill Settings:`);
      console.log(`Parts Count: ${config.partsCount}`);
      console.log(`Per Part: ~${(config.sourceAmount / config.partsCount!).toFixed(6)} ${config.sourceToken} → ~${(config.destinationAmount / config.partsCount!).toFixed(6)} ${config.destinationToken}`);
    }
    
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
    // Check if either chain is Stellar
    const isSrcStellar = this.isStellarChain(config.sourceChain);
    const isDstStellar = this.isStellarChain(config.destinationChain);
    
    if (isSrcStellar || isDstStellar) {
      console.log("🌟 Stellar chain detected - using Stellar integration");
      
      // Generate order with proper buyer address
      const stellarAddresses = this.getStellarAddresses();
      const buyerAddress = isSrcStellar ? stellarAddresses.buyer : 
                          new ethers.Wallet(this.buyerPrivateKey).address;
      const order = await this.createOrder(config, buyerAddress);
      
      console.log("\n📋 Order Details:");
      console.log(`Order ID: ${order.orderId}`);
      console.log(`Source Chain: ${config.sourceChain} ${isSrcStellar ? '(Stellar)' : '(EVM)'}`);
      console.log(`Destination Chain: ${config.destinationChain} ${isDstStellar ? '(Stellar)' : '(EVM)'}`);
      console.log(`Amount: ${config.sourceAmount} ${config.sourceToken} → ${config.destinationAmount} ${config.destinationToken}`);
      console.log(`Secret: ${order.secret}`);
      console.log(`Hashed Secret: ${order.hashedSecret}`);
      
      // Check if partial fills are enabled
      if (order.isPartialFillEnabled) {
        // Execute partial fill workflow for Stellar
        await this.executePartialFillWorkflow(config, order);
      } else {
        // Execute single fill workflow for Stellar
        if (isSrcStellar && isDstStellar) {
          console.log("\n🔄 STELLAR ↔ STELLAR SWAP");
          await this.executeStellarToStellarSwap(config, order);
        } else if (isSrcStellar) {
          console.log("\n🔄 STELLAR → EVM SWAP");
          await this.executeStellarToEvmSwap(config, order);
        } else if (isDstStellar) {
          console.log("\n🔄 EVM → STELLAR SWAP");
          await this.executeEvmToStellarSwap(config, order);
        }
      }
      
      console.log("\n🎉 Stellar Cross-Chain Swap Process Completed!");
      console.log("==============================================");
      return;
    }
    
    // Original EVM-only logic
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
    
    // Check if partial fills are enabled
    if (order.isPartialFillEnabled) {
      // Execute partial fill workflow
      await this.executePartialFillWorkflow(config, order);
    } else {
      // Execute single fill workflow
      // Step 1: Buyer preparation
      console.log("\n📋 STEP 1: Buyer Preparation");
      console.log("-----------------------------");
      await this.prepareBuyer(config, buyerSigner, order);

      // Step 2: Resolver execution
      console.log("\n🔄 STEP 2: Resolver Execution");
      console.log("------------------------------");
      await this.executeResolverWorkflow(config, order, resolverSigner, dstSigner);
    }

    console.log("\n🎉 Cross-Chain Swap Completed Successfully!");
    console.log("===========================================");
    console.log(`✅ Buyer received ${config.destinationAmount.toFixed(6)} ${config.destinationToken} on ${this.chains[config.destinationChain].name}`);
    console.log(`✅ Resolver received ${config.sourceAmount} ${config.sourceToken} on ${this.chains[config.sourceChain].name}`);
  }

  private async createOrder(config: SwapConfig, buyerAddress: string): Promise<Order> {
    let secret: string;
    let hashedSecret: string;
    let partialFillManager: PartialFillOrderManager | undefined;
    let partAmounts: ethers.BigNumber[] | undefined;
    let filledParts: boolean[] | undefined;

    if (config.enablePartialFills && config.partsCount! > 1) {
      // Create partial fill manager with merkle tree
      partialFillManager = new PartialFillOrderManager(config.partsCount!);
      hashedSecret = partialFillManager.getHashLock();
      // Use first secret as the main order secret (for backwards compatibility)
      secret = partialFillManager.getSecret(0);
      
      // Initialize tracking arrays for parts
      filledParts = Array(config.partsCount).fill(false);
      
      console.log(`\n🌳 Generated Merkle Tree for ${config.partsCount} parts:`);
      console.log(`📋 HashLock (Merkle Root): ${hashedSecret}`);
      console.log(`🔐 Total secrets generated: ${config.partsCount! + 1}`);
    } else {
      // Single fill - generate traditional secret and hash
      const secretBytes = ethers.utils.randomBytes(32);
      secret = ethers.utils.hexlify(secretBytes);
      hashedSecret = ethers.utils.sha256(secretBytes);
    }
    
    // Time windows (in seconds from now) - use system time
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

    // Calculate part amounts if partial fills are enabled
    if (config.enablePartialFills && config.partsCount! > 1) {
      partAmounts = [];
      const srcAmountPerPart = srcAmount.div(config.partsCount!);
      const dstAmountPerPart = dstAmount.div(config.partsCount!);
      
      for (let i = 0; i < config.partsCount!; i++) {
        partAmounts.push(srcAmountPerPart);
      }
      
      console.log(`💰 Part amounts calculated:`);
      console.log(`   Source per part: ${ethers.utils.formatUnits(srcAmountPerPart, srcTokenConfig.decimals)} ${config.sourceToken}`);
      console.log(`   Destination per part: ${ethers.utils.formatUnits(dstAmountPerPart, dstTokenConfig.decimals)} ${config.destinationToken}`);
    }

    // Generate orderId using proper BigNumber format
    const orderId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['string', 'address', 'string', 'uint256', 'string'],
        [hashedSecret + Date.now().toString(), buyerAddress, 'ETH->XLM', srcAmount, hashedSecret]
      )
    );

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
      secret,
      withdrawalStart,
      publicWithdrawalStart,
      cancellationStart,
      publicCancellationStart,
      isPartialFillEnabled: config.enablePartialFills,
      partialFillManager,
      filledParts,
      partAmounts
    };
  }

  private createPartialFillSegments(order: Order, config: SwapConfig): PartialFillSegment[] {
    if (!order.isPartialFillEnabled || !order.partialFillManager || !order.partAmounts) {
      return [];
    }

    const segments: PartialFillSegment[] = [];
    const partsCount = order.partialFillManager.getPartsCount();
    const srcAmountPerPart = order.srcAmount.div(partsCount);
    const dstAmountPerPart = order.dstAmount.div(partsCount);

    console.log(`\n🔍 DEBUG - Amount calculations:`);
    console.log(`   Total srcAmount: ${ethers.utils.formatUnits(order.srcAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
    console.log(`   Parts count: ${partsCount}`);
    console.log(`   SrcAmount per part: ${ethers.utils.formatUnits(srcAmountPerPart, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
    console.log(`   SrcAmount per part (raw): ${srcAmountPerPart.toString()}`);

    for (let i = 0; i < partsCount; i++) {
      const segment: PartialFillSegment = {
        index: i,
        secret: order.partialFillManager.getSecret(i),
        secretHash: order.partialFillManager.getSecretHash(i),
        leaf: order.partialFillManager.getLeaf(i),
        proof: order.partialFillManager.getProof(i),
        srcAmount: srcAmountPerPart,
        dstAmount: dstAmountPerPart,
        percentage: (100 / partsCount) * (i + 1),
        filled: false
      };
      segments.push(segment);
    }

    console.log(`\n📦 Created ${segments.length} partial fill segments:`);
    segments.forEach((segment, idx) => {
      console.log(`   Part ${idx}: ${ethers.utils.formatUnits(segment.srcAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken} (${segment.percentage.toFixed(1)}%)`);
    });

    return segments;
  }

  private async executePartialFillWorkflow(config: SwapConfig, order: Order) {
    if (!order.isPartialFillEnabled) {
      console.log("⚠️ Order does not have partial fills enabled");
      return;
    }

    console.log("\n🔀 PARTIAL FILL EXECUTION");
    console.log("=========================");
    console.log(`Order will be filled in ${order.partialFillManager!.getPartsCount()} parts by the resolver`);

    // Check if either chain is Stellar
    const isSrcStellar = this.isStellarChain(config.sourceChain);
    const isDstStellar = this.isStellarChain(config.destinationChain);
    
    if (isSrcStellar || isDstStellar) {
      console.log("🌟 Stellar chain detected in partial fill workflow");
      console.log("🔄 Implementing Stellar partial fill workflow...");
      
      // Create segments
      const segments = this.createPartialFillSegments(order, config);
      
      // Create signers for EVM chains (if any)
      const srcProvider = new ethers.providers.JsonRpcProvider(this.chains[config.sourceChain].rpcUrl);
      const dstProvider = new ethers.providers.JsonRpcProvider(this.chains[config.destinationChain].rpcUrl);
      const buyerSigner = new ethers.Wallet(this.buyerPrivateKey, srcProvider);
      const resolverSigner = new ethers.Wallet(this.resolverPrivateKey, srcProvider);
      const dstSigner = new ethers.Wallet(this.resolverPrivateKey, dstProvider);

      // Step 1: Buyer preparation (full amount approval)
      console.log("\n📋 STEP 1: Buyer Preparation (Full Amount Approval)");
      console.log("----------------------------------------------------");
      if (isSrcStellar) {
        await this.prepareStellarBuyer(config, order);
      } else {
        await this.prepareBuyer(config, buyerSigner, order);
      }

      // Step 2: Resolver fills the order in parts
      console.log("\n🔄 STEP 2: Resolver Executes Partial Fills");
      console.log("-------------------------------------------");
      
      let totalFilled = ethers.BigNumber.from(0);
      let fillStatus = {
        totalParts: segments.length,
        completedParts: 0,
        remainingParts: segments.length,
        totalFilledAmount: totalFilled,
        percentageComplete: 0
      };

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        console.log(`\n🎯 Filling Part ${i + 1}/${segments.length} (${segment.percentage.toFixed(1)}%)`);
        console.log(`   Amount: ${ethers.utils.formatUnits(segment.srcAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
        console.log(`   Secret: ${segment.secret}`);
        console.log(`   Leaf: ${segment.leaf}`);
        console.log(`   Proof length: ${segment.proof.length}`);

        try {
          // Create and execute partial escrows for this segment
          if (isSrcStellar && isDstStellar) {
            await this.createAndExecuteStellarPartialEscrowPair(config, order, segment);
          } else if (isSrcStellar) {
            await this.createAndExecuteStellarToEvmPartialEscrowPair(config, order, segment, dstSigner, buyerSigner.address);
          } else if (isDstStellar) {
            await this.createAndExecuteEvmToStellarPartialEscrowPair(config, order, segment, resolverSigner, dstSigner, buyerSigner.address);
          } else {
            // EVM to EVM (existing logic)
            await this.createAndExecutePartialEscrowPair(config, order, segment, resolverSigner, dstSigner, buyerSigner.address);
          }
          
          // Update tracking
          segment.filled = true;
          totalFilled = totalFilled.add(segment.srcAmount);
          fillStatus.completedParts++;
          fillStatus.remainingParts--;
          fillStatus.totalFilledAmount = totalFilled;
          fillStatus.percentageComplete = (fillStatus.completedParts / fillStatus.totalParts) * 100;

          // Display current status
          this.displayPartialFillStatus(config, order, fillStatus);

          console.log(`✅ Part ${i + 1} completed successfully!`);
          
          // Mark in order tracking
          if (order.filledParts) {
            order.filledParts[i] = true;
          }

        } catch (error) {
          console.error(`❌ Error filling part ${i + 1}:`, error);
          break;
        }

        // Wait between fills (for demo purposes)
        if (i < segments.length - 1) {
          console.log("⏳ Waiting 5 seconds before next fill...");
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      console.log("\n🎉 PARTIAL FILL WORKFLOW COMPLETED!");
      console.log("====================================");
      console.log(`✅ Order filled: ${fillStatus.completedParts}/${fillStatus.totalParts} parts (${fillStatus.percentageComplete.toFixed(1)}%)`);
      console.log(`✅ Total filled: ${ethers.utils.formatUnits(fillStatus.totalFilledAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
      
      return;
    }

    // Original EVM-only logic (unchanged)
    const segments = this.createPartialFillSegments(order, config);
    
    // Create signers
    const srcProvider = new ethers.providers.JsonRpcProvider(this.chains[config.sourceChain].rpcUrl);
    const dstProvider = new ethers.providers.JsonRpcProvider(this.chains[config.destinationChain].rpcUrl);
    const buyerSigner = new ethers.Wallet(this.buyerPrivateKey, srcProvider);
    const resolverSigner = new ethers.Wallet(this.resolverPrivateKey, srcProvider);
    const dstSigner = new ethers.Wallet(this.resolverPrivateKey, dstProvider);

    // Step 1: Buyer preparation (full amount approval)
    console.log("\n📋 STEP 1: Buyer Preparation (Full Amount Approval)");
    console.log("----------------------------------------------------");
    await this.prepareBuyer(config, buyerSigner, order);

    // Step 2: Resolver fills the order in parts
    console.log("\n🔄 STEP 2: Resolver Executes Partial Fills");
    console.log("-------------------------------------------");
    
    let totalFilled = ethers.BigNumber.from(0);
    let fillStatus = {
      totalParts: segments.length,
      completedParts: 0,
      remainingParts: segments.length,
      totalFilledAmount: totalFilled,
      percentageComplete: 0
    };

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`\n🎯 Filling Part ${i + 1}/${segments.length} (${segment.percentage.toFixed(1)}%)`);
      console.log(`   Amount: ${ethers.utils.formatUnits(segment.srcAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
      console.log(`   Secret: ${segment.secret}`);
      console.log(`   Leaf: ${segment.leaf}`);
      console.log(`   Proof length: ${segment.proof.length}`);

      try {
        // Create and execute partial escrows for this segment
        await this.createAndExecutePartialEscrowPair(config, order, segment, resolverSigner, dstSigner, buyerSigner.address);
        
        // Update tracking
        segment.filled = true;
        totalFilled = totalFilled.add(segment.srcAmount);
        fillStatus.completedParts++;
        fillStatus.remainingParts--;
        fillStatus.totalFilledAmount = totalFilled;
        fillStatus.percentageComplete = (fillStatus.completedParts / fillStatus.totalParts) * 100;

        // Display current status
        this.displayPartialFillStatus(config, order, fillStatus);

        console.log(`✅ Part ${i + 1} completed successfully!`);
        
        // Mark in order tracking
        if (order.filledParts) {
          order.filledParts[i] = true;
        }

      } catch (error) {
        console.error(`❌ Error filling part ${i + 1}:`, error);
        break;
      }

      // Wait between fills (for demo purposes)
      if (i < segments.length - 1) {
        console.log("⏳ Waiting 5 seconds before next fill...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log("\n🎉 PARTIAL FILL WORKFLOW COMPLETED!");
    console.log("====================================");
    console.log(`✅ Order filled: ${fillStatus.completedParts}/${fillStatus.totalParts} parts (${fillStatus.percentageComplete.toFixed(1)}%)`);
    console.log(`✅ Total filled: ${ethers.utils.formatUnits(fillStatus.totalFilledAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
  }

  private displayPartialFillStatus(config: SwapConfig, order: Order, fillStatus: any) {
    console.log("\n📊 PARTIAL FILL STATUS");
    console.log("======================");
    console.log(`Progress: ${fillStatus.completedParts}/${fillStatus.totalParts} parts (${fillStatus.percentageComplete.toFixed(1)}%)`);
    console.log(`Completed: ${ethers.utils.formatUnits(fillStatus.totalFilledAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
    console.log(`Remaining: ${ethers.utils.formatUnits(order.srcAmount.sub(fillStatus.totalFilledAmount), this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
    
    // Visual progress bar
    const progressBar = "█".repeat(Math.floor(fillStatus.percentageComplete / 10)) + "░".repeat(10 - Math.floor(fillStatus.percentageComplete / 10));
    console.log(`Progress: [${progressBar}] ${fillStatus.percentageComplete.toFixed(1)}%`);
  }

  private async createAndExecutePartialEscrowPair(
    config: SwapConfig,
    order: Order,
    segment: PartialFillSegment,
    resolverSigner: ethers.Wallet,
    dstSigner: ethers.Wallet,
    buyerAddress: string
  ) {
    const srcFactoryAddress = this.chains[config.sourceChain].factoryAddress;
    const dstFactoryAddress = this.chains[config.destinationChain].factoryAddress;

    // Extract merkle root from hashlock (remove embedded parts count)
    const merkleRoot = ethers.utils.hexlify(
      ethers.BigNumber.from(order.hashedSecret).and(
        ethers.constants.MaxUint256.sub(0xFFFF)
      ).toHexString()
    );

    console.log(`🏗️ Creating escrow pair for part ${segment.index}`);

    // Create source escrow using unified function
    const srcFactoryContract = new ethers.Contract(srcFactoryAddress, factoryABI, resolverSigner);
    const srcLopContract = new ethers.Contract(this.chains[config.sourceChain].lopAddress!, lopABI, resolverSigner);
    
    console.log(`🔍 DEBUG - fillOrder parameters:`);
    console.log(`   orderHash: ${order.orderId}`);
    console.log(`   maker: ${buyerAddress}`);
    console.log(`   recipient: ${resolverSigner.address}`);
    console.log(`   tokenAmount: ${segment.srcAmount.toString()}`);
    console.log(`   hashedSecret: ${order.hashedSecret}`);
    console.log(`   withdrawalStart: ${order.withdrawalStart}`);
    console.log(`   publicWithdrawalStart: ${order.publicWithdrawalStart}`);
    console.log(`   cancellationStart: ${order.cancellationStart}`);
    console.log(`   publicCancellationStart: ${order.publicCancellationStart}`);
    console.log(`   partIndex: ${segment.index}`);
    console.log(`   totalParts: ${order.partialFillManager!.getPartsCount()}`);
    console.log(`   value: ${ethers.utils.parseUnits("0.001", "ether").toString()}`);
    
    // Try using the exact same approach as the working case
    const createSrcTx = await srcLopContract.fillOrder(
      order.orderId,
      buyerAddress, // maker (buyer who has WETH)
      resolverSigner.address, // recipient (resolver gets the WETH)
      segment.srcAmount,
      order.hashedSecret,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      segment.index,          // partIndex
      order.partialFillManager!.getPartsCount(), // totalParts
      { value: ethers.utils.parseEther("0.001") } // deposit amount - same as working case
    );
    
    const srcReceipt = await createSrcTx.wait();
    console.log(`✅ Source escrow created: ${srcReceipt.transactionHash}`);

    // Prepare destination tokens if needed
    await this.prepareDestinationTokens(config, dstSigner, segment.dstAmount);

    // Create destination escrow using unified function  
    const dstFactoryContract = new ethers.Contract(dstFactoryAddress, factoryABI, dstSigner);
    
    const createDstTx = await dstFactoryContract.createDstEscrow(
      order.hashedSecret,  // Use order.hashedSecret for consistency with source escrow
      buyerAddress, // recipient (buyer)
      segment.dstAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      segment.index,          // partIndex
      order.partialFillManager!.getPartsCount(), // totalParts
      { 
        value: ethers.utils.parseEther("0.001"),
        gasLimit: 2000000
      }
    );
    
    const dstReceipt = await createDstTx.wait();
    console.log(`✅ Destination escrow created: ${dstReceipt.transactionHash}`);

    // Extract real escrow addresses from events
    const srcEscrowAddress = this.extractEscrowAddressFromReceipt(srcReceipt);
    const dstEscrowAddress = this.extractEscrowAddressFromReceipt(dstReceipt);

    // Store addresses in segment for tracking
    segment.srcEscrowAddress = srcEscrowAddress;
    segment.dstEscrowAddress = dstEscrowAddress;

    // Wait for withdrawal window
    console.log("⏳ Waiting for withdrawal window...");
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = order.withdrawalStart - currentTime;
    
    if (timeToWait > 0) {
      console.log(`   Need to wait ${timeToWait} seconds...`);
      const { skipWaiting } = await inquirer.prompt([
        {
          type: 'input',
          name: 'skipWaiting',
          message: 'Skip waiting? (y/n): '
        }
      ]);
      
      if (skipWaiting.toLowerCase() === 'y' || skipWaiting.toLowerCase() === 'yes') {
        console.log("🚀 Skipping withdrawal timelock for demo purposes");
      } else {
        console.log(`   Waiting ${timeToWait} seconds...`);
        await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
      }
    }

    // Execute real withdrawals with merkle proofs
    console.log(`🔓 Executing withdrawals with merkle proof...`);
    await this.executePartialWithdrawals(segment, resolverSigner, dstSigner);
  }

  private extractEscrowAddressFromReceipt(receipt: any): string {
    // Extract escrow address from SrcEscrowCreated or DstEscrowCreated event
    const escrowCreatedTopic = ethers.utils.id("SrcEscrowCreated(address,address,address,bytes32,uint256,uint256,uint256,uint256,uint256)");
    const dstEscrowCreatedTopic = ethers.utils.id("DstEscrowCreated(address,address,address,bytes32,uint256,uint256,uint256,uint256)");
    
    const escrowEvent = receipt.logs.find((log: any) => 
      log.topics && (log.topics[0] === escrowCreatedTopic || log.topics[0] === dstEscrowCreatedTopic)
    );
    
    if (escrowEvent) {
      return ethers.utils.getAddress("0x" + escrowEvent.data.slice(26, 66));
    }
    
    throw new Error("Could not extract escrow address from receipt");
  }

  private async prepareDestinationTokens(config: SwapConfig, dstSigner: ethers.Wallet, amount: ethers.BigNumber) {
    const dstTokenConfig = this.chains[config.destinationChain].tokens[config.destinationToken];
    const dstFactoryAddress = this.chains[config.destinationChain].factoryAddress;

    if (dstTokenConfig.isNative) {
      // For native tokens, wrap them
      const wrappedTokenSymbol = config.destinationChain.includes('sepolia') ? 'WETH' : 'WBNB';
      const wrappedTokenAddress = this.chains[config.destinationChain].tokens[wrappedTokenSymbol].address;
      
      const wrapperABI = [
        "function deposit() payable",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)"
      ];
      
      const wrapperContract = new ethers.Contract(wrappedTokenAddress, wrapperABI, dstSigner);
      
      // Check balance and wrap if needed
      const balance = await wrapperContract.balanceOf(dstSigner.address);
      if (balance.lt(amount)) {
        const amountToWrap = amount.sub(balance).add(ethers.utils.parseEther("0.001"));
        console.log(`   Wrapping ${ethers.utils.formatEther(amountToWrap)} ${config.destinationToken}...`);
        
        const wrapTx = await wrapperContract.deposit({ value: amountToWrap });
        await wrapTx.wait();
        console.log("   ✅ Token wrapped successfully");
      }
      
      // Approve factory
      const approveTx = await wrapperContract.approve(dstFactoryAddress, amount);
      await approveTx.wait();
      console.log("   ✅ Factory approved to spend wrapped tokens");
    } else {
      // For ERC20 tokens, just approve
      const tokenABI = [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)"
      ];
      
      const tokenContract = new ethers.Contract(dstTokenConfig.address, tokenABI, dstSigner);
      
      const approveTx = await tokenContract.approve(dstFactoryAddress, amount);
      await approveTx.wait();
      console.log("   ✅ Factory approved to spend tokens");
    }
  }

  private async executePartialWithdrawals(
    segment: PartialFillSegment,
    resolverSigner: ethers.Wallet,
    dstSigner: ethers.Wallet
  ) {
    console.log(`🔐 Withdrawing with secret ${segment.index} and merkle proof`);
    console.log(`   Secret: ${segment.secret.slice(0, 10)}...`);
    console.log(`   Proof elements: ${segment.proof.length}`);
    console.log(`   Source escrow: ${segment.srcEscrowAddress}`);
    console.log(`   Destination escrow: ${segment.dstEscrowAddress}`);

    // Real withdrawal from source escrow (resolver gets tokens)
    const srcEscrowContract = new ethers.Contract(segment.srcEscrowAddress!, enhancedEscrowABI, resolverSigner);
    
    console.log("   📤 Withdrawing from source escrow (resolver receives tokens)...");
    const srcWithdrawTx = await srcEscrowContract.withdrawWithProof(segment.secret, segment.proof, {
      gasLimit: 500000,
      maxFeePerGas: ethers.utils.parseUnits("15", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
    });
    await srcWithdrawTx.wait();
    console.log(`   ✅ Source withdrawal completed: ${srcWithdrawTx.hash}`);

    // Real withdrawal from destination escrow (buyer gets tokens)
    const dstEscrowContract = new ethers.Contract(segment.dstEscrowAddress!, enhancedEscrowABI, dstSigner);
    
    console.log("   📤 Withdrawing from destination escrow (buyer receives tokens)...");
    const dstWithdrawTx = await dstEscrowContract.withdrawWithProof(segment.secret, segment.proof, {
      gasLimit: 500000,
      gasPrice: ethers.utils.parseUnits("2", "gwei")
    });
    await dstWithdrawTx.wait();
    console.log(`   ✅ Destination withdrawal completed: ${dstWithdrawTx.hash}`);
  }

  private async prepareBuyer(config: SwapConfig, buyerSigner: ethers.Wallet, order: Order) {
    const srcTokenConfig = this.chains[config.sourceChain].tokens[config.sourceToken];
    const factoryAddress = this.chains[config.sourceChain].factoryAddress;

    if (srcTokenConfig.isNative) {
      // For native tokens, we need to wrap them first
      const wrappedTokenSymbol = config.sourceChain.includes('sepolia') ? 'WETH' : 'WBNB';
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

  private async prepareStellarBuyer(config: SwapConfig, order: Order) {
    console.log(`\n🌟 Preparing Stellar Buyer...`);
    
    const stellarAddresses = this.getStellarAddresses();
    const factoryAddress = this.chains[config.sourceChain].factoryAddress;
    const tokenAddress = this.chains[config.sourceChain].tokens[config.sourceToken].address;
    const amountInStroops = Math.floor(config.sourceAmount * 10000000);
    
    console.log(`  Buyer: ${stellarAddresses.buyer}`);
    console.log(`  Amount: ${config.sourceAmount} ${config.sourceToken} (${amountInStroops} stroops)`);
    console.log(`  Factory: ${factoryAddress}`);
    console.log(`  Token Contract: ${tokenAddress}`);
    
    try {
      const { execSync } = require('child_process');
      
      // Step 1: Buyer approves the factory contract (internal allowance)
      console.log(`\n📝 Step 1: Buyer approves factory contract...`);
      const factoryApproveCmd = `soroban contract invoke --id ${factoryAddress} --source stellar-buyer --network testnet -- approve --caller ${stellarAddresses.buyer} --amount ${amountInStroops * 2}`;
      
      console.log(`Command: ${factoryApproveCmd}`);
      const factoryResult = execSync(factoryApproveCmd, { encoding: 'utf8' });
      console.log("✅ Factory contract approved");
      
      // Step 2: Buyer approves the token contract (for actual token transfer)
      console.log(`\n📝 Step 2: Buyer approves token contract...`);
      const tokenApproveCmd = `soroban contract invoke --id ${tokenAddress} --source stellar-buyer --network testnet -- approve --from ${stellarAddresses.buyer} --spender ${factoryAddress} --amount ${amountInStroops * 2} --expiration_ledger 1000000`;
      
      console.log(`Command: ${tokenApproveCmd}`);
      const tokenResult = execSync(tokenApproveCmd, { encoding: 'utf8' });
      console.log("✅ Token contract approved");
      
      console.log(`\n✅ Stellar buyer preparation completed!`);
      console.log(`   Factory allowance: ${amountInStroops * 2} stroops`);
      console.log(`   Token allowance: ${amountInStroops * 2} stroops`);
      
    } catch (error) {
      console.error(`❌ Error preparing Stellar buyer:`, error);
      throw error;
    }
  }

  private async prepareStellarResolver(config: SwapConfig, order: Order) {
    console.log(`\n🌟 Preparing Stellar Resolver...`);
    
    const stellarAddresses = this.getStellarAddresses();
    const factoryAddress = this.chains[config.destinationChain].factoryAddress;
    const tokenAddress = this.chains[config.destinationChain].tokens[config.destinationToken].address;
    const amountInStroops = Math.floor(config.destinationAmount * 10000000);
    
    console.log(`  Resolver: ${stellarAddresses.resolver}`);
    console.log(`  Amount: ${config.destinationAmount} ${config.destinationToken} (${amountInStroops} stroops)`);
    console.log(`  Factory: ${factoryAddress}`);
    console.log(`  Token Contract: ${tokenAddress}`);
    
    console.log(`\n📝 Note: Resolver will transfer tokens directly (no approval needed)`);
    console.log(`   Resolver has XLM balance and will authorize their own transfers`);
    
    console.log(`\n✅ Stellar resolver preparation completed!`);
  }

  private async executeSourceEscrowOnly(config: SwapConfig, order: Order, resolverSigner: ethers.Wallet) {
    const srcFactoryAddress = this.chains[config.sourceChain].factoryAddress;
    const srcFactoryContract = new ethers.Contract(srcFactoryAddress, factoryABI, resolverSigner);
    const srcLopContract = new ethers.Contract(this.chains[config.sourceChain].lopAddress!, lopABI, resolverSigner);

    console.log("Creating source escrow...");
    const createSrcEscrowTx = await srcLopContract.fillOrder(
      order.orderId,
      order.buyerAddress, // maker (buyer who has WETH)
      resolverSigner.address, // recipient (resolver gets the WETH)
      order.srcAmount,
      order.hashedSecret,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      0,  // partIndex = 0 for complete fill
      1,  // totalParts = 1 for complete fill
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
    const srcLopContract = new ethers.Contract(this.chains[config.sourceChain].lopAddress!, lopABI, resolverSigner);
    
    const createSrcEscrowTx = await srcLopContract.fillOrder(
      order.orderId,
      order.buyerAddress, // maker (buyer who has WETH)
      resolverSigner.address, // recipient (resolver gets the WETH)
      order.srcAmount,
      order.hashedSecret,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      0,  // partIndex = 0 for complete fill
      1,  // totalParts = 1 for complete fill
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
      const wrappedTokenSymbol = config.destinationChain.includes('sepolia') ? 'WETH' : 'WBNB';
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
      0,  // partIndex = 0 for complete fill
      1,  // totalParts = 1 for complete fill
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

  private async createAndExecuteStellarPartialEscrowPair(
    config: SwapConfig,
    order: Order,
    segment: PartialFillSegment
  ) {
    console.log(`🏗️ Creating Stellar escrow pair for part ${segment.index}`);
    
    const stellarAddresses = this.getStellarAddresses();
    const srcAmount = parseFloat(ethers.utils.formatUnits(segment.srcAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals));
    const dstAmount = parseFloat(ethers.utils.formatUnits(segment.dstAmount, this.chains[config.destinationChain].tokens[config.destinationToken].decimals));
    const srcAmountInStroops = Math.floor(srcAmount * 10000000);
    const dstAmountInStroops = Math.floor(dstAmount * 10000000);
    
    console.log(`   Source amount: ${srcAmount} ${config.sourceToken} (${srcAmountInStroops} stroops)`);
    console.log(`   Destination amount: ${dstAmount} ${config.destinationToken} (${dstAmountInStroops} stroops)`);
    console.log(`   Secret: ${segment.secret}`);
    console.log(`   Proof elements: ${segment.proof.length}`);

    // Create source escrow on Stellar
    console.log(`\n📝 Creating Stellar source escrow for part ${segment.index}`);
    const stellarSrcResult = await this.createStellarSourceEscrow(
      stellarAddresses.resolver, // creator (resolver)
      stellarAddresses.resolver, // recipient (resolver)
      order.hashedSecret,
      srcAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      segment.index, // part index
      order.partialFillManager!.getPartsCount() // total parts
    );
    
    if (!stellarSrcResult.success) {
      throw new Error(`Stellar source escrow creation failed: ${stellarSrcResult.error}`);
    }
    
    // Create destination escrow on Stellar
    console.log(`\n📝 Creating Stellar destination escrow for part ${segment.index}`);
    const stellarDstResult = await this.createStellarDestinationEscrow(
      stellarAddresses.resolver, // creator (resolver)
      stellarAddresses.buyer, // recipient (buyer)
      order.hashedSecret,
      dstAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      segment.index, // part index
      order.partialFillManager!.getPartsCount() // total parts
    );
    
    if (!stellarDstResult.success) {
      throw new Error(`Stellar destination escrow creation failed: ${stellarDstResult.error}`);
    }

    // Store addresses in segment for tracking
    segment.srcEscrowAddress = stellarSrcResult.escrowAddress;
    segment.dstEscrowAddress = stellarDstResult.escrowAddress;

    // Wait for withdrawal window
    console.log("⏳ Waiting for withdrawal window...");
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = order.withdrawalStart - currentTime;
    
    if (timeToWait > 0) {
      console.log(`   Need to wait ${timeToWait} seconds...`);
      const { skipWaiting } = await inquirer.prompt([
        {
          type: 'input',
          name: 'skipWaiting',
          message: 'Skip waiting? (y/n): '
        }
      ]);
      
      if (skipWaiting.toLowerCase() === 'y' || skipWaiting.toLowerCase() === 'yes') {
        console.log("🚀 Skipping withdrawal timelock for demo purposes");
      } else {
        console.log(`   Waiting ${timeToWait} seconds...`);
        await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
      }
    }

    // Execute withdrawals with merkle proofs
    console.log(`🔓 Executing Stellar withdrawals with merkle proof for part ${segment.index}...`);
    await this.executeStellarPartialWithdrawals(segment);
  }

  private async createAndExecuteStellarToEvmPartialEscrowPair(
    config: SwapConfig,
    order: Order,
    segment: PartialFillSegment,
    dstSigner: ethers.Wallet,
    buyerAddress: string
  ) {
    console.log(`🏗️ Creating Stellar→EVM escrow pair for part ${segment.index}`);
    
    const stellarAddresses = this.getStellarAddresses();
    const srcAmount = parseFloat(ethers.utils.formatUnits(segment.srcAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals));
    const srcAmountInStroops = Math.floor(srcAmount * 10000000);
    
    console.log(`   Source amount: ${srcAmount} ${config.sourceToken} (${srcAmountInStroops} stroops)`);
    console.log(`   Destination amount: ${ethers.utils.formatUnits(segment.dstAmount, this.chains[config.destinationChain].tokens[config.destinationToken].decimals)} ${config.destinationToken}`);
    console.log(`   Secret: ${segment.secret}`);
    console.log(`   Proof elements: ${segment.proof.length}`);

    // Create source escrow on Stellar
    console.log(`\n📝 Creating Stellar source escrow for part ${segment.index}`);
    const stellarSrcResult = await this.createStellarSourceEscrow(
      stellarAddresses.resolver, // creator (resolver)
      stellarAddresses.resolver, // recipient (resolver)
      order.hashedSecret,
      srcAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      segment.index, // part index
      order.partialFillManager!.getPartsCount() // total parts
    );
    
    if (!stellarSrcResult.success) {
      throw new Error(`Stellar source escrow creation failed: ${stellarSrcResult.error}`);
    }

    // Prepare destination tokens if needed
    await this.prepareDestinationTokens(config, dstSigner, segment.dstAmount);

    // Create destination escrow on EVM
    console.log(`\n📝 Creating EVM destination escrow for part ${segment.index}`);
    const dstFactoryAddress = this.chains[config.destinationChain].factoryAddress;
    const dstFactoryContract = new ethers.Contract(dstFactoryAddress, factoryABI, dstSigner);
    
    const createDstTx = await dstFactoryContract.createDstEscrow(
      order.hashedSecret,
      buyerAddress, // recipient (buyer)
      segment.dstAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      segment.index, // partIndex
      order.partialFillManager!.getPartsCount(), // totalParts
      { value: ethers.utils.parseEther("0.001") }
    );
    
    const dstReceipt = await createDstTx.wait();
    console.log(`✅ EVM destination escrow created: ${dstReceipt.transactionHash}`);

    // Extract destination escrow address
    const dstEscrowAddress = this.extractEscrowAddressFromReceipt(dstReceipt);

    // Store addresses in segment for tracking
    segment.srcEscrowAddress = stellarSrcResult.escrowAddress;
    segment.dstEscrowAddress = dstEscrowAddress;

    // Wait for withdrawal window
    console.log("⏳ Waiting for withdrawal window...");
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = order.withdrawalStart - currentTime;
    
    if (timeToWait > 0) {
      console.log(`   Need to wait ${timeToWait} seconds...`);
      const { skipWaiting } = await inquirer.prompt([
        {
          type: 'input',
          name: 'skipWaiting',
          message: 'Skip waiting? (y/n): '
        }
      ]);
      
      if (skipWaiting.toLowerCase() === 'y' || skipWaiting.toLowerCase() === 'yes') {
        console.log("🚀 Skipping withdrawal timelock for demo purposes");
      } else {
        console.log(`   Waiting ${timeToWait} seconds...`);
        await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
      }
    }

    // Execute withdrawals with merkle proofs
    console.log(`🔓 Executing Stellar→EVM withdrawals with merkle proof for part ${segment.index}...`);
    await this.executeStellarToEvmPartialWithdrawals(segment, dstSigner);
  }

  private async createAndExecuteEvmToStellarPartialEscrowPair(
    config: SwapConfig,
    order: Order,
    segment: PartialFillSegment,
    resolverSigner: ethers.Wallet,
    dstSigner: ethers.Wallet,
    buyerAddress: string
  ) {
    console.log(`🏗️ Creating EVM→Stellar escrow pair for part ${segment.index}`);
    
    const stellarAddresses = this.getStellarAddresses();
    const dstAmount = parseFloat(ethers.utils.formatUnits(segment.dstAmount, this.chains[config.destinationChain].tokens[config.destinationToken].decimals));
    const dstAmountInStroops = Math.floor(dstAmount * 10000000);
    
    console.log(`   Source amount: ${ethers.utils.formatUnits(segment.srcAmount, this.chains[config.sourceChain].tokens[config.sourceToken].decimals)} ${config.sourceToken}`);
    console.log(`   Destination amount: ${dstAmount} ${config.destinationToken} (${dstAmountInStroops} stroops)`);
    console.log(`   Secret: ${segment.secret}`);
    console.log(`   Proof elements: ${segment.proof.length}`);

    // Create source escrow on EVM
    console.log(`\n📝 Creating EVM source escrow for part ${segment.index}`);
    const srcFactoryAddress = this.chains[config.sourceChain].factoryAddress;
    const srcFactoryContract = new ethers.Contract(srcFactoryAddress, factoryABI, resolverSigner);
    const srcLopContract = new ethers.Contract(this.chains[config.sourceChain].lopAddress!, lopABI, resolverSigner);
    
    const createSrcTx = await srcLopContract.fillOrder(
      order.orderId,
      buyerAddress, // maker (buyer who has WETH)
      resolverSigner.address, // recipient (resolver gets the WETH)
      segment.srcAmount,
      order.hashedSecret,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      order.publicCancellationStart,
      segment.index, // partIndex
      order.partialFillManager!.getPartsCount(), // totalParts
      { value: ethers.utils.parseEther("0.001") }
    );
    
    const srcReceipt = await createSrcTx.wait();
    console.log(`✅ EVM source escrow created: ${srcReceipt.transactionHash}`);

    // Extract source escrow address
    const srcEscrowAddress = this.extractEscrowAddressFromReceipt(srcReceipt);

    // Create destination escrow on Stellar
    console.log(`\n📝 Creating Stellar destination escrow for part ${segment.index}`);
    const stellarDstResult = await this.createStellarDestinationEscrow(
      stellarAddresses.resolver, // creator (resolver)
      stellarAddresses.buyer, // recipient (buyer)
      order.hashedSecret,
      dstAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      segment.index, // part index
      order.partialFillManager!.getPartsCount() // total parts
    );
    
    if (!stellarDstResult.success) {
      throw new Error(`Stellar destination escrow creation failed: ${stellarDstResult.error}`);
    }

    // Store addresses in segment for tracking
    segment.srcEscrowAddress = srcEscrowAddress;
    segment.dstEscrowAddress = stellarDstResult.escrowAddress;

    // Wait for withdrawal window
    console.log("⏳ Waiting for withdrawal window...");
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = order.withdrawalStart - currentTime;
    
    if (timeToWait > 0) {
      console.log(`   Need to wait ${timeToWait} seconds...`);
      const { skipWaiting } = await inquirer.prompt([
        {
          type: 'input',
          name: 'skipWaiting',
          message: 'Skip waiting? (y/n): '
        }
      ]);
      
      if (skipWaiting.toLowerCase() === 'y' || skipWaiting.toLowerCase() === 'yes') {
        console.log("🚀 Skipping withdrawal timelock for demo purposes");
      } else {
        console.log(`   Waiting ${timeToWait} seconds...`);
        await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
      }
    }

    // Execute withdrawals with merkle proofs
    console.log(`🔓 Executing EVM→Stellar withdrawals with merkle proof for part ${segment.index}...`);
    await this.executeEvmToStellarPartialWithdrawals(segment, resolverSigner);
  }

  private async executeStellarPartialWithdrawals(segment: PartialFillSegment) {
    console.log(`🔐 Withdrawing from Stellar escrows with secret ${segment.index} and merkle proof`);
    console.log(`   Secret: ${segment.secret.slice(0, 10)}...`);
    console.log(`   Proof elements: ${segment.proof.length}`);
    console.log(`   Source escrow: ${segment.srcEscrowAddress}`);
    console.log(`   Destination escrow: ${segment.dstEscrowAddress}`);

    const stellarAddresses = this.getStellarAddresses();

    // Withdraw from source escrow (resolver gets tokens)
    console.log("   📤 Withdrawing from Stellar source escrow (resolver receives tokens)...");
    const srcWithdrawal = await this.withdrawFromStellarEscrow(
      segment.srcEscrowAddress!,
      segment.secret,
      stellarAddresses.resolver,
      segment.proof,
      true, // is partial fill
      true // is source escrow
    );

    if (!srcWithdrawal.success) {
      throw new Error(`Stellar source withdrawal failed: ${srcWithdrawal.error}`);
    }

    // Withdraw from destination escrow (buyer gets tokens)
    console.log("   📤 Withdrawing from Stellar destination escrow (buyer receives tokens)...");
    const dstWithdrawal = await this.withdrawFromStellarEscrow(
      segment.dstEscrowAddress!,
      segment.secret,
      stellarAddresses.resolver, // resolver calls withdrawal for buyer
      segment.proof,
      true, // is partial fill
      false // is destination escrow
    );

    if (!dstWithdrawal.success) {
      throw new Error(`Stellar destination withdrawal failed: ${dstWithdrawal.error}`);
    }

    console.log(`   ✅ Stellar partial withdrawals completed for part ${segment.index}`);
  }

  private async executeStellarToEvmPartialWithdrawals(segment: PartialFillSegment, dstSigner: ethers.Wallet) {
    console.log(`🔐 Withdrawing from Stellar→EVM escrows with secret ${segment.index} and merkle proof`);
    console.log(`   Secret: ${segment.secret.slice(0, 10)}...`);
    console.log(`   Proof elements: ${segment.proof.length}`);
    console.log(`   Source escrow: ${segment.srcEscrowAddress}`);
    console.log(`   Destination escrow: ${segment.dstEscrowAddress}`);

    const stellarAddresses = this.getStellarAddresses();

    // Withdraw from Stellar source escrow (resolver gets tokens)
    console.log("   📤 Withdrawing from Stellar source escrow (resolver receives tokens)...");
    const srcWithdrawal = await this.withdrawFromStellarEscrow(
      segment.srcEscrowAddress!,
      segment.secret,
      stellarAddresses.resolver,
      segment.proof,
      true, // is partial fill
      true // is source escrow
    );

    if (!srcWithdrawal.success) {
      throw new Error(`Stellar source withdrawal failed: ${srcWithdrawal.error}`);
    }

    // Withdraw from EVM destination escrow (buyer gets tokens)
    console.log("   📤 Withdrawing from EVM destination escrow (buyer receives tokens)...");
    const dstEscrowContract = new ethers.Contract(segment.dstEscrowAddress!, enhancedEscrowABI, dstSigner);
    
    const dstWithdrawTx = await dstEscrowContract.withdrawWithProof(segment.secret, segment.proof, {
      gasLimit: 500000,
      gasPrice: ethers.utils.parseUnits("2", "gwei")
    });
    await dstWithdrawTx.wait();
    console.log(`   ✅ EVM destination withdrawal completed: ${dstWithdrawTx.hash}`);

    console.log(`   ✅ Stellar→EVM partial withdrawals completed for part ${segment.index}`);
  }

  private async executeEvmToStellarPartialWithdrawals(segment: PartialFillSegment, resolverSigner: ethers.Wallet) {
    console.log(`🔐 Withdrawing from EVM→Stellar escrows with secret ${segment.index} and merkle proof`);
    console.log(`   Secret: ${segment.secret.slice(0, 10)}...`);
    console.log(`   Proof elements: ${segment.proof.length}`);
    console.log(`   Source escrow: ${segment.srcEscrowAddress}`);
    console.log(`   Destination escrow: ${segment.dstEscrowAddress}`);

    const stellarAddresses = this.getStellarAddresses();

    // Withdraw from EVM source escrow (resolver gets tokens)
    console.log("   📤 Withdrawing from EVM source escrow (resolver receives tokens)...");
    const srcEscrowContract = new ethers.Contract(segment.srcEscrowAddress!, enhancedEscrowABI, resolverSigner);
    
    const srcWithdrawTx = await srcEscrowContract.withdrawWithProof(segment.secret, segment.proof, {
      gasLimit: 500000,
      maxFeePerGas: ethers.utils.parseUnits("15", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
    });
    await srcWithdrawTx.wait();
    console.log(`   ✅ EVM source withdrawal completed: ${srcWithdrawTx.hash}`);

    // Withdraw from Stellar destination escrow (buyer gets tokens)
    console.log("   📤 Withdrawing from Stellar destination escrow (buyer receives tokens)...");
    const dstWithdrawal = await this.withdrawFromStellarEscrow(
      segment.dstEscrowAddress!,
      segment.secret,
      stellarAddresses.resolver, // resolver calls withdrawal for buyer
      segment.proof,
      true, // is partial fill
      false // is destination escrow
    );

    if (!dstWithdrawal.success) {
      throw new Error(`Stellar destination withdrawal failed: ${dstWithdrawal.error}`);
    }

    console.log(`   ✅ EVM→Stellar partial withdrawals completed for part ${segment.index}`);
  }
}

// ABI definitions - Updated to support both complete and partial fills
const factoryABI = [
  "function createSrcEscrow(bytes32 hashedSecret, address recipient, address buyer, uint256 tokenAmount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 publicCancellationStart, uint256 partIndex, uint16 totalParts) external payable",
  "function createDstEscrow(bytes32 hashedSecret, address recipient, uint256 tokenAmount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 partIndex, uint16 totalParts) external payable"
];

const lopABI = [
  "function fillOrder(bytes32 orderHash, address maker, address recipient, uint256 tokenAmount, bytes32 hashedSecret, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 publicCancellationStart, uint256 partIndex, uint16 totalParts) external payable"
];

const escrowABI = [
  "function withdraw(bytes calldata secret) external",
  "function recipient() view returns (address)",
  "function creator() view returns (address)",
  "function amount() view returns (uint256)",
  "function token() view returns (address)"
];

// Enhanced escrow ABI to support both complete and partial fills
const enhancedEscrowABI = [
  "function withdraw(bytes calldata secret) external",                     // For complete fills
  "function withdrawWithProof(bytes calldata secret, bytes32[] calldata merkleProof) external", // For partial fills
  "function cancel() external",
  "function recipient() view returns (address)",
  "function creator() view returns (address)",
  "function amount() view returns (uint256)",
  "function token() view returns (address)",
  "function partIndex() view returns (uint256)",    // Only available in partial fill escrows
  "function totalParts() view returns (uint16)"     // Only available in partial fill escrows
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