import { ethers } from 'ethers'
import { toast } from '@/hooks/use-toast'
import { fetchHashedSecretFromDatabase } from './order-utils'

// Contract ABIs for source escrow creation
const lopABI = [
  "function fillOrder(bytes32 orderId, address maker, address recipient, uint256 tokenAmount, bytes32 hashedSecret, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 publicCancellationStart, uint256 partIndex, uint256 totalParts) external payable returns (address)",
  "event SrcEscrowCreated(address escrowAddress, address maker, address recipient, bytes32 hashedSecret, uint256 amount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 publicCancellationStart)"
]

// Chain configurations
const CHAIN_CONFIGS = {
  'sepolia': {
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF',
    factoryAddress: '0x4F25B17649F0A056138E251487c27A22D793DBA7',
    lopAddress: '0x13F4118A0C9AA013eeB078f03318aeea84469cDD',
    chainId: 11155111
  },
  'stellar-testnet': {
    rpcUrl: 'https://soroban-testnet.stellar.org:443',
    factoryAddress: 'CBFM4G5YRNXNG64B3QRBQXZGD6KVQ3MDGUWW5CFRL4LZNN7ZDLPVWVM5', 
    lopAddress: 'CCFLX4NZH4MVTQ5DYO74LEB3S7U2GO6OH3VP4NPYF4CXXSXR4GPRXEXV',
    chainId: 'stellar-testnet'
  }
}

export interface ResolverContractCall {
  contract: string
  function: string
  parameters: any[]
  value?: string
  gasLimit?: number
  gasPrice?: string
  chainType: 'evm' | 'stellar'
}

export interface ExecutionResult {
  success: boolean
  transactionHash?: string
  escrowAddress?: string
  error?: string
  gasUsed?: number
  details?: any
}

export interface SourceEscrowParams {
  orderId: string
  buyerAddress: string
  resolverAddress: string
  srcAmount: string
  hashedSecret: string
  isPartialFill: boolean
  segmentIndex?: number
  totalParts?: number
}

export class ResolverContractManager {
  private providers: { [chainId: string]: ethers.providers.JsonRpcProvider } = {}
  private signers: { [chainId: string]: ethers.Wallet } = {}

  constructor() {}

  // Initialize providers and signers for different chains
  async initializeChain(chainId: string, privateKey: string) {
    const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS]
    if (!config) {
      throw new Error(`Unsupported chain: ${chainId}`)
    }

    console.log(`🔗 Initializing chain: ${chainId}`)
    console.log(`🌐 RPC URL: ${config.rpcUrl}`)
    
    try {
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl)
      
      // Test the connection
      const network = await provider.getNetwork()
      console.log(`✅ Network detected: ${network.name} (chainId: ${network.chainId})`)
      
      const signer = new ethers.Wallet(privateKey, provider)
      
      this.providers[chainId] = provider
      this.signers[chainId] = signer

      console.log(`✅ Chain ${chainId} initialized successfully`)
      return { provider, signer }
    } catch (error) {
      console.error(`❌ Failed to initialize chain ${chainId}:`, error)
      throw new Error(`Failed to initialize chain ${chainId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Calculate time windows based on the logic from dynamic-swap.ts
  private calculateTimeWindows(): {
    withdrawalStart: number
    publicWithdrawalStart: number
    cancellationStart: number
    publicCancellationStart: number
  } {
    const now = Math.floor(Date.now() / 1000)
    return {
      withdrawalStart: now + 60, // 1 minute from now
      publicWithdrawalStart: now + 300, // 5 minutes from now
      cancellationStart: now + 600, // 10 minutes from now
      publicCancellationStart: now + 900 // 15 minutes from now
    }
  }

  // Create Source Escrow (EVM) - Single contract call for winner
  async createSourceEscrowEVM(
    chainId: string,
    params: SourceEscrowParams
  ): Promise<ExecutionResult> {
    try {
      console.log('🔍 Creating source escrow (EVM)...')
      console.log('📋 Parameters:', params)
      
      const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS]
      console.log('🔗 Chain config:', config)
      
      const signer = this.signers[chainId]
      console.log('🔑 Signer:', signer ? 'Initialized' : 'Not initialized')
      
      if (!signer) {
        throw new Error(`Signer not initialized for chain: ${chainId}`)
      }

      if (!config.lopAddress || config.lopAddress === '0x...') {
        throw new Error(`LOP address not configured for chain: ${chainId}`)
      }
      
      const lopContract = new ethers.Contract(config.lopAddress, lopABI, signer)
      console.log('📜 LOP Contract address:', config.lopAddress)
      
      // Calculate time windows
      const timeWindows = this.calculateTimeWindows()
      console.log('⏰ Time windows calculated:', timeWindows)
      
      // Convert amount to BigNumber
      const srcAmount = ethers.utils.parseEther(params.srcAmount)
      
      // Set partIndex and totalParts based on order type
      const partIndex = params.isPartialFill ? (params.segmentIndex || 0) : 0
      const totalParts = params.isPartialFill ? (params.totalParts || 1) : 1
      
      console.log('🔐 ========================================');
      console.log('🔐 CONTRACT CALL - CREATE SOURCE ESCROW (EVM)');
      console.log('🔐 ========================================');
      console.log('🚀 Calling fillOrder with parameters:');
      console.log('   orderId:', params.orderId);
      console.log('   orderId type:', typeof params.orderId);
      console.log('   orderId length:', params.orderId?.length);
      console.log('   buyerAddress (maker):', params.buyerAddress);
      console.log('   buyerAddress type:', typeof params.buyerAddress);
      console.log('   buyerAddress length:', params.buyerAddress?.length);
      console.log('   buyerAddress valid:', ethers.utils.isAddress(params.buyerAddress));
      console.log('   resolverAddress (recipient):', params.resolverAddress);
      console.log('   resolverAddress type:', typeof params.resolverAddress);
      console.log('   resolverAddress length:', params.resolverAddress?.length);
      console.log('   resolverAddress valid:', ethers.utils.isAddress(params.resolverAddress));
      console.log('   srcAmount (tokenAmount):', srcAmount.toString());
      console.log('   srcAmount type:', typeof srcAmount);
      console.log('   hashedSecret:', params.hashedSecret);
      console.log('   hashedSecret type:', typeof params.hashedSecret);
      console.log('   hashedSecret length:', params.hashedSecret?.length);
      console.log('   withdrawalStart:', timeWindows.withdrawalStart);
      console.log('   withdrawalStart type:', typeof timeWindows.withdrawalStart);
      console.log('   publicWithdrawalStart:', timeWindows.publicWithdrawalStart);
      console.log('   publicWithdrawalStart type:', typeof timeWindows.publicWithdrawalStart);
      console.log('   cancellationStart:', timeWindows.cancellationStart);
      console.log('   cancellationStart type:', typeof timeWindows.cancellationStart);
      console.log('   publicCancellationStart:', timeWindows.publicCancellationStart);
      console.log('   publicCancellationStart type:', typeof timeWindows.publicCancellationStart);
      console.log('   partIndex:', partIndex);
      console.log('   partIndex type:', typeof partIndex);
      console.log('   totalParts:', totalParts);
      console.log('   totalParts type:', typeof totalParts);
      console.log('   value:', ethers.utils.parseEther("0.001").toString());
      console.log('   value type:', typeof ethers.utils.parseEther("0.001"));
      console.log('🔐 ========================================');
      
      // Validate addresses before contract call
      console.log('🔍 ADDRESS VALIDATION:');
      console.log('   orderId is valid hash:', params.orderId?.startsWith('0x') && params.orderId?.length === 66);
      console.log('   buyerAddress is valid address:', ethers.utils.isAddress(params.buyerAddress));
      console.log('   resolverAddress is valid address:', ethers.utils.isAddress(params.resolverAddress));
      
      if (!ethers.utils.isAddress(params.buyerAddress)) {
        throw new Error(`Invalid buyerAddress: ${params.buyerAddress}`);
      }
      if (!ethers.utils.isAddress(params.resolverAddress)) {
        throw new Error(`Invalid resolverAddress: ${params.resolverAddress}`);
      }
      
      // Check wallet balance before transaction
      const balance = await signer.getBalance()
      const transactionValue = ethers.utils.parseEther("0.001")
      
      console.log(`💰 Balance check:`, {
        walletBalance: ethers.utils.formatEther(balance),
        transactionValue: ethers.utils.formatEther(transactionValue),
        hasEnoughFunds: balance.gte(transactionValue)
      })
      
      if (balance.lt(transactionValue)) {
        throw new Error(`Insufficient funds. Required: ${ethers.utils.formatEther(transactionValue)} ETH, Available: ${ethers.utils.formatEther(balance)} ETH`)
      }

      // Execute the transaction
      const tx = await lopContract.fillOrder(
        params.orderId,
        params.buyerAddress,
        params.resolverAddress,
        srcAmount,
        params.hashedSecret,
        timeWindows.withdrawalStart,
        timeWindows.publicWithdrawalStart,
        timeWindows.cancellationStart,
        timeWindows.publicCancellationStart,
        partIndex,
        totalParts,
        {
          value: ethers.utils.parseEther("0.001"),
          gasLimit: 2000000 // Fixed gas limit
        }
      )

      const receipt = await tx.wait()
      
      // Extract escrow address from event
      const srcEscrowCreatedTopic = ethers.utils.id("SrcEscrowCreated(address,address,address,bytes32,uint256,uint256,uint256,uint256,uint256)")
      const srcEscrowCreatedEvent = receipt.logs.find((log: any) => 
        log.topics && log.topics[0] === srcEscrowCreatedTopic
      )
      
      let escrowAddress = ""
      if (srcEscrowCreatedEvent) {
        escrowAddress = ethers.utils.getAddress("0x" + srcEscrowCreatedEvent.data.slice(26, 66))
      }

      return {
        success: true,
        transactionHash: tx.hash,
        escrowAddress,
        gasUsed: receipt.gasUsed.toNumber(),
        details: {
          orderId: params.orderId,
          buyerAddress: params.buyerAddress,
          resolverAddress: params.resolverAddress,
          amount: ethers.utils.formatEther(srcAmount),
          hashedSecret: params.hashedSecret,
          timeWindows,
          partIndex,
          totalParts
        }
      }

    } catch (error) {
      console.error('❌ Error creating source escrow (EVM):', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Fetch hashedSecret from database and create source escrow
  async createSourceEscrowForWinner(
    chainId: string,
    orderId: string,
    buyerAddress: string,
    resolverAddress: string,
    srcAmount: string,
    isPartialFill: boolean = false,
    segmentIndex?: number,
    totalParts?: number
  ): Promise<ExecutionResult> {
    try {
      console.log('🔍 Starting source escrow creation for winner...')
      console.log('📋 Order ID:', orderId)
      console.log('📋 Order ID type:', typeof orderId)
      console.log('📋 Order ID length:', orderId?.length)
      console.log('📋 Buyer Address:', buyerAddress)
      console.log('📋 Buyer Address type:', typeof buyerAddress)
      console.log('📋 Buyer Address length:', buyerAddress?.length)
      console.log('📋 Resolver Address:', resolverAddress)
      console.log('📋 Resolver Address type:', typeof resolverAddress)
      console.log('📋 Resolver Address length:', resolverAddress?.length)
      console.log('📋 Source Amount:', srcAmount)
      console.log('📋 Source Amount type:', typeof srcAmount)
      console.log('📋 Is Partial Fill:', isPartialFill)
      console.log('📋 Segment Index:', segmentIndex)
      console.log('📋 Total Parts:', totalParts)
      
      // Fetch hashedSecret from database
      const hashedSecret = await fetchHashedSecretFromDatabase(orderId)
      if (!hashedSecret) {
        throw new Error('Failed to fetch hashedSecret from database')
      }
      
      console.log('✅ HashedSecret fetched from database:', hashedSecret)
      
      // Prepare parameters
      const params: SourceEscrowParams = {
        orderId,
        buyerAddress,
        resolverAddress,
        srcAmount,
        hashedSecret,
        isPartialFill,
        segmentIndex,
        totalParts
      }
      
      // Create source escrow
      return await this.createSourceEscrowEVM(chainId, params)
      
    } catch (error) {
      console.error('❌ Error in createSourceEscrowForWinner:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Validate order details
  validateOrderDetails(order: any): boolean {
    console.log('🔍 Validating order details:', order)
    
    // Check for required properties with fallbacks
    const hasOrderId = order.orderId || order.id
    const hasSourceAmount = order.sourceAmount || order.amount
    const hasDestinationAmount = order.destinationAmount || order.currentPrice
    const hasHashedSecret = order.hashedSecret || order.secret
    const hasWithdrawalStart = order.withdrawalStart || order.timelock
    
    console.log('🔍 Validation checks:', {
      hasOrderId,
      hasSourceAmount,
      hasDestinationAmount,
      hasHashedSecret,
      hasWithdrawalStart
    })
    
    // For now, be more lenient - only require orderId and at least one amount
    return !!(
      hasOrderId && 
      (hasSourceAmount || hasDestinationAmount)
    )
  }

  // Utility method to generate contract call details (kept for interface compatibility)
  generateContractCall(
    contract: string,
    functionName: string,
    parameters: any[],
    value?: string,
    gasLimit?: number,
    gasPrice?: string,
    chainType: 'evm' | 'stellar' = 'evm'
  ): ResolverContractCall {
    return {
      contract,
      function: functionName,
      parameters,
      value,
      gasLimit,
      gasPrice,
      chainType
    }
  }

  // Wait for withdrawal window
  async waitForWithdrawalWindow(withdrawalStart: number): Promise<void> {
    const currentTime = Math.floor(Date.now() / 1000)
    const timeToWait = Math.max(0, withdrawalStart - currentTime)
    
    if (timeToWait > 0) {
      console.log(`⏳ Waiting ${timeToWait} seconds for withdrawal window...`)
      await new Promise(resolve => setTimeout(resolve, timeToWait * 1000))
    }
  }


}

// Export singleton instance
export const resolverContractManager = new ResolverContractManager() 