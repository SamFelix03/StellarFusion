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

// API call functions
export async function sendOrderToRelayer(orderData: OrderData, isPartialFill: boolean = false): Promise<any> {
  console.log('📤 ========================================');
  console.log('📤 SENDING ORDER TO RELAYER');
  console.log('📤 ========================================');
  
  const endpoint = isPartialFill ? 'http://localhost:8000/partialfill' : 'http://localhost:8000/create';
  console.log(`🌐 Endpoint: ${endpoint}`);
  console.log(`🔀 Order type: ${isPartialFill ? 'Partial Fill' : 'Single Fill'}`);
  
  // Prepare request body (excluding internal data)
  const requestBody = {
    orderId: orderData.orderId,
    buyerAddress: orderData.buyerAddress,
    srcChainId: orderData.srcChainId,
    dstChainId: orderData.dstChainId,
    srcToken: orderData.srcToken,
    dstToken: orderData.dstToken,
    srcAmount: orderData.srcAmount,
    dstAmount: orderData.dstAmount,
    market_price: orderData.market_price,
    slippage: orderData.slippage
  };

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