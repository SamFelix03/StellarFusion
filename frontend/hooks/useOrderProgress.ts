import { useState, useEffect, useCallback } from 'react'
import { createAuctionClient } from '@/lib/auction-client'
import { OrderProgress, OrderSegment } from '@/components/OrderProgressModal'

export function useOrderProgress(orderId: string | null) {
  const [orderProgress, setOrderProgress] = useState<OrderProgress | null>(null)
  const [auctionClient, setAuctionClient] = useState<any>(null)

  // Initialize auction client
  useEffect(() => {
    if (!orderId) return

    const client = createAuctionClient('order-progress-client')
    setAuctionClient(client)

    // Connect to WebSocket
    client.connect()

    return () => {
      client.disconnect()
    }
  }, [orderId])

  // Handle resolver progress events
  const handleResolverProgress = useCallback((progressOrderId: string, step: string, details: any, segmentId?: number) => {
    if (progressOrderId !== orderId) return

    setOrderProgress(prev => {
      if (!prev) return prev

      const updated = { ...prev, status: step as any, updatedAt: Date.now() }

      // Update specific fields based on step
      switch (step) {
        case 'resolver_declared':
          updated.resolverAddress = details?.resolverAddress
          break
        case 'source_escrow_created':
          updated.sourceEscrowAddress = details?.escrowAddress
          break
        case 'destination_escrow_created':
          updated.destinationEscrowAddress = details?.escrowAddress
          break
        case 'source_withdrawal_completed':
          updated.sourceWithdrawalTx = details?.transactionHash
          break
        case 'destination_withdrawal_completed':
          updated.destinationWithdrawalTx = details?.transactionHash
          break
        case 'secret_requested':
        case 'segment_secret_requested':
          // Update segment status for partial fills
          if (segmentId && updated.segments) {
            const segmentIndex = updated.segments.findIndex(s => s.id === segmentId)
            if (segmentIndex !== -1) {
              updated.segments[segmentIndex] = {
                ...updated.segments[segmentIndex],
                status: 'segment_secret_requested'
              }
            }
          }
          break
        case 'segment_secret_received':
          // Update segment status when secret is received
          if (segmentId && updated.segments) {
            const segmentIndex = updated.segments.findIndex(s => s.id === segmentId)
            if (segmentIndex !== -1) {
              updated.segments[segmentIndex] = {
                ...updated.segments[segmentIndex],
                status: 'segment_secret_received'
              }
            }
          }
          break
      }

      return updated
    })
  }, [orderId])

  // Handle escrow creation events
  const handleEscrowCreated = useCallback((progressOrderId: string, escrowType: string, escrowAddress: string, transactionHash: string, segmentId?: number) => {
    if (progressOrderId !== orderId) return

    setOrderProgress(prev => {
      if (!prev) return prev

      const updated = { ...prev, updatedAt: Date.now() }

      if (escrowType === 'source') {
        updated.sourceEscrowAddress = escrowAddress
        updated.status = 'source_escrow_created'
      } else if (escrowType === 'destination') {
        updated.destinationEscrowAddress = escrowAddress
        updated.status = 'destination_escrow_created'
      }

      return updated
    })
  }, [orderId])

  // Handle withdrawal completion events
  const handleWithdrawalCompleted = useCallback((progressOrderId: string, withdrawalType: string, transactionHash: string, segmentId?: number) => {
    if (progressOrderId !== orderId) return

    setOrderProgress(prev => {
      if (!prev) return prev

      const updated = { ...prev, updatedAt: Date.now() }

      if (withdrawalType === 'source') {
        updated.sourceWithdrawalTx = transactionHash
        updated.status = 'source_withdrawal_completed'
      } else if (withdrawalType === 'destination') {
        updated.destinationWithdrawalTx = transactionHash
        updated.status = 'destination_withdrawal_completed'
      }

      return updated
    })
  }, [orderId])

  // Handle order completion events
  const handleOrderCompleted = useCallback((progressOrderId: string, segmentId?: number) => {
    if (progressOrderId !== orderId) return

    setOrderProgress(prev => {
      if (!prev) return prev

      const updated = { ...prev, updatedAt: Date.now() }

      if (segmentId) {
        // Update specific segment
        if (updated.segments) {
          const segmentIndex = updated.segments.findIndex(s => s.id === segmentId)
          if (segmentIndex !== -1) {
            updated.segments[segmentIndex] = {
              ...updated.segments[segmentIndex],
              status: 'segment_withdrawal_completed'
            }
          }
        }
      } else {
        // Update main order
        updated.status = 'order_completed'
      }

      return updated
    })
  }, [orderId])

  // Handle completion step with final order details
  const handleCompletionStep = useCallback((progressOrderId: string, details: any) => {
    if (progressOrderId !== orderId) return

    setOrderProgress(prev => {
      if (!prev) return prev

      const updated: OrderProgress = { 
        ...prev, 
        updatedAt: Date.now(),
        status: 'order_completed',
        orderCompleted: details?.orderCompleted,
        sourceWithdrawalHash: details?.sourceWithdrawalHash,
        destinationWithdrawalHash: details?.destinationWithdrawalHash,
        completionMessage: details?.message
      }

      return updated
    })
  }, [orderId])

  // Set up event listeners
  useEffect(() => {
    if (!auctionClient) return

    auctionClient.onResolverProgress(handleResolverProgress)
    auctionClient.onEscrowCreated(handleEscrowCreated)
    auctionClient.onWithdrawalCompleted(handleWithdrawalCompleted)
    auctionClient.onOrderCompleted(handleOrderCompleted)
    auctionClient.onCompletionStep(handleCompletionStep)

    return () => {
      // Cleanup would be handled by the client disconnect
    }
  }, [auctionClient, handleResolverProgress, handleEscrowCreated, handleWithdrawalCompleted, handleOrderCompleted, handleCompletionStep])

  return {
    orderProgress,
    setOrderProgress
  }
} 