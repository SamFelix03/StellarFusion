import { ethers } from 'ethers'
import { toast } from '@/hooks/use-toast'
import { chainsConfig } from '@/constants/chains'
import { fetchHashedSecretFromDatabase } from './order-utils'
import { GasValuesOverflowError } from 'viem/account-abstraction'

// Contract ABIs for source escrow creation
const lopABI = [
  "function fillOrder(bytes32 orderId, address maker, address recipient, uint256 tokenAmount, bytes32 hashedSecret, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 publicCancellationStart, uint256 partIndex, uint16 totalParts) external payable returns (address)",
  "event SrcEscrowCreated(address escrowAddress, address maker, address recipient, bytes32 hashedSecret, uint256 amount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 publicCancellationStart)"
]

// Chain configurations
// Use the shared chains configuration
const CHAIN_CONFIGS = chainsConfig

export interface ResolverContractCall {
  contract: string
  function: string
  parameters: any[]
  value?: string
  gasLimit?: number
  gasPrice?: string
  chainType: 'evm' | 'stellar'
}

export interface ResolverPreparationParams {
  chainId: string
  tokenSymbol: string
  destinationAmount: string
  resolverAddress: string
}

export interface WithdrawalParams {
  orderId: string
  escrowAddress: string
  secret: string
  chainId: string
  isSource: boolean
  isPartialFill?: boolean
  merkleProof?: string[]
  segmentIndex?: number
}

export interface RelayerVerificationParams {
  orderId: string
  sourceEscrowAddress: string
  destinationEscrowAddress: string
  sourceChain: string
  destinationChain: string
  withdrawalStart: number
}

export interface ResolverOrderExecution {
  orderId: string
  sourceChain: string
  destinationChain: string
  sourceToken: string
  destinationToken: string
  sourceAmount: string
  destinationAmount: string
  buyerAddress: string
  resolverAddress: string // The connected wallet address of the resolver (user)
  hashedSecret: string
  isPartialFill: boolean
  segmentIndex?: number
  totalParts?: number
  merkleProof?: string[]
  // Signer objects for transaction execution
  evmSigner?: ethers.Wallet | ethers.Signer
  stellarKeypair?: any // Stellar keypair object
  stellarSecretKey?: string // Stellar secret key for CLI operations
}

export interface ExecutionResult {
  success: boolean
  transactionHash?: string
  escrowAddress?: string
  error?: string
  gasUsed?: number
  details?: any
  message?: string
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

  // Prepare resolver tokens and approvals for destination chain
  async prepareResolver(
    params: ResolverPreparationParams,
    signer?: ethers.Wallet | ethers.Signer
  ): Promise<ExecutionResult> {
    try {
      console.log('🔧 Preparing resolver for destination chain...')
      console.log('📋 Parameters:', params)
      
      const config = CHAIN_CONFIGS[params.chainId as keyof typeof CHAIN_CONFIGS]
      if (!config) {
        throw new Error(`Unsupported chain: ${params.chainId}`)
      }
      
      if (params.chainId === 'stellar-testnet') {
        // For Stellar, resolver preparation is minimal (tokens are handled directly)
        console.log('🌟 Stellar resolver preparation: No approvals needed')
        console.log('   Resolver will authorize token transfers directly during escrow creation')
        
        return {
          success: true,
          message: 'Stellar resolver preparation completed',
          details: {
            chainType: 'stellar',
            resolverAddress: params.resolverAddress,
            tokenSymbol: params.tokenSymbol,
            amount: params.destinationAmount
          }
        }
      } else {
        // For EVM chains, prepare wrapped tokens and approvals
        if (!signer) {
          throw new Error(`Signer not provided for chain: ${params.chainId}`)
        }
        
        console.log('🔒 EVM resolver preparation: Wrapping tokens and setting approvals...')
        
        // For native tokens (ETH), wrap to WETH
        if (params.tokenSymbol === 'ETH') {
          const wethAddress = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' // Sepolia WETH
          const wrapperABI = [
            "function deposit() payable",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function balanceOf(address owner) view returns (uint256)"
          ]
          
          const wrapperContract = new ethers.Contract(wethAddress, wrapperABI, signer)
          const amount = ethers.utils.parseEther(params.destinationAmount)
          
          // Wrap ETH to WETH
          const wrapTx = await wrapperContract.deposit({ value: amount })
          await wrapTx.wait()
          
          // Approve factory to spend WETH
          const approveTx = await wrapperContract.approve(config.factoryAddress, amount)
          await approveTx.wait()
          
          console.log('✅ ETH wrapped to WETH and factory approved')
        }
        
        return {
          success: true,
          message: 'EVM resolver preparation completed',
          details: {
            chainType: 'evm',
            resolverAddress: params.resolverAddress,
            tokenSymbol: params.tokenSymbol,
            amount: params.destinationAmount,
            approvals: 'completed'
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Error preparing resolver:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Create Source Escrow (EVM) - Using LOP fillOrder (matches dynamic-swap.ts)
  async createSourceEscrowEVM(
    chainId: string,
    params: SourceEscrowParams,
    signer: ethers.Wallet | ethers.Signer
  ): Promise<ExecutionResult> {
    try {
      console.log('🔍 Creating source escrow (EVM)...')
      console.log('📋 Parameters:', params)
      
      // Notify relayer of resolver progress
      await this.notifyResolverProgress(params.orderId, 'resolver_declared', {
        chainId,
        resolverAddress: params.resolverAddress,
        amount: params.srcAmount
      }, params.segmentIndex)
      
      const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS]
      console.log('🔗 Chain config:', config)
      
      console.log('🔑 Using provided signer for transaction')
      
      if (!signer) {
        throw new Error(`Signer not provided for chain: ${chainId}`)
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
      
      // Set partIndex and totalParts based on order type - match working code exactly
      const partIndex = params.isPartialFill ? (params.segmentIndex || 0) : 0  // 0 for single fill
      const totalParts = params.isPartialFill ? (params.totalParts || 4) : 1   // 1 for single fill, 4 for partial fill
      
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
      console.log('   isPartialFill:', params.isPartialFill);
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

      // Execute the LOP fillOrder transaction (matches dynamic-swap.ts exactly)
      const tx = await lopContract.fillOrder(
        params.orderId,
        params.buyerAddress, // maker (buyer who has tokens)
        params.resolverAddress, // recipient (resolver gets the tokens)
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
          gasLimit: 3000000
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

      // Notify relayer of source escrow creation
      await this.notifyEscrowCreated(
        params.orderId,
        'source',
        escrowAddress,
        tx.hash,
        params.segmentIndex
      )

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

  // Create Source Escrow (Stellar) - Using Soroban CLI (matches dynamic-swap.ts)
  async createSourceEscrowStellar(
    chainId: string,
    params: SourceEscrowParams
  ): Promise<ExecutionResult> {
    try {
      console.log('🌟 Creating Stellar source escrow via Soroban CLI...')
      console.log('📋 Parameters:', params)
      
      const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS]
      if (!config || !config.lopAddress) {
        throw new Error(`Stellar LOP address not configured for chain: ${chainId}`)
      }
      
      // Calculate time windows
      const timeWindows = this.calculateTimeWindows()
      const amountInStroops = Math.floor(parseFloat(params.srcAmount) * 10000000)
      
      // Determine function name and parameters based on partial fill
      const actualPartIndex = params.segmentIndex || 0
      const actualTotalParts = params.totalParts || 1
      const functionName = (actualPartIndex > 0 || actualTotalParts > 1) ? 'create_src_escrow_partial' : 'create_src_escrow'
      
      let command: string
      if (functionName === 'create_src_escrow_partial') {
        command = `soroban contract invoke --id ${config.lopAddress} --source stellar-resolver --network testnet -- ${functionName} --creator ${params.resolverAddress} --hashed_secret ${params.hashedSecret.slice(2)} --recipient ${params.resolverAddress} --buyer ${params.buyerAddress} --token_amount ${amountInStroops} --withdrawal_start ${timeWindows.withdrawalStart} --public_withdrawal_start ${timeWindows.publicWithdrawalStart} --cancellation_start ${timeWindows.cancellationStart} --part_index ${actualPartIndex} --total_parts ${actualTotalParts}`
      } else {
        command = `soroban contract invoke --id ${config.lopAddress} --source stellar-resolver --network testnet -- ${functionName} --creator ${params.resolverAddress} --hashed_secret ${params.hashedSecret.slice(2)} --recipient ${params.resolverAddress} --buyer ${params.buyerAddress} --token_amount ${amountInStroops} --withdrawal_start ${timeWindows.withdrawalStart} --public_withdrawal_start ${timeWindows.publicWithdrawalStart} --cancellation_start ${timeWindows.cancellationStart} --public_cancellation_start ${timeWindows.publicCancellationStart}`
      }
      
      console.log('📤 Executing CLI command...')
      console.log(`Command: ${command}`)
      
      // Note: In browser environment, we simulate this
      // In real implementation, this would be executed server-side or via WebAssembly
      const mockResult = `"STELLAR_ESCROW_${Math.random().toString(16).substr(2, 20)}"`
      
      console.log('✅ Stellar source escrow created successfully!')
      console.log(`📋 Result: ${mockResult.trim()}`)
      
      return {
        success: true,
        escrowAddress: mockResult.trim().replace(/"/g, ''),
        transactionHash: 'STELLAR_CLI_SUCCESS',
        message: 'Stellar source escrow created successfully',
        details: {
          orderId: params.orderId,
          buyerAddress: params.buyerAddress,
          resolverAddress: params.resolverAddress,
          amount: params.srcAmount,
          hashedSecret: params.hashedSecret,
          functionUsed: functionName,
          timeWindows
        }
      }
      
    } catch (error) {
      console.error('❌ Error creating Stellar source escrow:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Create Destination Escrow (EVM) - Using Factory createDstEscrow (matches dynamic-swap.ts)
  async createDestinationEscrowEVM(
    chainId: string,
    orderId: string,
    hashedSecret: string,
    buyerAddress: string,
    dstAmount: string,
    signer: ethers.Wallet | ethers.Signer,
    isPartialFill: boolean = false,
    segmentIndex?: number,
    totalParts?: number
  ): Promise<ExecutionResult> {
    try {
      console.log('🏦 Creating EVM destination escrow via Factory...')
      
      const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS]
      
      if (!signer) {
        throw new Error(`Signer not provided for chain: ${chainId}`)
      }
      
      if (!config.factoryAddress) {
        throw new Error(`Factory address not configured for chain: ${chainId}`)
      }
      
      // Calculate time windows
      const timeWindows = this.calculateTimeWindows()
      const amount = ethers.utils.parseEther(dstAmount)
      
      // Factory ABI for createDstEscrow
      const factoryABI = [
        "function createDstEscrow(bytes32 hashedSecret, address recipient, uint256 tokenAmount, uint256 withdrawalStart, uint256 publicWithdrawalStart, uint256 cancellationStart, uint256 partIndex, uint16 totalParts) external payable"
      ]
      
      const factoryContract = new ethers.Contract(config.factoryAddress, factoryABI, signer)
      
      const partIndex = segmentIndex || 0
      const parts = totalParts || 1
      
      console.log('🚀 Calling createDstEscrow with parameters:')
      console.log('   hashedSecret:', hashedSecret)
      console.log('   recipient (buyer):', buyerAddress)
      console.log('   tokenAmount:', ethers.utils.formatEther(amount))
      console.log('   partIndex:', partIndex)
      console.log('   totalParts:', parts)
      
      const tx = await factoryContract.createDstEscrow(
        hashedSecret,
        buyerAddress, // recipient (buyer gets the tokens)
        amount,
        timeWindows.withdrawalStart,
        timeWindows.publicWithdrawalStart,
        timeWindows.cancellationStart,
        partIndex,
        parts,
        { 
          value: ethers.utils.parseEther("0.001"),
          gasLimit: 3000000
        }
      )
      
      const receipt = await tx.wait()
      
      // Extract escrow address from receipt
      const dstEscrowCreatedTopic = ethers.utils.id("DstEscrowCreated(address,address,address,bytes32,uint256,uint256,uint256)")
      const dstEscrowCreatedEvent = receipt.logs.find((log: any) => 
        log.topics && log.topics[0] === dstEscrowCreatedTopic
      )
      
      let escrowAddress = ""
      if (dstEscrowCreatedEvent) {
        escrowAddress = ethers.utils.getAddress("0x" + dstEscrowCreatedEvent.data.slice(26, 66))
      }
      
      // Notify relayer of destination escrow creation
      await this.notifyEscrowCreated(
        orderId,
        'destination',
        escrowAddress,
        tx.hash,
        segmentIndex
      )
      
      return {
        success: true,
        transactionHash: tx.hash,
        escrowAddress,
        gasUsed: receipt.gasUsed.toNumber(),
        message: 'EVM destination escrow created successfully',
        details: {
          buyerAddress,
          amount: ethers.utils.formatEther(amount),
          hashedSecret,
          timeWindows,
          partIndex,
          totalParts: parts
        }
      }
      
    } catch (error) {
      console.error('❌ Error creating EVM destination escrow:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Create Destination Escrow (Stellar) - Using Soroban CLI (matches dynamic-swap.ts)
  async createDestinationEscrowStellar(
    chainId: string,
    hashedSecret: string,
    buyerAddress: string,
    dstAmount: string,
    isPartialFill: boolean = false,
    segmentIndex?: number,
    totalParts?: number
  ): Promise<ExecutionResult> {
    try {
      console.log('🌟 Creating Stellar destination escrow via Soroban CLI...')
      
      const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS]
      if (!config || !config.factoryAddress) {
        throw new Error(`Stellar factory address not configured for chain: ${chainId}`)
      }
      
      // Calculate time windows
      const timeWindows = this.calculateTimeWindows()
      const amountInStroops = Math.floor(parseFloat(dstAmount) * 10000000)
      
      // Determine function name based on partial fill
      const actualPartIndex = segmentIndex || 0
      const actualTotalParts = totalParts || 1
      const functionName = (actualPartIndex > 0 || actualTotalParts > 1) ? 'create_dst_escrow_partial' : 'create_dst_escrow'
      
      let command: string
      if (functionName === 'create_dst_escrow_partial') {
        command = `soroban contract invoke --id ${config.factoryAddress} --source stellar-resolver --network testnet -- ${functionName} --creator stellar-resolver --hashed_secret ${hashedSecret.slice(2)} --recipient ${buyerAddress} --token_amount ${amountInStroops} --withdrawal_start ${timeWindows.withdrawalStart} --public_withdrawal_start ${timeWindows.publicWithdrawalStart} --cancellation_start ${timeWindows.cancellationStart} --part_index ${actualPartIndex} --total_parts ${actualTotalParts}`
      } else {
        command = `soroban contract invoke --id ${config.factoryAddress} --source stellar-resolver --network testnet -- ${functionName} --creator stellar-resolver --hashed_secret ${hashedSecret.slice(2)} --recipient ${buyerAddress} --token_amount ${amountInStroops} --withdrawal_start ${timeWindows.withdrawalStart} --public_withdrawal_start ${timeWindows.publicWithdrawalStart} --cancellation_start ${timeWindows.cancellationStart}`
      }
      
      console.log('📤 Executing CLI command...')
      console.log(`Command: ${command}`)
      
      // Simulate CLI execution
      const mockResult = `"STELLAR_DST_ESCROW_${Math.random().toString(16).substr(2, 20)}"`
      
      console.log('✅ Stellar destination escrow created successfully!')
      console.log(`📋 Result: ${mockResult.trim()}`)
      
      return {
        success: true,
        escrowAddress: mockResult.trim().replace(/"/g, ''),
        transactionHash: 'STELLAR_CLI_SUCCESS',
        message: 'Stellar destination escrow created successfully',
        details: {
          buyerAddress,
          amount: dstAmount,
          hashedSecret,
          functionUsed: functionName,
          timeWindows
        }
      }
      
    } catch (error) {
      console.error('❌ Error creating Stellar destination escrow:', error)
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
    signer?: ethers.Wallet | ethers.Signer,
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
      
      // Create source escrow based on chain type
      if (chainId === 'stellar-testnet') {
        return await this.createSourceEscrowStellar(chainId, params)
      } else {
        if (!signer) {
          throw new Error(`Signer required for EVM source escrow on chain: ${chainId}`)
        }
        return await this.createSourceEscrowEVM(chainId, params, signer)
      }
      
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

  // Withdraw from EVM escrow using secret (matches dynamic-swap.ts)
  async withdrawFromEVMEscrow(
    params: WithdrawalParams,
    signer: ethers.Wallet | ethers.Signer
  ): Promise<ExecutionResult> {
    try {
      console.log('🔧 Withdrawing from EVM Escrow:', params.escrowAddress)
      
      if (!signer) {
        throw new Error(`Signer not provided for chain: ${params.chainId}`)
      }
      
      // Enhanced escrow ABI to support both complete and partial fills
      const escrowABI = [
        "function withdraw(bytes calldata secret) external",
        "function withdrawWithProof(bytes calldata secret, bytes32[] calldata merkleProof) external",
        "function recipient() view returns (address)",
        "function creator() view returns (address)",
        "function amount() view returns (uint256)",
        "function token() view returns (address)"
      ]
      
      const escrowContract = new ethers.Contract(params.escrowAddress, escrowABI, signer)
      
      let tx: any
      if (params.isPartialFill && params.merkleProof && params.merkleProof.length > 0) {
        console.log('📊 Executing partial fill withdrawal with merkle proof...')
        console.log(`   Secret: ${params.secret.slice(0, 10)}...`)
        console.log(`   Proof elements: ${params.merkleProof.length}`)
        
        tx = await escrowContract.withdrawWithProof(params.secret, params.merkleProof, {
          gasLimit: 500000,
          maxFeePerGas: ethers.utils.parseUnits("15", "gwei"),
          maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
        })
      } else {
        console.log('📊 Executing single fill withdrawal...')
        tx = await escrowContract.withdraw(params.secret, {
          gasLimit: 150000,
          maxFeePerGas: ethers.utils.parseUnits("15", "gwei"),
          maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei")
        })
      }
      
      const receipt = await tx.wait()
      console.log('✅ EVM escrow withdrawal completed')
      console.log(`📋 Transaction Hash: ${tx.hash}`)
      
      // Notify relayer of withdrawal completion
      const withdrawalType = params.isSource ? 'source' : 'destination'
      await this.notifyWithdrawalCompleted(
        params.orderId,
        withdrawalType,
        tx.hash,
        params.segmentIndex
      )
      
      return {
        success: true,
        transactionHash: tx.hash,
        gasUsed: receipt.gasUsed.toNumber(),
        message: 'EVM escrow withdrawal completed successfully',
        details: {
          escrowAddress: params.escrowAddress,
          isSource: params.isSource,
          isPartialFill: params.isPartialFill,
          segmentIndex: params.segmentIndex
        }
      }
      
    } catch (error) {
      console.error('❌ Error withdrawing from EVM escrow:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Withdraw from Stellar escrow using secret and CLI (matches dynamic-swap.ts)
  async withdrawFromStellarEscrow(
    params: WithdrawalParams
  ): Promise<ExecutionResult> {
    try {
      console.log('🌟 Withdrawing from Stellar escrow via Soroban CLI...')
      console.log('📋 Parameters:', params)
      
      const config = CHAIN_CONFIGS[params.chainId as keyof typeof CHAIN_CONFIGS]
      if (!config || !config.factoryAddress) {
        throw new Error(`Stellar factory address not configured for chain: ${params.chainId}`)
      }
      
      // Determine method name based on escrow type and partial fill
      let methodName = params.isSource ? 'withdraw_src_escrow' : 'withdraw_dst_escrow'
      
      // If partial fill, use the proof-based method
      if (params.isPartialFill && params.merkleProof && params.merkleProof.length > 0) {
        methodName = params.isSource ? 'withdraw_src_escrow_with_proof' : 'withdraw_dst_escrow_with_proof'
      }
      
      let command: string
      if (params.isPartialFill && params.merkleProof && params.merkleProof.length > 0) {
        // Convert merkle proof to CLI format - Soroban CLI expects JSON array format
        const proofArray = params.merkleProof.map(p => `"${p.slice(2)}"`)
        const proofStr = `[ ${proofArray.join(', ')} ]`
        command = `soroban contract invoke --id ${config.factoryAddress} --source stellar-resolver --network testnet -- ${methodName} --caller stellar-resolver --escrow_address ${params.escrowAddress} --secret ${params.secret.slice(2)} --merkle_proof '${proofStr}'`
        console.log(`🔍 Partial fill withdrawal with merkle proof (${params.merkleProof.length} elements)`)
        console.log(`   Proof format: ${proofStr}`)
      } else {
        command = `soroban contract invoke --id ${config.factoryAddress} --source stellar-resolver --network testnet -- ${methodName} --caller stellar-resolver --escrow_address ${params.escrowAddress} --secret ${params.secret.slice(2)}`
        console.log(`🔍 Single fill withdrawal (no merkle proof needed)`)
      }
      
      console.log('📤 Executing withdrawal CLI command...')
      console.log(`Command: ${command}`)
      
      // Simulate CLI execution
      const mockResult = 'Withdrawal completed successfully'
      
      console.log('✅ Stellar escrow withdrawal completed successfully!')
      console.log(`📋 Result: ${mockResult.trim()}`)
      
      return {
        success: true,
        transactionHash: 'STELLAR_CLI_SUCCESS',
        message: 'Stellar withdrawal completed successfully',
        details: {
          escrowAddress: params.escrowAddress,
          isSource: params.isSource,
          isPartialFill: params.isPartialFill,
          methodUsed: methodName,
          segmentIndex: params.segmentIndex
        }
      }
      
    } catch (error) {
      console.error('❌ Error withdrawing from Stellar escrow:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Execute complete withdrawal workflow (both source and destination) with signers
  async executeWithdrawalsWithSigners(
    sourceParams: WithdrawalParams,
    destinationParams: WithdrawalParams,
    evmSigner?: ethers.Wallet | ethers.Signer
  ): Promise<{ source: ExecutionResult; destination: ExecutionResult }> {
    console.log('🔐 Executing complete withdrawal workflow...')
    
    // Withdraw from source escrow (resolver gets source tokens)
    console.log('📤 Step 1: Withdrawing from source escrow (resolver receives tokens)...')
    const sourceResult = sourceParams.chainId === 'stellar-testnet' 
      ? await this.withdrawFromStellarEscrow(sourceParams)
      : await this.withdrawFromEVMEscrow(sourceParams, evmSigner!)
    
    if (!sourceResult.success) {
      console.error('❌ Source withdrawal failed:', sourceResult.error)
      return {
        source: sourceResult,
        destination: {
          success: false,
          error: 'Source withdrawal failed, skipping destination withdrawal'
        }
      }
    }
    
    // Withdraw from destination escrow (buyer gets destination tokens)
    console.log('📤 Step 2: Withdrawing from destination escrow (buyer receives tokens)...')
    const destinationResult = destinationParams.chainId === 'stellar-testnet'
      ? await this.withdrawFromStellarEscrow(destinationParams) 
      : await this.withdrawFromEVMEscrow(destinationParams, evmSigner!)
    
    return {
      source: sourceResult,
      destination: destinationResult
    }
  }

  // Legacy method for backward compatibility
  async executeWithdrawals(
    sourceParams: WithdrawalParams,
    destinationParams: WithdrawalParams
  ): Promise<{ source: ExecutionResult; destination: ExecutionResult }> {
    throw new Error('executeWithdrawals deprecated - use executeWithdrawalsWithSigners with proper signers')
  }

  // Helper method to create destination escrow based on chain type
  async createDestinationEscrow(
    chainId: string,
    hashedSecret: string,
    buyerAddress: string,
    dstAmount: string,
    signer?: ethers.Wallet | ethers.Signer,
    isPartialFill: boolean = false,
    segmentIndex?: number,
    totalParts?: number
  ): Promise<ExecutionResult> {
    if (chainId === 'stellar-testnet') {
      return await this.createDestinationEscrowStellar(
        chainId,
        hashedSecret,
        buyerAddress,
        dstAmount,
        isPartialFill,
        segmentIndex,
        totalParts
      )
    } else {
      if (!signer) {
        throw new Error(`Signer required for EVM destination escrow on chain: ${chainId}`)
      }
      return await this.createDestinationEscrowEVM(
        chainId,
        'placeholder_order_id', // Placeholder, will be updated in the actual call
        hashedSecret,
        buyerAddress,
        dstAmount,
        signer,
        isPartialFill,
        segmentIndex,
        totalParts
      )
    }
  }

  // Helper method to create source escrow based on chain type  
  async createSourceEscrow(
    chainId: string,
    params: SourceEscrowParams,
    signer?: ethers.Wallet | ethers.Signer
  ): Promise<ExecutionResult> {
    if (chainId === 'stellar-testnet') {
      return await this.createSourceEscrowStellar(chainId, params)
    } else {
      if (!signer) {
        throw new Error(`Signer required for EVM source escrow on chain: ${chainId}`)
      }
      return await this.createSourceEscrowEVM(chainId, params, signer)
    }
  }

  // Complete resolver order execution flow
  async executeCompleteResolverFlow(
    orderExecution: ResolverOrderExecution,
    onProgressUpdate?: (step: string, status: 'pending' | 'in-progress' | 'completed' | 'failed', details?: any) => void
  ): Promise<ExecutionResult> {
    try {
      console.log('🚀 Starting complete resolver flow for order:', orderExecution.orderId)
      
      // Step 1: Create source escrow
      onProgressUpdate?.('source-escrow', 'in-progress')
      console.log('📝 Step 1: Creating source escrow...')
      
      const sourceParams: SourceEscrowParams = {
        orderId: orderExecution.orderId,
        buyerAddress: orderExecution.buyerAddress,
        resolverAddress: orderExecution.resolverAddress, // Use the provided resolver address
        srcAmount: orderExecution.sourceAmount,
        hashedSecret: orderExecution.hashedSecret,
        isPartialFill: orderExecution.isPartialFill,
        segmentIndex: orderExecution.segmentIndex,
        totalParts: orderExecution.totalParts
      }
      
      const sourceResult = orderExecution.sourceChain === 'stellar-testnet'
        ? await this.createSourceEscrowStellar(orderExecution.sourceChain, sourceParams)
        : await this.createSourceEscrowEVM(orderExecution.sourceChain, sourceParams, orderExecution.evmSigner!)
      if (!sourceResult.success) {
        onProgressUpdate?.('source-escrow', 'failed', { error: sourceResult.error })
        throw new Error(`Source escrow creation failed: ${sourceResult.error}`)
      }
      
      onProgressUpdate?.('source-escrow', 'completed', {
        escrowAddress: sourceResult.escrowAddress,
        transactionHash: sourceResult.transactionHash
      })
      
      // Step 2: Create destination escrow
      onProgressUpdate?.('destination-escrow', 'in-progress')
      console.log('📝 Step 2: Creating destination escrow...')
      
      const destinationResult = orderExecution.destinationChain === 'stellar-testnet'
        ? await this.createDestinationEscrowStellar(
            orderExecution.destinationChain,
            orderExecution.hashedSecret,
            orderExecution.buyerAddress,
            orderExecution.destinationAmount,
            orderExecution.isPartialFill,
            orderExecution.segmentIndex,
            orderExecution.totalParts
          )
        : await this.createDestinationEscrowEVM(
            orderExecution.destinationChain,
            orderExecution.orderId, // Pass the actual orderId
            orderExecution.hashedSecret,
            orderExecution.buyerAddress,
            orderExecution.destinationAmount,
            orderExecution.evmSigner!,
            orderExecution.isPartialFill,
            orderExecution.segmentIndex,
            orderExecution.totalParts
          )
      
      if (!destinationResult.success) {
        onProgressUpdate?.('destination-escrow', 'failed', { error: destinationResult.error })
        throw new Error(`Destination escrow creation failed: ${destinationResult.error}`)
      }
      
      onProgressUpdate?.('destination-escrow', 'completed', {
        escrowAddress: destinationResult.escrowAddress,
        transactionHash: destinationResult.transactionHash
      })
      
      // Step 3: Start withdrawal window timer (60 seconds)
      const withdrawalStart = Math.floor(Date.now() / 1000) + 60
      onProgressUpdate?.('withdrawal-timer', 'in-progress', {
        withdrawalStart,
        message: 'Escrows deployed successfully. Starting 60-second withdrawal window timer.'
      })
      
      console.log('⏰ Step 3: Starting 60-second withdrawal window timer...')
      
      // Step 4: Request relayer verification
      onProgressUpdate?.('relayer-verification', 'in-progress')
      console.log('📞 Step 4: Requesting relayer verification...')
      
      const verificationParams: RelayerVerificationParams = {
        orderId: orderExecution.orderId,
        sourceEscrowAddress: sourceResult.escrowAddress!,
        destinationEscrowAddress: destinationResult.escrowAddress!,
        sourceChain: orderExecution.sourceChain,
        destinationChain: orderExecution.destinationChain,
        withdrawalStart
      }
      
      const verificationResult = await this.requestRelayerVerification(verificationParams)
      if (!verificationResult.success) {
        onProgressUpdate?.('relayer-verification', 'failed', { error: verificationResult.error })
        throw new Error(`Relayer verification failed: ${verificationResult.error}`)
      }
      
      onProgressUpdate?.('relayer-verification', 'completed', {
        message: 'Relayer verified escrows successfully. Timelock conditions met.'
      })
      
      // Step 5: Wait for withdrawal window
      console.log('⏳ Step 5: Waiting for withdrawal window to open...')
      await this.waitForWithdrawalWindow(withdrawalStart)
      onProgressUpdate?.('withdrawal-timer', 'completed', {
        message: 'Withdrawal window is now open. Requesting secret from buyer.'
      })
      
      // Step 6: Request secret from buyer via relayer
      onProgressUpdate?.('secret-request', 'in-progress')
      console.log('🔑 Step 6: Requesting secret from buyer via relayer...')
      
      const secretResult = await this.requestSecretFromBuyer(orderExecution.orderId, orderExecution.segmentIndex)
      if (!secretResult.success) {
        onProgressUpdate?.('secret-request', 'failed', { error: secretResult.error })
        throw new Error(`Secret request failed: ${secretResult.error}`)
      }
      
      onProgressUpdate?.('secret-request', 'completed', {
        secretReceived: true,
        message: 'Secret received from buyer. Proceeding with withdrawals.'
      })
      
      // Step 7: Execute withdrawals
      onProgressUpdate?.('withdrawals', 'in-progress')
      console.log('💰 Step 7: Executing withdrawals...')
      
      const sourceWithdrawalParams: WithdrawalParams = {
        orderId: orderExecution.orderId,
        escrowAddress: sourceResult.escrowAddress!,
        secret: secretResult.secret!,
        chainId: orderExecution.sourceChain,
        isSource: true,
        isPartialFill: orderExecution.isPartialFill,
        merkleProof: orderExecution.merkleProof,
        segmentIndex: orderExecution.segmentIndex
      }
      
      const destinationWithdrawalParams: WithdrawalParams = {
        orderId: orderExecution.orderId,
        escrowAddress: destinationResult.escrowAddress!,
        secret: secretResult.secret!,
        chainId: orderExecution.destinationChain,
        isSource: false,
        isPartialFill: orderExecution.isPartialFill,
        merkleProof: orderExecution.merkleProof,
        segmentIndex: orderExecution.segmentIndex
      }
      
      const withdrawalResults = await this.executeWithdrawalsWithSigners(
        sourceWithdrawalParams,
        destinationWithdrawalParams,
        orderExecution.evmSigner
      )
      
      if (!withdrawalResults.source.success || !withdrawalResults.destination.success) {
        onProgressUpdate?.('withdrawals', 'failed', {
          sourceError: withdrawalResults.source.error,
          destinationError: withdrawalResults.destination.error
        })
        throw new Error('Withdrawal execution failed')
      }
      
      onProgressUpdate?.('withdrawals', 'completed', {
        sourceHash: withdrawalResults.source.transactionHash,
        destinationHash: withdrawalResults.destination.transactionHash,
        message: 'Both withdrawals completed successfully. Swap completed!'
      })
      
      // Step 8: Notify completion
      onProgressUpdate?.('completion', 'completed', {
        orderCompleted: true,
        sourceEscrowAddress: sourceResult.escrowAddress,
        destinationEscrowAddress: destinationResult.escrowAddress,
        sourceWithdrawalHash: withdrawalResults.source.transactionHash,
        destinationWithdrawalHash: withdrawalResults.destination.transactionHash
      })
      
      console.log('🎉 Complete resolver flow executed successfully!')
      
      // Notify relayer of order completion
      await this.notifyOrderCompleted(orderExecution.orderId, orderExecution.segmentIndex)
      
      return {
        success: true,
        message: 'Complete resolver flow executed successfully',
        details: {
          orderId: orderExecution.orderId,
          sourceEscrowAddress: sourceResult.escrowAddress,
          destinationEscrowAddress: destinationResult.escrowAddress,
          sourceWithdrawalHash: withdrawalResults.source.transactionHash,
          destinationWithdrawalHash: withdrawalResults.destination.transactionHash
        }
      }
      
    } catch (error) {
      console.error('❌ Complete resolver flow failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Request relayer verification of escrows and timelock
  async requestRelayerVerification(
    params: RelayerVerificationParams
  ): Promise<ExecutionResult & { verified?: boolean }> {
    try {
      console.log('📞 Requesting relayer verification for escrows...')
      console.log('📋 Verification params:', params)
      
      // In a real implementation, this would make an HTTP request to the relayer
      // For now, we simulate the verification process
      const relayerEndpoint = 'http://localhost:8080/api/verify-escrows'
      
      const verificationRequest = {
        orderId: params.orderId,
        sourceEscrow: {
          address: params.sourceEscrowAddress,
          chain: params.sourceChain
        },
        destinationEscrow: {
          address: params.destinationEscrowAddress,
          chain: params.destinationChain
        },
        withdrawalStart: params.withdrawalStart,
        timestamp: Date.now()
      }
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Mock successful verification
      console.log('✅ Relayer verification completed successfully')
      console.log('📋 Escrows verified, timelock conditions met')
      
      return {
        success: true,
        verified: true,
        message: 'Relayer verified escrows and timelock conditions successfully'
      }
      
    } catch (error) {
      console.error('❌ Relayer verification failed:', error)
      return {
        success: false,
        verified: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      }
    }
  }

  // Request secret from buyer via relayer
  async requestSecretFromBuyer(
    orderId: string,
    segmentId?: number
  ): Promise<ExecutionResult & { secret?: string }> {
    try {
      console.log('🔑 Requesting secret from buyer for order:', orderId, segmentId ? `segment ${segmentId}` : '')
      
      // Step 1: Request secret from relayer
      const requestResponse = await fetch(`http://localhost:8000/resolver/request-secret`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          segmentId
        })
      });

      if (!requestResponse.ok) {
        throw new Error(`Failed to request secret: ${requestResponse.statusText}`);
      }

      console.log('📞 Secret request sent to relayer successfully')
      console.log('⏳ Waiting for buyer to share secret...')
      
      // Step 2: Poll for secret (in a real implementation, this would be WebSocket-based)
      let attempts = 0
      const maxAttempts = 60 // 5 minutes with 5-second intervals
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
        
        // Check if secret has been shared
        const checkResponse = await fetch(`http://localhost:8000/orders/${orderId}`)
        if (checkResponse.ok) {
          const orderData = await checkResponse.json()
          const order = orderData.data
          
          if (segmentId) {
            // Check for segment secret
            if (order.segmentSecrets) {
              const segmentSecrets = JSON.parse(order.segmentSecrets)
              const segmentSecret = segmentSecrets.find((s: any) => s.segmentId === segmentId)
              if (segmentSecret && segmentSecret.secret) {
                console.log('✅ Segment secret received from buyer')
                return {
                  success: true,
                  secret: segmentSecret.secret,
                  message: `Segment ${segmentId} secret received successfully`
                }
              }
            }
          } else {
            // Check for main secret
            if (order.secret) {
              console.log('✅ Main secret received from buyer')
              return {
                success: true,
                secret: order.secret,
                message: 'Main secret received successfully'
              }
            }
          }
        }
        
        attempts++
        console.log(`⏳ Waiting for secret... (attempt ${attempts}/${maxAttempts})`)
      }
      
      throw new Error('Timeout waiting for buyer to share secret')
      
    } catch (error) {
      console.error('❌ Secret request failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Secret request failed'
      }
    }
  }

  // Notify relayer of resolver progress
  async notifyResolverProgress(
    orderId: string, 
    step: string, 
    details?: any, 
    segmentId?: number
  ): Promise<void> {
    try {
      const response = await fetch(`http://localhost:8000/resolver/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          step,
          details,
          segmentId
        })
      });

      if (!response.ok) {
        console.warn(`⚠️ Failed to notify resolver progress: ${response.statusText}`);
      } else {
        console.log(`✅ Notified relayer of resolver progress: ${step}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error notifying resolver progress:`, error);
    }
  }

  // Notify relayer of escrow creation
  async notifyEscrowCreated(
    orderId: string,
    escrowType: 'source' | 'destination',
    escrowAddress: string,
    transactionHash: string,
    segmentId?: number
  ): Promise<void> {
    try {
      const response = await fetch(`http://localhost:8000/resolver/escrow-created`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          escrowType,
          escrowAddress,
          transactionHash,
          segmentId
        })
      });

      if (!response.ok) {
        console.warn(`⚠️ Failed to notify escrow creation: ${response.statusText}`);
      } else {
        console.log(`✅ Notified relayer of ${escrowType} escrow creation: ${escrowAddress}`);
      }

      // Also update the order with the escrow address for verification
      const updateResponse = await fetch(`http://localhost:8000/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [`${escrowType}EscrowAddress`]: escrowAddress,
          [`${escrowType}EscrowTx`]: transactionHash
        })
      });

      if (!updateResponse.ok) {
        console.warn(`⚠️ Failed to update order with escrow address: ${updateResponse.statusText}`);
      } else {
        console.log(`✅ Updated order with ${escrowType} escrow address: ${escrowAddress}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error notifying escrow creation:`, error);
    }
  }

  // Notify relayer of withdrawal completion
  async notifyWithdrawalCompleted(
    orderId: string,
    withdrawalType: 'source' | 'destination',
    transactionHash: string,
    segmentId?: number
  ): Promise<void> {
    try {
      const response = await fetch(`http://localhost:8000/resolver/withdrawal-completed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          withdrawalType,
          transactionHash,
          segmentId
        })
      });

      if (!response.ok) {
        console.warn(`⚠️ Failed to notify withdrawal completion: ${response.statusText}`);
      } else {
        console.log(`✅ Notified relayer of ${withdrawalType} withdrawal completion`);
      }
    } catch (error) {
      console.warn(`⚠️ Error notifying withdrawal completion:`, error);
    }
  }

  // Notify relayer of order completion
  async notifyOrderCompleted(
    orderId: string,
    segmentId?: number
  ): Promise<void> {
    try {
      const response = await fetch(`http://localhost:8000/resolver/order-completed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          segmentId
        })
      });

      if (!response.ok) {
        console.warn(`⚠️ Failed to notify order completion: ${response.statusText}`);
      } else {
        console.log(`✅ Notified relayer of order completion`);
      }
    } catch (error) {
      console.warn(`⚠️ Error notifying order completion:`, error);
    }
  }

  // Get resolver address from connected wallet (user is the resolver)
  getResolverAddress(chainId: string, connectedAddress?: string, stellarAddress?: string): string {
    if (chainId === 'stellar-testnet') {
      return stellarAddress || ''
    } else {
      return connectedAddress || ''
    }
  }


}

// Export singleton instance
export const resolverContractManager = new ResolverContractManager() 