import { Connection, clusterApiUrl, Transaction, SystemProgram, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { QN_SOLANA_RPC } from '../config'

// Use QuickNode proxy for Devnet RPC
export function getConnection() {
  return new Connection(QN_SOLANA_RPC, 'confirmed')
}

// Fallback public Devnet connection for read-only ops if QN fails
export function getFallbackConnection() {
  return new Connection(clusterApiUrl('devnet'), 'confirmed')
}

export async function rpcCall(method, params = []) {
  const res = await fetch(QN_SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message || 'RPC error')
  return json.result
}

export async function getSOLBalance(walletAddress) {
  try {
    const lamports = await rpcCall('getBalance', [walletAddress])
    return lamports / 1e9
  } catch {
    return 0
  }
}

export async function getLatestBlockhash() {
  const result = await rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }])
  return result?.value
}

export async function simulateTransaction(serializedTx) {
  const b64 = Buffer.from(serializedTx).toString('base64')
  const result = await rpcCall('simulateTransaction', [
    b64,
    { encoding: 'base64', commitment: 'confirmed' },
  ])
  return result?.value
}

export async function sendTransaction(signedTxBytes) {
  const b64 = Buffer.from(signedTxBytes).toString('base64')
  const sig = await rpcCall('sendTransaction', [
    b64,
    { encoding: 'base64', preflightCommitment: 'confirmed' },
  ])
  return sig
}

export async function confirmTransaction(signature, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await rpcCall('getSignatureStatuses', [[signature], { searchTransactionHistory: false }])
    const status = result?.value?.[0]
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return status
    }
    if (status?.err) throw new Error('Transaction failed: ' + JSON.stringify(status.err))
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Transaction confirmation timeout')
}

// Build a Devnet memo transaction encoding the strategy hash
export async function buildStrategyReceiptTx(walletAddress, strategyHash) {
  const blockhash = await getLatestBlockhash()
  if (!blockhash) throw new Error('Failed to fetch blockhash')

  const feePayer = new PublicKey(walletAddress)

  // Memo program instruction to store hash on-chain
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
  const memoInstruction = new TransactionInstruction({
    keys: [{ pubkey: feePayer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(`sinergy:${strategyHash}`, 'utf-8'),
  })

  const tx = new Transaction()
  tx.recentBlockhash = blockhash.blockhash
  tx.feePayer = feePayer
  tx.add(memoInstruction)

  return tx
}
