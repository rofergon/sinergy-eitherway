/**
 * Supabase strategies service.
 * Maps between the DB schema and the UI receipt format used throughout the app.
 *
 * DB columns:
 *   wallet_address, prompt, parsed_rules (jsonb), tokens (jsonb),
 *   risk_level, strategy_hash, tx_signature, tx_status, network, created_at
 *
 * UI receipt shape:
 *   { id, prompt, parsedRules, risk, hash, txSignature, walletAddress, createdAt }
 */

import { supabase } from './supabase'

// ----- converters -----

/** DB row → UI receipt */
export function rowToReceipt(row) {
  const parsedRules = row.parsed_rules || {}
  return {
    id: row.id,
    prompt: row.prompt,
    parsedRules: {
      ...parsedRules,
      tokens: row.tokens || parsedRules.tokens || [],
      riskLevel: row.risk_level || parsedRules.riskLevel || 'medium',
    },
    risk: {
      score: parsedRules.riskScore ?? null,
      checks: parsedRules.riskChecks || [],
    },
    hash: row.strategy_hash || '',
    txSignature: row.tx_signature || null,
    walletAddress: row.wallet_address || null,
    txStatus: row.tx_status || 'pending',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    source: 'supabase',
  }
}

/** UI data → DB insert payload */
function toInsertPayload(walletAddress, prompt, parsed, risk, hash, txSignature) {
  return {
    wallet_address: walletAddress || 'anonymous',
    prompt,
    parsed_rules: {
      ...parsed,
      riskScore: risk?.score ?? null,
      riskChecks: risk?.checks ?? [],
    },
    tokens: parsed.tokens || [],
    risk_level: parsed.riskLevel || 'medium',
    strategy_hash: hash || '',
    tx_signature: txSignature || null,
    tx_status: txSignature ? 'confirmed' : 'pending',
    network: 'devnet',
  }
}

// ----- CRUD -----

/**
 * Save a strategy to Supabase.
 * Returns the saved row converted to a receipt, or null on failure.
 */
export async function saveStrategy(walletAddress, prompt, parsed, risk, hash, txSignature = null) {
  const payload = toInsertPayload(walletAddress, prompt, parsed, risk, hash, txSignature)
  const { data, error } = await supabase
    .from('strategies')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.warn('[strategies] insert failed:', error.message)
    return null
  }
  return rowToReceipt(data)
}

/**
 * Update tx_signature and tx_status for an existing strategy row.
 * Returns true on success.
 */
export async function updateStrategyTx(id, txSignature) {
  const { error } = await supabase
    .from('strategies')
    .update({ tx_signature: txSignature, tx_status: 'confirmed' })
    .eq('id', id)

  if (error) {
    console.warn('[strategies] update tx failed:', error.message)
    return false
  }
  return true
}

/**
 * Load all strategies, newest first.
 * Optionally filter by walletAddress.
 */
export async function loadStrategies(walletAddress = null) {
  let query = supabase
    .from('strategies')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (walletAddress) {
    query = query.eq('wallet_address', walletAddress)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[strategies] load failed:', error.message)
    return null
  }
  return data.map(rowToReceipt)
}

/**
 * Delete a strategy by id.
 */
export async function deleteStrategy(id) {
  const { error } = await supabase
    .from('strategies')
    .delete()
    .eq('id', id)

  if (error) {
    console.warn('[strategies] delete failed:', error.message)
    return false
  }
  return true
}

/**
 * Delete all strategies for a wallet address (or all if null).
 */
export async function clearStrategies(walletAddress = null) {
  let query = supabase.from('strategies').delete()
  if (walletAddress) {
    query = query.eq('wallet_address', walletAddress)
  } else {
    // delete everything — use neq on a field that always matches
    query = query.neq('id', '00000000-0000-0000-0000-000000000000')
  }
  const { error } = await query
  if (error) {
    console.warn('[strategies] clear failed:', error.message)
    return false
  }
  return true
}
