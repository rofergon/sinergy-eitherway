import React, { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { parseStrategy, validateRisk } from '../lib/strategyParser'
import { hashStrategy } from '../lib/hash'
import { useWallet } from '../lib/wallet-context'
import { buildStrategyReceiptTx } from '../lib/rpc'
import { saveStrategy, updateStrategyTx } from '../lib/strategies'

const EXAMPLES = [
  'Buy SOL on every 10% dip, allocate 15% of portfolio, stop loss at 12%, take profit at 35%',
  'DCA into JUP every week with 5% of portfolio, hold long-term, stop loss 20%',
  'Aggressive: buy BONK on 20% drops, 25% allocation, take profit 80%, stop loss 15%',
  'Conservative: stake SOL and USDC for yield, 10% allocation, rebalance monthly',
  'Swap 20% of portfolio from USDC to SOL when RSI below 30, take profit 25%, stop loss 8%',
]

const SEVERITY_COLORS = {
  ok: { bg: 'bg-sinergy-green/10', border: 'border-sinergy-green/30', text: 'text-sinergy-green', icon: '✓' },
  warning: { bg: 'bg-sinergy-amber/10', border: 'border-sinergy-amber/30', text: 'text-sinergy-amber', icon: '⚠' },
  critical: { bg: 'bg-sinergy-red/10', border: 'border-sinergy-red/30', text: 'text-sinergy-red', icon: '✗' },
}

export default function StrategyBuilder() {
  const navigate = useNavigate()
  const { connected, address, signAndSendTransaction } = useWallet()
  const [prompt, setPrompt] = useState('')
  const [parsed, setParsed] = useState(null)
  const [risk, setRisk] = useState(null)
  const [hash, setHash] = useState(null)
  const [txStatus, setTxStatus] = useState(null) // null | 'saving' | 'signing' | 'sending' | 'done' | 'error'
  const [txSig, setTxSig] = useState(null)
  const [txError, setTxError] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [savedId, setSavedId] = useState(null) // Supabase row id of the saved draft
  const textareaRef = useRef()

  const analyze = async () => {
    if (!prompt.trim()) return
    setAnalyzing(true)
    setParsed(null)
    setRisk(null)
    setHash(null)
    setTxStatus(null)
    setTxSig(null)
    setTxError(null)
    setSavedId(null)

    // Small delay for UX
    await new Promise((r) => setTimeout(r, 400))

    const rules = parseStrategy(prompt)
    const validation = validateRisk(rules)
    const strategyHash = await hashStrategy({ prompt, tokens: rules.tokens, parsedRules: rules, metrics: null })

    setParsed(rules)
    setRisk(validation)
    setHash(strategyHash)
    setAnalyzing(false)
  }

  /** Persist strategy to Supabase + localStorage then navigate to /receipts */
  const saveLocally = async () => {
    if (!parsed || !hash) return
    setTxStatus('saving')

    // Save to Supabase
    const saved = await saveStrategy(address || null, prompt, parsed, risk, hash, null)

    // Always mirror to localStorage for offline resilience
    const lsReceipt = {
      id: saved?.id || crypto.randomUUID(),
      prompt,
      parsedRules: parsed,
      risk,
      hash,
      txSignature: null,
      createdAt: Date.now(),
    }
    const existing = JSON.parse(localStorage.getItem('sinergy_receipts') || '[]')
    localStorage.setItem('sinergy_receipts', JSON.stringify([lsReceipt, ...existing]))

    if (saved) setSavedId(saved.id)
    setTxStatus(null)
    navigate('/receipts')
  }

  /** Sign transaction via Solflare, send on-chain, then persist receipt */
  const commitOnChain = async () => {
    if (!connected || !hash) return
    setTxStatus('signing')
    setTxError(null)
    setTxSig(null)
    try {
      const tx = await buildStrategyReceiptTx(address, hash)
      setTxStatus('sending')
      const sig = await signAndSendTransaction(tx)
      setTxSig(sig)
      setTxStatus('done')

      // If we already saved a draft, update it; otherwise save fresh
      if (savedId) {
        await updateStrategyTx(savedId, sig)
      } else {
        const saved = await saveStrategy(address || null, prompt, parsed, risk, hash, sig)
        if (saved) setSavedId(saved.id)
      }

      // Mirror to localStorage
      const lsReceipt = {
        id: savedId || crypto.randomUUID(),
        prompt,
        parsedRules: parsed,
        risk,
        hash,
        txSignature: sig,
        createdAt: Date.now(),
      }
      const existing = JSON.parse(localStorage.getItem('sinergy_receipts') || '[]')
      // Replace existing draft if present
      const filtered = existing.filter((r) => r.hash !== hash)
      localStorage.setItem('sinergy_receipts', JSON.stringify([lsReceipt, ...filtered]))
    } catch (err) {
      setTxStatus('error')
      setTxError(err.message || 'Transaction failed')
    }
  }

  const scoreColor = !risk ? '' : risk.score >= 80 ? 'text-sinergy-green' : risk.score >= 60 ? 'text-sinergy-amber' : 'text-sinergy-red'
  const scoreBg = !risk ? '' : risk.score >= 80 ? 'bg-sinergy-green' : risk.score >= 60 ? 'bg-sinergy-amber' : 'bg-sinergy-red'

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-sinergy-text">Strategy Builder</h1>
        <p className="text-sinergy-muted text-xs mt-0.5">Write a DeFi strategy in plain English. The engine parses rules, validates risk, and lets you commit it on-chain.</p>
      </div>

      {/* Prompt Input */}
      <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
        <label className="block text-xs font-semibold text-sinergy-text mb-2">Strategy Prompt</label>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Describe your DeFi strategy... e.g., 'Buy SOL on every 10% dip, allocate 15% of portfolio, stop loss at 12%, take profit at 35%'"
          className="w-full bg-sinergy-bg border border-sinergy-border rounded-lg px-3 py-2 text-sinergy-text text-sm placeholder-sinergy-muted/50 resize-none focus:border-sinergy-accent/60 transition-all font-mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyze()
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-sinergy-muted/60 text-[10px]">Cmd+Enter to analyze</span>
          <button
            onClick={analyze}
            disabled={!prompt.trim() || analyzing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sinergy-accent hover:bg-sinergy-accent/80 text-white text-xs font-medium transition-all disabled:opacity-40"
          >
            {analyzing ? (
              <>
                <span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                Analyze Strategy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Examples */}
      <div>
        <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-2">Example Strategies</div>
        <div className="flex flex-col gap-1.5">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setPrompt(ex)}
              className="text-left text-xs text-sinergy-muted hover:text-sinergy-text bg-sinergy-surface border border-sinergy-border rounded-lg px-3 py-2 hover:border-sinergy-accent/50 transition-all"
            >
              <span className="text-sinergy-accent mr-2">›</span>
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Analysis Results */}
      {parsed && risk && (
        <div className="space-y-4">
          {/* Parsed Rules */}
          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-sinergy-text">Parsed Strategy Rules</h2>
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                parsed.riskLevel === 'high' ? 'bg-sinergy-red/20 text-sinergy-red' :
                parsed.riskLevel === 'low' ? 'bg-sinergy-green/20 text-sinergy-green' :
                'bg-sinergy-amber/20 text-sinergy-amber'
              }`}>
                {parsed.riskLevel.toUpperCase()} RISK
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-sinergy-bg rounded-lg p-3">
                <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">Actions</div>
                <div className="text-xs font-mono text-sinergy-cyan">{parsed.actions.join(', ')}</div>
              </div>
              <div className="bg-sinergy-bg rounded-lg p-3">
                <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">Allocation</div>
                <div className="text-xs font-mono text-sinergy-text">{parsed.allocation}% of portfolio</div>
              </div>
              <div className="bg-sinergy-bg rounded-lg p-3">
                <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">Stop Loss</div>
                <div className="text-xs font-mono text-sinergy-red">{parsed.stopLoss}%</div>
              </div>
              <div className="bg-sinergy-bg rounded-lg p-3">
                <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">Take Profit</div>
                <div className="text-xs font-mono text-sinergy-green">{parsed.takeProfit}%</div>
              </div>
              <div className="bg-sinergy-bg rounded-lg p-3">
                <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">Time Horizon</div>
                <div className="text-xs font-mono text-sinergy-text">{parsed.timeHorizon}</div>
              </div>
              <div className="bg-sinergy-bg rounded-lg p-3">
                <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">DCA</div>
                <div className="text-xs font-mono text-sinergy-text">
                  {parsed.isDCA ? `Yes, ${parsed.dcaFrequency}` : 'No'}
                </div>
              </div>
            </div>

            {/* Tokens */}
            <div className="mb-3">
              <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1.5">Target Tokens</div>
              <div className="flex flex-wrap gap-2">
                {parsed.tokens.map((t) => (
                  <div key={t.address} className="flex items-center gap-1.5 bg-sinergy-accent/10 border border-sinergy-accent/20 rounded-md px-2 py-1">
                    <img src={t.logo} alt={t.symbol} className="w-4 h-4 rounded-full" onError={(e) => { e.target.style.display = 'none' }} />
                    <span className="text-xs font-mono text-sinergy-accent">{t.symbol}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Triggers */}
            {parsed.triggers.length > 0 && (
              <div>
                <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1.5">Entry Triggers</div>
                <div className="flex flex-wrap gap-2">
                  {parsed.triggers.map((t, i) => (
                    <div key={i} className="bg-sinergy-cyan/10 border border-sinergy-cyan/20 rounded-md px-2 py-1 text-[10px] font-mono text-sinergy-cyan">
                      {t.type === 'PRICE_DROP' && `Price drops ${t.value}%`}
                      {t.type === 'PRICE_RISE' && `Price rises ${t.value}%`}
                      {t.type === 'RSI' && `RSI < ${t.value}`}
                      {t.type === 'MA_CROSS' && `MA${t.period} Cross`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="mt-3 pt-3 border-t border-sinergy-border">
              <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">Summary</div>
              <div className="text-xs font-mono text-sinergy-muted bg-sinergy-bg rounded px-3 py-2">{parsed.summary}</div>
            </div>
          </div>

          {/* Risk Validation */}
          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-sinergy-text">Risk Validation</h2>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-sinergy-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${scoreBg} transition-all`}
                    style={{ width: `${risk.score}%` }}
                  />
                </div>
                <span className={`text-sm font-bold font-mono ${scoreColor}`}>{risk.score}/100</span>
              </div>
            </div>
            <div className="space-y-2">
              {risk.checks.map((check) => {
                const style = SEVERITY_COLORS[check.severity]
                return (
                  <div key={check.id} className={`${style.bg} border ${style.border} rounded-lg p-3`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm ${style.text}`}>{style.icon}</span>
                      <span className="text-xs font-semibold text-sinergy-text">{check.label}</span>
                      <span className="text-sinergy-muted text-xs ml-auto">{check.description}</span>
                    </div>
                    <div className={`text-[10px] ${style.text}`}>{check.recommendation}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hash */}
          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <h2 className="text-sm font-semibold text-sinergy-text mb-3">Strategy Hash (SHA-256)</h2>
            <div className="bg-sinergy-bg rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="text-[10px] font-mono text-sinergy-green break-all flex-1">{hash}</div>
              <button
                onClick={() => navigator.clipboard?.writeText(hash)}
                className="text-sinergy-muted hover:text-sinergy-text shrink-0 p-1 transition-all"
                title="Copy hash"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              </button>
            </div>
            <p className="text-sinergy-muted/60 text-[10px] mt-2">
              This deterministic hash uniquely identifies your strategy. Committing it on-chain creates an immutable, timestamped proof of your strategy parameters.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={saveLocally}
              disabled={txStatus === 'saving'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sinergy-border text-sinergy-muted hover:text-sinergy-text hover:border-sinergy-accent/50 text-xs font-medium transition-all disabled:opacity-40"
            >
              {txStatus === 'saving' ? (
                <>
                  <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Save to Cloud
                </>
              )}
            </button>

            {/* Run Backtest shortcut */}
            <Link
              to={`/backtest?prompt=${encodeURIComponent(prompt)}`}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sinergy-cyan/40 text-sinergy-cyan hover:bg-sinergy-cyan/10 text-xs font-medium transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Run Backtest
            </Link>

            <button
              onClick={commitOnChain}
              disabled={!connected || txStatus === 'signing' || txStatus === 'sending' || txStatus === 'done'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sinergy-green hover:bg-sinergy-green/80 text-sinergy-bg text-xs font-semibold transition-all disabled:opacity-40"
            >
              {txStatus === 'signing' && <span className="animate-spin w-3 h-3 border border-sinergy-bg border-t-transparent rounded-full" />}
              {txStatus === 'sending' && <span className="animate-spin w-3 h-3 border border-sinergy-bg border-t-transparent rounded-full" />}
              {txStatus === 'done' ? '✓ On-chain!' : txStatus === 'signing' ? 'Signing...' : txStatus === 'sending' ? 'Sending...' : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  Commit On-Chain via Solflare
                </>
              )}
            </button>

            {!connected && (
              <span className="text-sinergy-muted text-xs self-center">Connect Solflare to commit on-chain</span>
            )}
          </div>

          {/* TX Status */}
          {txStatus === 'done' && txSig && (
            <div className="bg-sinergy-green/10 border border-sinergy-green/30 rounded-lg p-3">
              <div className="text-sinergy-green text-xs font-semibold mb-1">Strategy committed on-chain!</div>
              <div className="text-sinergy-muted text-[10px] font-mono break-all">{txSig}</div>
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sinergy-accent text-[10px] hover:underline mt-1 inline-block"
              >
                View on Solana Explorer →
              </a>
            </div>
          )}
          {txStatus === 'error' && (
            <div className="bg-sinergy-red/10 border border-sinergy-red/30 rounded-lg p-3 text-sinergy-red text-xs">
              Transaction failed: {txError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
