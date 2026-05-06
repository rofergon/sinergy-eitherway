import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { getSOLBalance } from './rpc'

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [wallet, setWallet] = useState(null)
  const [address, setAddress] = useState(null)
  const [balance, setBalance] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [network] = useState('devnet')

  // Detect Solflare
  const getSolflare = () => {
    if (typeof window === 'undefined') return null
    // Solflare extension injects window.solflare
    if (window.solflare?.isSolflare) return window.solflare
    return null
  }

  const refreshBalance = useCallback(async (addr) => {
    if (!addr) return
    try {
      const bal = await getSOLBalance(addr)
      setBalance(bal)
    } catch {
      setBalance(null)
    }
  }, [])

  // Re-connect if previously connected
  useEffect(() => {
    const sf = getSolflare()
    if (!sf) return
    if (sf.isConnected && sf.publicKey) {
      const addr = sf.publicKey.toString()
      setWallet(sf)
      setAddress(addr)
      refreshBalance(addr)
    }
    // Listen for account changes
    const handleAccountChange = () => {
      if (sf.publicKey) {
        const addr = sf.publicKey.toString()
        setAddress(addr)
        refreshBalance(addr)
      } else {
        setAddress(null)
        setBalance(null)
      }
    }
    const handleDisconnect = () => {
      setAddress(null)
      setBalance(null)
      setWallet(null)
    }
    sf.on?.('accountChanged', handleAccountChange)
    sf.on?.('disconnect', handleDisconnect)
    return () => {
      sf.off?.('accountChanged', handleAccountChange)
      sf.off?.('disconnect', handleDisconnect)
    }
  }, [refreshBalance])

  const connect = useCallback(async () => {
    setError(null)
    setConnecting(true)
    try {
      const sf = getSolflare()
      if (!sf) {
        throw new Error('Solflare wallet not found. Please install the Solflare extension or app.')
      }
      await sf.connect()
      if (!sf.publicKey) throw new Error('Connection failed — no public key returned.')
      const addr = sf.publicKey.toString()
      setWallet(sf)
      setAddress(addr)
      await refreshBalance(addr)
    } catch (err) {
      setError(err.message || 'Failed to connect wallet')
      throw err
    } finally {
      setConnecting(false)
    }
  }, [refreshBalance])

  const disconnect = useCallback(async () => {
    try {
      const sf = getSolflare()
      await sf?.disconnect()
    } catch {}
    setWallet(null)
    setAddress(null)
    setBalance(null)
  }, [])

  const signAndSendTransaction = useCallback(async (transaction) => {
    const sf = getSolflare()
    if (!sf || !sf.isConnected) throw new Error('Wallet not connected')

    // Sign using Solflare
    const signed = await sf.signTransaction(transaction)
    const serializedSigned = signed.serialize()

    // Send via our RPC
    const { sendTransaction: sendRpc } = await import('./rpc')
    const signature = await sendRpc(serializedSigned)
    return signature
  }, [])

  return (
    <WalletContext.Provider
      value={{
        wallet,
        address,
        balance,
        connecting,
        error,
        network,
        connected: !!address,
        connect,
        disconnect,
        signAndSendTransaction,
        refreshBalance: () => refreshBalance(address),
        hasSolflare: !!getSolflare(),
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}
