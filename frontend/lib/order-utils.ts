import { ethers } from 'ethers';

// Merkle Tree implementation for partial fills
export class PartialFillOrderManager {
  private secrets: string[];
  private secretHashes: string[];
  private leaves: string[];
  private merkleTree: string[][];
  private root: string = '';

  constructor(partsCount: number) {
    this.secrets = [];
    this.secretHashes = [];
    this.leaves = [];
    this.merkleTree = [];
    
    // Generate secrets for each part
    for (let i = 0; i < partsCount; i++) {
      const secretBytes = ethers.utils.randomBytes(32);
      const secret = ethers.utils.hexlify(secretBytes);
      const secretHash = ethers.utils.sha256(secretBytes);
      
      this.secrets.push(secret);
      this.secretHashes.push(secretHash);
      this.leaves.push(secretHash);
    }
    
    // Build Merkle tree
    this.buildMerkleTree();
  }

  private buildMerkleTree() {
    // Start with leaves
    this.merkleTree = [this.leaves];
    
    // Build tree levels
    let currentLevel = this.leaves;
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        
        const combined = ethers.utils.solidityPack(['bytes32', 'bytes32'], [left, right]);
        const hash = ethers.utils.keccak256(combined);
        nextLevel.push(hash);
      }
      
      this.merkleTree.push(nextLevel);
      currentLevel = nextLevel;
    }
    
    // Root is the last element of the last level
    this.root = currentLevel[0];
  }

  getSecret(index: number): string {
    return this.secrets[index];
  }

  getSecretHash(index: number): string {
    return this.secretHashes[index];
  }

  getLeaf(index: number): string {
    return this.leaves[index];
  }

  getProof(index: number): string[] {
    const proof: string[] = [];
    let currentIndex = index;
    
    for (let level = 0; level < this.merkleTree.length - 1; level++) {
      const currentLevel = this.merkleTree[level];
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;
      
      if (siblingIndex < currentLevel.length) {
        proof.push(currentLevel[siblingIndex]);
      }
      
      currentIndex = Math.floor(currentIndex / 2);
    }
    
    return proof;
  }

  getHashLock(): string {
    return this.root;
  }

  getPartsCount(): number {
    return this.secrets.length;
  }

  getAllSecrets(): string[] {
    return [...this.secrets];
  }

  getAllSecretHashes(): string[] {
    return [...this.secretHashes];
  }
}

// Order creation interface
export interface OrderCreationParams {
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  sourceAmount: string;
  destinationAmount: string;
  buyerAddress: string;
  enablePartialFills?: boolean;
  partsCount?: number;
}

export interface OrderData {
  orderId: string;
  buyerAddress: string;
  srcChainId: number | string;
  dstChainId: number | string;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  market_price: string;
  slippage: string;
  // Internal data (not sent to relayer)
  hashedSecret: string;
  secret: string;
  orderCreationTime: number;
  withdrawalStart: number;
  publicWithdrawalStart: number;
  cancellationStart: number;
  publicCancellationStart: number;
  isPartialFillEnabled?: boolean;
  partialFillManager?: PartialFillOrderManager;
  partialFillSecrets?: string[];
  partialFillSecretHashes?: string[];
}

// Add chain configuration for frontend
const CHAIN_CONFIGS = {
  'ethereum': {
    name: 'Sepolia Testnet',
    chainId: 11155111,
    factoryAddress: '0x4F25B17649F0A056138E251487c27A22D793DBA7',
    lopAddress: '0x13F4118A0C9AA013eeB078f03318aeea84469cDD',
    tokens: {
      'sepolia-eth': {
        name: 'Ethereum',
        symbol: 'ETH',
        address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        isNative: true
      },
      'eth': {
        name: 'Ethereum',
        symbol: 'ETH',
        address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        isNative: true
      },
      'WETH': {
        name: 'Wrapped Ethereum',
        symbol: 'WETH',
        address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
        decimals: 18,
        isNative: false
      }
    }
  }
};

// Chain configuration mapping
const CHAIN_IDS: { [key: string]: number | string } = {
  'Ethereum': 'ethereum',
  'Sepolia': 'sepolia',
  'BSC': 'bsc',
  'BSC Testnet': 'bsc-testnet',
  'stellar-testnet': 'stellar-testnet',
  'stellar-mainnet': 'stellar-mainnet'
};

// Token address mapping
const TOKEN_ADDRESSES: { [key: string]: string } = {
  'ETH': 'ethereum',
  'Sepolia ETH': 'sepolia-eth',
  'WETH': 'weth',
  'USDC': 'usdc',
  'USDT': 'usdt',
  'XLM': 'XLM'
};

export function createOrder(params: OrderCreationParams): OrderData {
  console.log('🔧 ========================================');
  console.log('🔧 ORDER CREATION PROCESS STARTED');
  console.log('🔧 ========================================');
  console.log('📋 Input parameters:', JSON.stringify(params, null, 2));
  
  let secret: string;
  let hashedSecret: string;
  let partialFillManager: PartialFillOrderManager | undefined;
  let partialFillSecrets: string[] | undefined;
  let partialFillSecretHashes: string[] | undefined;

  if (params.enablePartialFills && params.partsCount && params.partsCount > 1) {
    console.log(`🌳 Creating partial fill order with ${params.partsCount} parts`);
    
    // Create partial fill manager with merkle tree
    partialFillManager = new PartialFillOrderManager(params.partsCount);
    hashedSecret = partialFillManager.getHashLock();
    // For partial fills, we don't need a main secret - only the partial fill secrets
    secret = ''; // No main secret for partial fills
    
    // Store all secrets and hashes for UI display
    partialFillSecrets = partialFillManager.getAllSecrets();
    partialFillSecretHashes = partialFillManager.getAllSecretHashes();
    
    console.log(`📋 Generated ${params.partsCount} secrets for partial fill`);
    console.log(`🔐 HashLock (Merkle Root): ${hashedSecret}`);
    console.log(`🔑 No main secret for partial fills - only ${params.partsCount} partial fill secrets`);
  } else {
    console.log('🔐 Creating single fill order');
    
    // Single fill - generate traditional secret and hash
    const secretBytes = ethers.utils.randomBytes(32);
    secret = ethers.utils.hexlify(secretBytes);
    hashedSecret = ethers.utils.sha256(secretBytes);
    
    console.log(`🔑 Generated secret: ${secret}`);
    console.log(`🔐 Generated hashed secret: ${hashedSecret}`);
  }
  
  // Store order creation time
  const orderCreationTime = Math.floor(Date.now() / 1000);
  
  // Set time windows to 0 for now (will be handled by relayer)
  const withdrawalStart = 0;
  const publicWithdrawalStart = 0;
  const cancellationStart = 0;
  const publicCancellationStart = 0;

  console.log(`⏰ Order creation time: ${new Date(orderCreationTime * 1000).toLocaleString()}`);

  // Generate orderId using proper BigNumber format
  const orderId = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['string', 'address', 'string', 'uint256', 'string'],
      [hashedSecret + Date.now().toString(), params.buyerAddress, 'CROSS_CHAIN_SWAP', ethers.utils.parseEther(params.sourceAmount), hashedSecret]
    )
  );

  console.log(`🆔 Generated order ID: ${orderId}`);

  // Get chain IDs
  const srcChainId = CHAIN_IDS[params.sourceChain] || params.sourceChain;
  const dstChainId = CHAIN_IDS[params.destinationChain] || params.destinationChain;

  // Get token addresses
  const srcToken = TOKEN_ADDRESSES[params.sourceToken] || params.sourceToken;
  const dstToken = TOKEN_ADDRESSES[params.destinationToken] || params.destinationToken;

  console.log(`🔗 Chain and token mapping:`);
  console.log(`   Source: ${params.sourceChain} -> ${srcChainId} -> ${params.sourceToken} -> ${srcToken}`);
  console.log(`   Destination: ${params.destinationChain} -> ${dstChainId} -> ${params.destinationToken} -> ${dstToken}`);

  const orderData: OrderData = {
    orderId,
    buyerAddress: params.buyerAddress,
    srcChainId,
    dstChainId,
    srcToken,
    dstToken,
    srcAmount: params.sourceAmount,
    dstAmount: params.destinationAmount,
    market_price: params.destinationAmount, // As per requirement, market_price = dstAmount
    slippage: "0.1", // Default slippage
    // Internal data (not sent to relayer)
    hashedSecret,
    secret,
    orderCreationTime,
    withdrawalStart,
    publicWithdrawalStart,
    cancellationStart,
    publicCancellationStart,
    isPartialFillEnabled: params.enablePartialFills,
    partialFillManager,
    partialFillSecrets,
    partialFillSecretHashes
  };

  console.log('✅ ========================================');
  console.log('✅ ORDER CREATION COMPLETED SUCCESSFULLY');
  console.log('✅ ========================================');
  console.log('🔐 ========================================');
  console.log('🔐 HASHED SECRET GENERATION VERIFICATION');
  console.log('🔐 ========================================');
  console.log('📋 Hashed Secret:', orderData.hashedSecret);
  console.log('📋 Hashed Secret type:', typeof orderData.hashedSecret);
  console.log('📋 Hashed Secret length:', orderData.hashedSecret ? orderData.hashedSecret.length : 'undefined');
  console.log('📋 Is Partial Fill:', orderData.isPartialFillEnabled);
  console.log('🔐 ========================================');
  console.log('📋 Final order data:', {
    orderId: orderData.orderId,
    buyerAddress: orderData.buyerAddress,
    srcChainId: orderData.srcChainId,
    dstChainId: orderData.dstChainId,
    srcToken: orderData.srcToken,
    dstToken: orderData.dstToken,
    srcAmount: orderData.srcAmount,
    dstAmount: orderData.dstAmount,
    market_price: orderData.market_price,
    slippage: orderData.slippage,
    hashedSecret: orderData.hashedSecret,
    isPartialFill: orderData.isPartialFillEnabled
  });
  
  if (orderData.isPartialFillEnabled && orderData.partialFillSecrets) {
    console.log('🌳 Partial fill details:');
    console.log(`   Total parts: ${orderData.partialFillSecrets.length}`);
    console.log(`   Merkle root: ${orderData.hashedSecret}`);
    orderData.partialFillSecrets.forEach((secret, index) => {
      console.log(`   Part ${index + 1}: ${secret.slice(0, 10)}...`);
    });
  }
  
  console.log('🔧 ========================================');

  return orderData;
}

/**
 * Prepare buyer by approving factory to spend their tokens
 * This should be called IMMEDIATELY after order creation
 */
export async function prepareBuyer(
  sourceChain: string,
  sourceToken: string,
  sourceAmount: string,
  walletClient: any
): Promise<void> {
  console.log('🔐 Preparing buyer approval...');
  
  const chainConfig = CHAIN_CONFIGS[sourceChain as keyof typeof CHAIN_CONFIGS];
  if (!chainConfig) {
    throw new Error(`Chain configuration not found for ${sourceChain}`);
  }
  
  const tokenConfig = chainConfig.tokens[sourceToken as keyof typeof chainConfig.tokens];
  if (!tokenConfig) {
    throw new Error(`Token configuration not found for ${sourceToken}`);
  }
  
  const factoryAddress = chainConfig.factoryAddress;
  const amountInWei = ethers.utils.parseUnits(sourceAmount, tokenConfig.decimals);
  
  console.log(`📋 Approval Details:`);
  console.log(`   Chain: ${sourceChain}`);
  console.log(`   Token: ${sourceToken} (${tokenConfig.address})`);
  console.log(`   Amount: ${sourceAmount} (${amountInWei.toString()} wei)`);
  console.log(`   Factory: ${factoryAddress}`);
  console.log(`   Is Native: ${tokenConfig.isNative}`);
  
  try {
    // Import viem for contract interactions
    const { createPublicClient, http, parseEther, encodeFunctionData } = await import('viem');
    const { sepolia } = await import('wagmi/chains');
    
    // Create public client
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http()
    });
    
    if (tokenConfig.isNative) {
      // For native tokens (ETH), we need to wrap them first
      console.log('🔄 Wrapping native token...');
      
      const wethAddress = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9';
      
      // Encode deposit function
      const depositData = encodeFunctionData({
        abi: [{
          name: 'deposit',
          type: 'function',
          stateMutability: 'payable',
          inputs: [],
          outputs: []
        }],
        functionName: 'deposit'
      });
      
      // Send deposit transaction
      console.log('📝 Wrapping ETH to WETH...');
      const depositHash = await walletClient.sendTransaction({
        to: wethAddress as `0x${string}`,
        data: depositData,
        value: BigInt(amountInWei.toString())
      });
      
      console.log('⏳ Waiting for wrap transaction...');
      await publicClient.waitForTransactionReceipt({ hash: depositHash });
      console.log('✅ Token wrapped successfully');
      
      // Encode approve function
      const approveData = encodeFunctionData({
        abi: [{
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ name: '', type: 'bool' }]
        }],
        functionName: 'approve',
        args: [factoryAddress as `0x${string}`, BigInt(amountInWei.toString())]
      });
      
      // Send approve transaction
      console.log('📝 Approving factory to spend wrapped tokens...');
      const approveHash = await walletClient.sendTransaction({
        to: wethAddress as `0x${string}`,
        data: approveData
      });
      
      console.log('⏳ Waiting for approval transaction...');
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log('✅ Factory approved to spend wrapped tokens');
      
    } else {
      // For ERC20 tokens, just approve
      console.log('📝 Approving ERC20 token...');
      
      const approveData = encodeFunctionData({
        abi: [{
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ name: '', type: 'bool' }]
        }],
        functionName: 'approve',
        args: [factoryAddress as `0x${string}`, BigInt(amountInWei.toString())]
      });
      
      const approveHash = await walletClient.sendTransaction({
        to: tokenConfig.address as `0x${string}`,
        data: approveData
      });
      
      console.log('⏳ Waiting for approval transaction...');
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log('✅ Factory approved to spend tokens');
    }
    
    console.log('🎉 Buyer preparation completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during buyer preparation:', error);
    throw new Error(`Buyer preparation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Prepare Stellar buyer by setting up trustlines and approvals
 * This should be called for Stellar-side operations
 */
export async function prepareStellarBuyer(
  sourceToken: string,
  sourceAmount: string,
  stellarWallet: any
): Promise<void> {
  console.log('🔐 Preparing Stellar buyer approval...');
  
  try {
    // For Stellar, we need to ensure the account has trustlines for the token
    // For native XLM, no trustline is needed
    if (sourceToken.toLowerCase() === 'xlm') {
      console.log('✅ Native XLM - no trustline required');
      return;
    }
    
    // For other Stellar tokens, we would need to set up trustlines
    // This is a simplified implementation
    console.log('📝 Setting up Stellar trustline for token:', sourceToken);
    console.log('💰 Amount:', sourceAmount);
    
    // In a real implementation, you would:
    // 1. Check if trustline exists
    // 2. Create trustline if it doesn't exist
    // 3. Handle any other Stellar-specific approvals
    
    console.log('✅ Stellar preparation completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during Stellar preparation:', error);
    throw new Error(`Stellar preparation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// API call functions
export async function sendOrderToRelayer(orderData: OrderData, isPartialFill: boolean = false): Promise<any> {
  console.log('📤 ========================================');
  console.log('📤 SENDING ORDER TO RELAYER');
  console.log('📤 ========================================');
  
  const endpoint = isPartialFill ? 'http://localhost:8000/partialfill' : 'http://localhost:8000/create';
  console.log(`🌐 Endpoint: ${endpoint}`);
  console.log(`🔀 Order type: ${isPartialFill ? 'Partial Fill' : 'Single Fill'}`);
  
  // Prepare request body (including hashedSecret for resolver)
  const requestBody: any = {
    orderId: orderData.orderId,
    buyerAddress: orderData.buyerAddress,
    srcChainId: orderData.srcChainId,
    dstChainId: orderData.dstChainId,
    srcToken: orderData.srcToken,
    dstToken: orderData.dstToken,
    srcAmount: orderData.srcAmount,
    dstAmount: orderData.dstAmount,
    market_price: orderData.market_price,
    slippage: orderData.slippage,
    hashedSecret: orderData.hashedSecret // Include hashedSecret for resolver
  };

  // For partial fill orders, also include the segment secrets
  if (isPartialFill && orderData.partialFillSecrets && orderData.partialFillSecretHashes) {
    const segmentSecrets = orderData.partialFillSecrets.map((secret, index) => ({
      segmentId: index + 1,
      secret: secret,
      hashedSecret: orderData.partialFillSecretHashes![index]
    }));
    
    requestBody.segmentSecrets = segmentSecrets;
    console.log('🔐 Including segment secrets for partial fill order:');
    segmentSecrets.forEach((segment, index) => {
      console.log(`   Segment ${index + 1}: Secret: ${segment.secret.slice(0, 10)}..., Hash: ${segment.hashedSecret.slice(0, 10)}...`);
    });
  }

  console.log('🔐 ========================================');
  console.log('🔐 DEBUGGING HASHED SECRET IN REQUEST');
  console.log('🔐 ========================================');
  console.log('📋 OrderData hashedSecret:', orderData.hashedSecret);
  console.log('📋 OrderData hashedSecret type:', typeof orderData.hashedSecret);
  console.log('📋 OrderData hashedSecret length:', orderData.hashedSecret ? orderData.hashedSecret.length : 'undefined');
  console.log('📋 Request body hashedSecret:', requestBody.hashedSecret);
  console.log('📋 Request body hashedSecret type:', typeof requestBody.hashedSecret);
  console.log('📋 Request body hashedSecret length:', requestBody.hashedSecret ? requestBody.hashedSecret.length : 'undefined');
  console.log('🔐 ========================================');
  
  console.log('📋 Request body (excluding internal data):');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('📋 Internal data (not sent to relayer):');
  if (orderData.isPartialFillEnabled) {
    console.log(`   HashLock (Merkle Root): ${orderData.hashedSecret}`);
    console.log(`   Partial Fill Secrets: ${orderData.partialFillSecrets?.length || 0} parts`);
    console.log(`   No main secret for partial fills`);
  } else {
    console.log(`   Hashed Secret: ${orderData.hashedSecret}`);
    console.log(`   Secret: ${orderData.secret}`);
  }
  console.log(`   Order Creation Time: ${new Date(orderData.orderCreationTime * 1000).toLocaleString()}`);
  
  if (orderData.isPartialFillEnabled && orderData.partialFillSecrets) {
    console.log(`   Partial Fill Secrets: ${orderData.partialFillSecrets.length} parts`);
    orderData.partialFillSecrets.forEach((secret, index) => {
      console.log(`     Part ${index + 1}: ${secret.slice(0, 10)}...`);
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ ========================================');
    console.log('✅ RELAYER RESPONSE RECEIVED');
    console.log('✅ ========================================');
    console.log('📋 Response data:', JSON.stringify(result, null, 2));
    console.log('✅ ========================================');
    return result;
  } catch (error) {
    console.error('❌ Error sending order to relayer:', error);
    throw error;
  }
} 

// Function to fetch hashedSecret directly from database by order ID
export async function fetchHashedSecretFromDatabase(orderId: string): Promise<string | null> {
  console.log('🔍 ========================================');
  console.log('🔍 FETCHING HASHED SECRET FROM DATABASE');
  console.log('🔍 ========================================');
  console.log('📋 Order ID:', orderId);
  
  try {
    const response = await fetch(`http://localhost:8000/get-hashed-secret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId }),
    });

    if (!response.ok) {
      console.error('❌ Failed to fetch hashedSecret from database:', response.status, response.statusText);
      return null;
    }

    const result = await response.json();
    console.log('📋 Database response:', result);
    
    if (result.success && result.hashedSecret) {
      console.log('✅ HashedSecret fetched successfully from database');
      console.log('🔐 HashedSecret:', result.hashedSecret);
      console.log('🔐 HashedSecret length:', result.hashedSecret.length);
      return result.hashedSecret;
    } else {
      console.error('❌ HashedSecret not found in database response');
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching hashedSecret from database:', error);
    return null;
  }
} 