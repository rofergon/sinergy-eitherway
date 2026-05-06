import React, { useState, useEffect, useCallback } from 'react'
import { shortHash, formatTimestamp } from '../lib/hash'
import { loadStrategies, deleteStrategy, clearStrategies } from '../lib/strategies'

const SEVERITY_COLORS = {
  ok: { text: 'text-sinergy-green', icon: '✓' },
  warning: { text: 'text-sinergy-amber', icon: '⚠' },
  critical: { text: 'text-sinergy-red', icon: '✗' },
}

export default function Receipts() {
  const [receipts, setReceipts] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [filter, setFilter] = useState('all') // all | onchain | local
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleteInProgress, setDeleteInProgress] = useState(null)

  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const remoteRows = await loadStrategies()
      if (remoteRows !== null) {
        // Merge with localStorage-only entries not yet in Supabase
        const lsRaw = JSON.parse(localStorage.getItem('sinergy_receipts') || '[]')
        const remoteHashes = new Set(remoteRows.map((r) => r.hash))
        const lsOnly = lsRaw
          .filter((r) => r.hash && !remoteHashes.has(r.hash))
          .map((r) => ({ ...r, source: 'local' }))
        setReceipts([...remoteRows, ...lsOnly])
      } else {
        const lsRaw = JSON.parse(localStorage.getItem('sinergy_receipts') || '[]')
        setReceipts(lsRaw.map((r) => ({ ...r, source: 'local' })))
        setError('Could not reach cloud — showing local receipts only.')
      }
    } catch {
      const lsRaw = JSON.parse(localStorage.getItem('sinergy_receipts') || '[]')
      setReceipts(lsRaw.map((r) => ({ ...r, source: 'local' })))
      setError('Could not reach cloud — showing local receipts only.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReceipts() }, [fetchReceipts])

  const filtered = receipts.filter((r) => {
    if (filter === 'onchain') return !!r.txSignature
    if (filter === 'local') return !r.txSignature
    return true
  })

  const deleteReceipt = async (id, source, hash) => {
    setDeleteInProgress(id)
    try {
      if (source === 'supabase') await deleteStrategy(id)
      const lsRaw = JSON.parse(localStorage.getItem('sinergy_receipts') || '[]')
      localStorage.setItem('sinergy_receipts', JSON.stringify(lsRaw.filter((r) => r.hash !== hash && r.id !== id)))
      setReceipts((prev) => prev.filter((r) => r.id !== id))
      if (expanded === id) setExpanded(null)
    } finally {
      setDeleteInProgress(null)
    }
  }

  const clearAll = async () => {
    if (!window.confirm('Clear all receipts from cloud and local storage?')) return
    setLoading(true)
    await clearStrategies(null)
    localStorage.removeItem('sinergy_receipts')
    setReceipts([])
    setExpanded(null)
    setLoading(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-sinergy-text">Strategy Receipts</h1>
          <p className="text-sinergy-muted text-xs mt-0.5">
            SHA-256 hashed strategy proofs — stored in cloud and optionally committed on-chain
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReceipts}
            disabled={loading}
            className="text-sinergy-muted hover:text-sinergy-text p-1.5 rounded-lg border border-sinergy-border transition-all disabled:opacity-40"
            title="Refresh from cloud"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
          {receipts.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-sinergy-red hover:text-sinergy-red/80 border border-sinergy-red/30 hover:border-sinergy-red/60 px-3 py-1.5 rounded-lg transition-all"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-sinergy-amber/10 border border-sinergy-amber/30 rounded-lg px-3 py-2 text-sinergy-amber text-xs">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: `All (${receipts.length})` },
          { key: 'onchain', label: `On-Chain (${receipts.filter((r) => r.txSignature).length})` },
          { key: 'local', label: `Draft (${receipts.filter((r) => !r.txSignature).length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === tab.key
                ? 'bg-sinergy-accent/20 text-sinergy-accent border border-sinergy-accent/30'
                : 'text-sinergy-muted border border-sinergy-border hover:text-sinergy-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sinergy-muted text-xs py-4">
          <span className="animate-spin w-3 h-3 border border-sinergy-accent border-t-transparent rounded-full" />
          Loading receipts from cloud...
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-sinergy-bg flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-sinergy-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <div className="text-sinergy-text font-semibold text-sm mb-1">No receipts yet</div>
          <div className="text-sinergy-muted text-xs">
            {filter === 'onchain'
              ? 'No on-chain receipts. Connect Solflare in Strategy Builder to commit hashes on-chain.'
              : 'Build a strategy and save it to see receipts here.'}
          </div>
        </div>
      )}

      {/* Receipt list */}
      {!loading && (
        <div className="space-y-3">
          {filtered.map((r) => {
            const isOpen = expanded === r.id
            const score = r.risk?.score
            const scoreColor = score == null ? 'text-sinergy-muted' : score >= 80 ? 'text-sinergy-green' : score >= 60 ? 'text-sinergy-amber' : 'text-sinergy-red'
            const isCloud = r.source === 'supabase'

            return (
              <div
                key={r.id}
                className="bg-sinergy-surface border border-sinergy-border rounded-xl overflow-hidden"
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-sinergy-bg/50 transition-all"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <div className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                        r.txSignature ? 'bg-sinergy-green/20 text-sinergy-green' : 'bg-sinergy-muted/20 text-sinergy-muted'
                      }`}>
                        {r.txSignature ? '⛓ ON-CHAIN' : '📋 DRAFT'}
                      </div>
                      {isCloud && (
                        <div className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-sinergy-cyan/10 text-sinergy-cyan border border-sinergy-cyan/20">
                          ☁ CLOUD
                        </div>
                      )}
                      {score != null && (
                        <span className={`text-[10px] font-mono ${scoreColor}`}>Risk {score}/100</span>
                      )}
                      <span className="text-[10px] text-sinergy-muted/60 ml-auto">{formatTimestamp(r.createdAt)}</span>
                    </div>
                    <div className="text-xs text-sinergy-text truncate max-w-full">{r.prompt}</div>
                    <div className="text-[10px] font-mono text-sinergy-muted/60 mt-0.5">{shortHash(r.hash)}</div>
                    {r.walletAddress && r.walletAddress !== 'anonymous' && (
                      <div className="text-[10px] font-mono text-sinergy-muted/40 mt-0.5">
                        {r.walletAddress.slice(0, 8)}...{r.walletAddress.slice(-8)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <svg
                      className={`w-4 h-4 text-sinergy-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>

                {/* Expanded */}
                {isOpen && (
                  <div className="border-t border-sinergy-border px-4 py-4 space-y-4">
                    {/* Hash */}
                    <div>
                      <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">SHA-256 Strategy Hash</div>
                      <div className="bg-sinergy-bg rounded-lg px-3 py-2 text-[10px] font-mono text-sinergy-green break-all">{r.hash}</div>
                    </div>

                    {/* TX */}
                    {r.txSignature && (
                      <div>
                        <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">Devnet Transaction Signature</div>
                        <div className="bg-sinergy-bg rounded-lg px-3 py-2 text-[10px] font-mono text-sinergy-cyan break-all">{r.txSignature}</div>
                        <a
                          href={`https://explorer.solana.com/tx/${r.txSignature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sinergy-accent text-[10px] hover:underline mt-1 inline-block"
                        >
                          View on Solana Explorer →
                        </a>
                      </div>
                    )}

                    {/* Parsed Rules */}
                    {r.parsedRules && (
                      <div>
                        <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-2">Parsed Rules</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {[
                            { l: 'Actions', v: r.parsedRules.actions?.join(', ') },
                            { l: 'Allocation', v: r.parsedRules.allocation != null ? `${r.parsedRules.allocation}%` : null },
                            { l: 'Stop Loss', v: r.parsedRules.stopLoss != null ? `${r.parsedRules.stopLoss}%` : null },
                            { l: 'Take Profit', v: r.parsedRules.takeProfit != null ? `${r.parsedRules.takeProfit}%` : null },
                            { l: 'Risk Level', v: r.parsedRules.riskLevel },
                            { l: 'Time Horizon', v: r.parsedRules.timeHorizon },
                          ].filter((item) => item.v).map((item) => (
                            <div key={item.l} className="bg-sinergy-bg rounded-lg p-2">
                              <div className="text-[9px] text-sinergy-muted uppercase tracking-wider mb-0.5">{item.l}</div>
                              <div className="text-xs font-mono text-sinergy-text">{item.v}</div>
                            </div>
                          ))}
                        </div>
                        {r.parsedRules.tokens?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {r.parsedRules.tokens.map((t) => (
                              <div key={t.address || t.symbol} className="flex items-center gap-1 bg-sinergy-accent/10 border border-sinergy-accent/20 rounded px-2 py-0.5">
                                {t.logo && <img src={t.logo} alt={t.symbol} className="w-3 h-3 rounded-full" onError={(e) => { e.target.style.display = 'none' }} />}
                                <span className="text-[10px] font-mono text-sinergy-accent">{t.symbol}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Risk Checks */}
                    {r.risk?.checks?.length > 0 && (
                      <div>
                        <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-2">Risk Assessment</div>
                        <div className="space-y-1.5">
                          {r.risk.checks.map((check) => {
                            const s = SEVERITY_COLORS[check.severity] || SEVERITY_COLORS.ok
                            return (
                              <div key={check.id} className="flex items-start gap-2 text-xs">
                                <span className={`${s.text} font-mono shrink-0`}>{s.icon}</span>
                                <div>
                                  <span className="text-sinergy-text font-medium">{check.label}: </span>
                                  <span className="text-sinergy-muted">{check.recommendation}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap pt-2 border-t border-sinergy-border">
                      <button
                        onClick={() => navigator.clipboard?.writeText(r.hash)}
                        className="text-xs text-sinergy-muted hover:text-sinergy-text border border-sinergy-border px-3 py-1.5 rounded-lg transition-all"
                      >
                        Copy Hash
                      </button>
                      {r.txSignature && (
                        <button
                          onClick={() => navigator.clipboard?.writeText(r.txSignature)}
                          className="text-xs text-sinergy-muted hover:text-sinergy-text border border-sinergy-border px-3 py-1.5 rounded-lg transition-all"
                        >
                          Copy TX
                        </button>
                      )}
                      <button
                        onClick={() => deleteReceipt(r.id, r.source, r.hash)}
                        disabled={deleteInProgress === r.id}
                        className="text-xs text-sinergy-red hover:text-sinergy-red/80 border border-sinergy-red/30 hover:border-sinergy-red/60 px-3 py-1.5 rounded-lg transition-all ml-auto disabled:opacity-40"
                      >
                        {deleteInProgress === r.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-sinergy-text mb-3">How On-Chain Receipts Work</h3>
        <div className="space-y-2 text-xs text-sinergy-muted">
          <div className="flex gap-2">
            <span className="text-sinergy-accent shrink-0">1.</span>
            <span>Your strategy prompt and parameters are hashed using SHA-256, producing a unique 64-character hex fingerprint.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-sinergy-accent shrink-0">2.</span>
            <span>Strategies are automatically saved to cloud storage, accessible across all your devices.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-sinergy-accent shrink-0">3.</span>
            <span>When you click "Commit On-Chain", the hash is encoded into a Solana Memo instruction and submitted via Solflare to Devnet.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-sinergy-accent shrink-0">4.</span>
            <span>The transaction creates an immutable, timestamped on-chain record. Anyone can verify your strategy existed at that point in time.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
