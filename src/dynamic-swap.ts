import { ethers } from "ethers";
import * as dotenv from "dotenv";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import { PriceService } from "./price-service";
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
      order.publicCancellationStart
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
      order.cancellationStart
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
    const srcWithdrawal = await this.withdrawFromStellarEscrow(
      stellarSrcResult.escrowAddress || "",
      order.secret,
      stellarAddresses.resolver
    );
    
    if (srcWithdrawal.success) {
      console.log(`\n📝 Step 7: Execute Stellar destination escrow withdrawal (buyer gets destination tokens)`);
      const dstWithdrawal = await this.withdrawFromStellarEscrow(
        stellarDstResult.escrowAddress || "",
        order.secret,
        stellarAddresses.resolver // Resolver calls withdrawal for buyer
      );
      
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
      order.publicCancellationStart
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
    
    await this.createEvmDestinationEscrow(config, order, dstSigner, buyerAddress);
    
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
    const stellarWithdrawal = await this.withdrawFromStellarEscrow(
      stellarSrcResult.escrowAddress || "",
      order.secret,
      stellarAddresses.resolver
    );
    
    if (stellarWithdrawal.success) {
      // Step 6: Execute EVM withdrawal (buyer gets destination tokens)
      console.log(`\n📝 Step 6: Execute EVM destination escrow withdrawal`);
      await this.withdrawFromEvmEscrow("evm_dst_escrow_placeholder", order.secret, dstSigner);
      
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
      order.cancellationStart
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
      const withdrawalResult = await this.withdrawFromStellarEscrow(
        stellarResult.escrowAddress || "",
        order.secret,
        this.getStellarAddresses().resolver // RESOLVER calls the withdrawal, not buyer
      );
      
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
    cancellationStart: number
  ) {
    console.log(`\n🌟 Creating Stellar Destination Escrow...`);
    
    try {
      if (!this.stellarResolverKeypair) {
        throw new Error("Stellar resolver keypair not configured");
      }

      const contractAddress = this.chains['stellar-testnet']?.factoryAddress;
      if (!contractAddress) {
        throw new Error("Stellar factory address not configured");
      }

      // Convert amount to stroops (XLM has 7 decimals)
      const amountInStroops = Math.floor(amount * 10000000);
      
      console.log("🔍 Debug - Parameters being passed:");
      console.log(`  creator: ${creator}`);
      console.log(`  hashed_secret: ${hashedSecret}`);
      console.log(`  recipient: ${recipient}`);
      console.log(`  token_amount: ${amountInStroops} (${amount} XLM)`);
      console.log(`  withdrawal_start: ${withdrawalStart}`);
      console.log(`  public_withdrawal_start: ${publicWithdrawalStart}`);
      console.log(`  cancellation_start: ${cancellationStart}`);
      
      // Use CLI approach instead of SDK for better compatibility
      const { execSync } = require('child_process');
      
      const command = `soroban contract invoke --id ${contractAddress} --source stellar-resolver --network testnet -- create_dst_escrow --creator ${creator} --hashed_secret ${hashedSecret.slice(2)} --recipient ${recipient} --token_amount ${amountInStroops} --withdrawal_start ${withdrawalStart} --public_withdrawal_start ${publicWithdrawalStart} --cancellation_start ${cancellationStart}`;
      
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
    publicCancellationStart: number
  ) {
    console.log(`\n🌟 Creating Stellar Source Escrow...`);
    
    try {
      const contractAddress = this.chains['stellar-testnet']?.factoryAddress;
      if (!contractAddress) {
        throw new Error("Stellar factory address not configured");
      }

      const stellarAddresses = this.getStellarAddresses();
      const amountInStroops = Math.floor(amount * 10000000);
      
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
      
      // Use CLI approach for better compatibility
      const { execSync } = require('child_process');
      
      const command = `soroban contract invoke --id ${contractAddress} --source stellar-resolver --network testnet -- create_src_escrow --creator ${creator} --hashed_secret ${hashedSecret.slice(2)} --recipient ${recipient} --buyer ${stellarAddresses.buyer} --token_amount ${amountInStroops} --withdrawal_start ${withdrawalStart} --public_withdrawal_start ${publicWithdrawalStart} --cancellation_start ${cancellationStart} --public_cancellation_start ${publicCancellationStart}`;
      
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
    caller: string
  ) {
    console.log(`\n🌟 Withdrawing from Stellar Escrow...`);
    
    try {
      const stellarAddresses = this.getStellarAddresses();
      const isResolver = caller === stellarAddresses.resolver;
      const sourceKey = isResolver ? 'stellar-resolver' : 'stellar-buyer';
      
      if (!this.stellarResolverKeypair && isResolver) {
        throw new Error(`Stellar resolver keypair not configured for caller: ${caller}`);
      }
      if (!this.stellarBuyerKeypair && !isResolver) {
        throw new Error(`Stellar buyer keypair not configured for caller: ${caller}`);
      }

      const contractAddress = this.chains['stellar-testnet']?.factoryAddress;
      if (!contractAddress) {
        throw new Error("Stellar factory address not configured");
      }

      // Determine if this is source or destination escrow withdrawal
      const methodName = escrowAddress.includes('src') ? 'withdraw_src_escrow' : 'withdraw_dst_escrow';
      
      // Use CLI approach for better compatibility
      const { execSync } = require('child_process');
      
      const command = `soroban contract invoke --id ${contractAddress} --source ${sourceKey} --network testnet -- ${methodName} --caller ${caller} --escrow_address ${contractAddress} --secret ${secret.slice(2)}`;
      
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

  private async createEvmDestinationEscrow(config: SwapConfig, order: Order, dstSigner: ethers.Wallet, buyerAddress: string) {
    // Handle destination token preparation
    const dstTokenConfig = this.chains[config.destinationChain].tokens[config.destinationToken];
    let dstTokenAddress = order.dstToken;
    const dstFactoryAddress = this.chains[config.destinationChain].factoryAddress;

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
      buyerAddress, // recipient is buyer
      order.dstAmount,
      order.withdrawalStart,
      order.publicWithdrawalStart,
      order.cancellationStart,
      { value: ethers.utils.parseEther("0.001") } // deposit amount
    );
    
    const dstReceipt = await createDstEscrowTx.wait();
    console.log("✅ EVM destination escrow created:", dstReceipt.transactionHash);
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
    // Check if either chain is Stellar
    const isSrcStellar = this.isStellarChain(config.sourceChain);
    const isDstStellar = this.isStellarChain(config.destinationChain);
    
    if (isSrcStellar || isDstStellar) {
      console.log("🌟 Stellar chain detected - using Stellar integration");
      await this.executeStellarSwap(config, isSrcStellar, isDstStellar);
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
    const hashedSecret = ethers.utils.sha256(secret); // Changed from keccak256 to sha256
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

    console.log("Creating source escrow...");
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