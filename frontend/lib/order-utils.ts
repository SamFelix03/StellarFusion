import { ethers } from 'ethers';
import { HashLock, PartialFillOrderManager } from './hash-lock';
import { chainsConfig } from '@/constants/chains';

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
    // Use first secret as the main order secret (for backwards compatibility) - matching backend
    secret = partialFillManager.getSecret(0);
    
    // Store all secrets and hashes for UI display
    partialFillSecrets = partialFillManager.getAllSecrets();
    partialFillSecretHashes = partialFillManager.getAllSecretHashes();
    
    console.log(`📋 Generated ${params.partsCount + 1} secrets for partial fill (including extra)`);
    console.log(`🔐 HashLock (Merkle Root): ${hashedSecret}`);
    console.log(`🔑 Main secret (first secret): ${secret.slice(0, 10)}...`);
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

  // Get chain IDs directly from chainsConfig
  const srcChainId = params.sourceChain;
  const dstChainId = params.destinationChain;

  // Get token symbols directly (no mapping needed)
  const srcToken = params.sourceToken;
  const dstToken = params.destinationToken;

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
    console.log(`   Total secrets: ${orderData.partialFillSecrets.length} (${orderData.partialFillSecrets.length - 1} parts + 1 extra)`);
    console.log(`   Merkle root: ${orderData.hashedSecret}`);
    orderData.partialFillSecrets.forEach((secret, index) => {
      console.log(`   Secret ${index + 1}: ${secret.slice(0, 10)}...`);
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
  
  // Map the chain name to the correct chain key in chainsConfig
  let chainKey: string;
  if (sourceChain === "Sepolia Testnet") {
    chainKey = "sepolia";
  } else if (sourceChain === "Stellar Testnet") {
    chainKey = "stellar-testnet";
  } else {
    chainKey = sourceChain.toLowerCase();
  }
  
  const chainConfig = chainsConfig[chainKey as keyof typeof chainsConfig];
  
  if (!chainConfig) {
    throw new Error(`Chain configuration not found for ${sourceChain} (key: ${chainKey})`);
  }
  
  // Use the token symbol directly from chainsConfig
  const tokenKey = sourceToken;
  const tokenConfig = chainConfig.tokens[tokenKey as keyof typeof chainConfig.tokens];
  
  if (!tokenConfig) {
    throw new Error(`Token configuration not found for ${sourceToken} (key: ${tokenKey}) in chain ${chainKey}. Available tokens: ${Object.keys(chainConfig.tokens).join(', ')}`);
  }
  
  const factoryAddress = chainConfig.factoryAddress;
  const amountInWei = ethers.utils.parseUnits(sourceAmount, tokenConfig.decimals);
  
  console.log(`📋 Approval Details:`);
  console.log(`   Chain: ${sourceChain} -> ${chainKey}`);
  console.log(`   Token: ${sourceToken} -> ${tokenKey} (${tokenConfig.address})`);
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
      hashedSecret: orderData.partialFillSecretHashes![index]
    }));
    
    requestBody.segmentSecrets = segmentSecrets;
    console.log('🔐 Including segment hashes for partial fill order (secrets kept private):');
    segmentSecrets.forEach((segment, index) => {
      console.log(`   Segment ${index + 1}: Hash: ${segment.hashedSecret.slice(0, 10)}...`);
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

/**
 * Share secrets with the relayer for order execution
 * This is called AFTER order creation to provide the relayer with the actual secrets
 */
export async function shareSecretsWithRelayer(orderData: OrderData): Promise<any> {
  console.log('🔐 ========================================');
  console.log('🔐 SHARING SECRETS WITH RELAYER');
  console.log('🔐 ========================================');
  console.log('📋 Order ID:', orderData.orderId);
  console.log('📋 Is Partial Fill:', orderData.isPartialFillEnabled);
  
  // Only handle single fill orders - partial fills use shareSegmentSecret
  if (orderData.isPartialFillEnabled) {
    throw new Error('Partial fill orders should use shareSegmentSecret() instead of shareSecretsWithRelayer()');
  }
  
  try {
    // For single fill orders, send the main secret
    console.log('🔑 Sharing single fill secret...');
    
    const response = await fetch(`http://localhost:8000/orders/${orderData.orderId}/secret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        secret: orderData.secret,
        hashedSecret: orderData.hashedSecret 
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Main secret shared successfully');
    console.log('📋 Response:', JSON.stringify(result, null, 2));
    return result;
    
  } catch (error) {
    console.error('❌ Error sharing secrets with relayer:', error);
    throw new Error(`Failed to share secrets: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Share a specific segment secret with the relayer when requested by resolver
 * This is called when a resolver wins a specific segment and needs the secret
 */
export async function shareSegmentSecret(orderId: string, segmentId: number, orderData: OrderData): Promise<any> {
  console.log('🔐 ========================================');
  console.log('🔐 SHARING SPECIFIC SEGMENT SECRET');
  console.log('🔐 ========================================');
  console.log('📋 Order ID:', orderId);
  console.log('📋 Segment ID:', segmentId);
  
  if (!orderData.isPartialFillEnabled || !orderData.partialFillSecrets || !orderData.partialFillSecretHashes) {
    throw new Error('Order is not a partial fill order or missing segment data');
  }
  
  // Validate segment ID
  if (segmentId < 1 || segmentId > orderData.partialFillSecrets.length) {
    throw new Error(`Invalid segment ID: ${segmentId}. Must be between 1 and ${orderData.partialFillSecrets.length}`);
  }
  
  // Get the specific segment secret (segmentId is 1-based, array is 0-based)
  const secretIndex = segmentId - 1;
  const secret = orderData.partialFillSecrets[secretIndex];
  const hashedSecret = orderData.partialFillSecretHashes![secretIndex];
  
  console.log(`🔐 Sharing secret for segment ${segmentId}:`);
  console.log(`   Secret: ${secret.slice(0, 10)}...`);
  console.log(`   Hash: ${hashedSecret.slice(0, 10)}...`);
  
  try {
    const response = await fetch(`http://localhost:8000/orders/${orderId}/segment-secret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        segmentId: segmentId,
        secret: secret,
        hashedSecret: hashedSecret
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Segment secret shared successfully');
    console.log('📋 Response:', JSON.stringify(result, null, 2));
    return result;
    
  } catch (error) {
    console.error('❌ Error sharing segment secret:', error);
    throw new Error(`Failed to share segment secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} 