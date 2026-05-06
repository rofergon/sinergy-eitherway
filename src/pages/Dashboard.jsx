import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '../lib/wallet-context'
import { getMultipleTokenPrices } from '../lib/birdeye'
import { TOKEN_LIST, QN_SOLANA_RPC } from '../config'
import { loadStrategies } from '../lib/strategies'

const FEATURED_TOKENS = TOKEN_LIST.slice(0, 6)

// Build a map of mint → TOKEN metadata for quick lookups
const TOKEN_BY_MINT = Object.fromEntries(TOKEN_LIST.map((t) => [t.address, t]))

export default function Dashboard() {
  const { connected, address, balance } = useWallet()
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [receipts, setReceipts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sinergy_receipts') || '[]') } catch { return [] }
  })
  const [portfolio, setPortfolio] = useState([]) // [{token, uiAmount, usdValue}]
  const [portfolioLoading, setPortfolioLoading] = useState(false)

  // Load receipts from Supabase on mount
  useEffect(() => {
    loadStrategies().then((rows) => {
      if (rows !== null) setReceipts(rows)
    }, () => {/* keep localStorage fallback on error */})
  }, [])

  // Fetch SPL token balances when wallet is connected
  const fetchPortfolio = useCallback(async () => {
    if (!connected || !address) return
    setPortfolioLoading(true)
    try {
      const res = await fetch(QN_SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            address,
            { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
            { encoding: 'jsonParsed' },
          ],
        }),
      })
      const json = await res.json()
      const accounts = json?.result?.value || []
      const holdings = []
      for (const acc of accounts) {
        const info = acc.account?.data?.parsed?.info
        if (!info) continue
        const mint = info.mint
        const uiAmount = info.tokenAmount?.uiAmount ?? 0
        if (uiAmount <= 0) continue
        const tokenMeta = TOKEN_BY_MINT[mint]
        if (!tokenMeta) continue
        holdings.push({ token: tokenMeta, uiAmount })
      }
      // Fetch USD prices for these holdings
      const mints = holdings.map((h) => h.token.address)
      if (mints.length > 0) {
        const priceMap = await getMultipleTokenPrices(mints)
        for (const h of holdings) {
          const p = priceMap[h.token.address]?.value
          h.usdValue = p != null ? h.uiAmount * p : null
        }
      }
      holdings.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))
      setPortfolio(holdings)
    } catch {
      setPortfolio([])
    } finally {
      setPortfolioLoading(false)
    }
  }, [connected, address])

  useEffect(() => {
    fetchPortfolio()
  }, [fetchPortfolio])

  useEffect(() => {
    async function fetchPrices() {
      setLoading(true)
      try {
        const result = await getMultipleTokenPrices(FEATURED_TOKENS.map((t) => t.address))
        setPrices(result)
      } catch {
        setPrices({})
      } finally {
        setLoading(false)
      }
    }
    fetchPrices()
    const interval = setInterval(fetchPrices, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatPrice = (p) => {
    if (!p) return '—'
    const v = p.value
    if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    if (v >= 1) return `$${v.toFixed(2)}`
    return `$${v.toFixed(6)}`
  }

  const getChange = (p) => p?.priceChange24h ?? null
  const formatChange = (c) => (c === null ? '—' : `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`)

  const stats = [
    { label: 'Live Token Feeds', value: FEATURED_TOKENS.length, unit: 'tokens', color: 'sinergy-accent' },
    { label: 'Strategies Saved', value: receipts.length, unit: 'total', color: 'sinergy-green' },
    { label: 'Network', value: 'DEVNET', unit: 'SOL', color: 'sinergy-cyan' },
    { label: 'SOL Balance', value: connected ? (balance?.toFixed(3) ?? '—') : '—', unit: connected ? 'SOL' : 'not connected', color: 'sinergy-amber' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden border border-sinergy-border bg-sinergy-surface p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-sinergy-accent/10 via-transparent to-sinergy-green/5 pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sinergy-accent/20 border border-sinergy-accent/30 text-sinergy-accent text-xs font-mono mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-sinergy-accent animate-pulse" />
            LIVE ON SOLANA DEVNET
          </div>
          <h1 className="text-3xl font-bold text-sinergy-text mb-2">
            DeFi Strategy{' '}
            <span className="gradient-text">Intelligence</span>
          </h1>
          <p className="text-sinergy-muted text-sm max-w-xl mb-6">
            Build natural-language DeFi strategies, backtest them against live Birdeye price data, validate risk rules, and commit strategy hashes on-chain via Solflare.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/strategy"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sinergy-accent hover:bg-sinergy-accent/80 text-white text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Build Strategy
            </Link>
            <Link
              to="/markets"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sinergy-border text-sinergy-muted hover:text-sinergy-text hover:border-sinergy-accent/50 text-sm transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
              </svg>
              View Markets
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <div className={`text-lg font-bold font-mono text-${s.color} mb-0.5`}>{s.value}</div>
            <div className="text-sinergy-muted text-[10px] uppercase tracking-wider">{s.label}</div>
            <div className="text-sinergy-muted/60 text-[10px]">{s.unit}</div>
          </div>
        ))}
      </div>

      {/* Wallet Portfolio */}
      {connected && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-sinergy-text">Wallet Portfolio</h2>
            <div className="flex items-center gap-2">
              {portfolioLoading && (
                <span className="text-sinergy-muted text-xs flex items-center gap-1">
                  <span className="animate-spin w-3 h-3 border border-sinergy-muted border-t-transparent rounded-full" />
                  Loading...
                </span>
              )}
              <button onClick={fetchPortfolio} className="text-sinergy-muted text-xs hover:text-sinergy-text transition-all">Refresh</button>
            </div>
          </div>
          {portfolio.length === 0 && !portfolioLoading ? (
            <div className="bg-sinergy-surface border border-sinergy-border rounded-xl px-4 py-6 text-center">
              <div className="text-sinergy-muted text-xs">No tracked tokens found in this wallet.</div>
              <div className="text-sinergy-muted/60 text-[10px] mt-1">Sinergy tracks SOL, USDC, JUP, RAY, BONK, JTO, and WIF on Mainnet.</div>
            </div>
          ) : (
            <div className="bg-sinergy-surface border border-sinergy-border rounded-xl overflow-hidden">
              {/* Include native SOL balance */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 border-b border-sinergy-border/50 bg-sinergy-bg/30">
                <span className="text-[10px] text-sinergy-muted uppercase tracking-wider">Asset</span>
                <span className="text-[10px] text-sinergy-muted uppercase tracking-wider text-right w-24">Balance</span>
                <span className="text-[10px] text-sinergy-muted uppercase tracking-wider text-right w-20">USD Value</span>
              </div>
              {/* Native SOL row */}
              {balance != null && balance > 0 && (
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-3 border-b border-sinergy-border/50">
                  <div className="flex items-center gap-3">
                    <img src={TOKEN_LIST[0].logo} alt="SOL" className="w-7 h-7 rounded-full" onError={(e) => { e.target.style.display = 'none' }} />
                    <div>
                      <div className="text-sm font-semibold text-sinergy-text">SOL</div>
                      <div className="text-[10px] text-sinergy-muted">Native</div>
                    </div>
                  </div>
                  <div className="text-right w-24 text-sm font-mono text-sinergy-text">{balance.toFixed(4)}</div>
                  <div className="text-right w-20 text-sm font-mono text-sinergy-muted">
                    {prices[TOKEN_LIST[0].address]?.value ? `${(balance * prices[TOKEN_LIST[0].address].value).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
                  </div>
                </div>
              )}
              {portfolio.map((h) => (
                <div key={h.token.address} className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-3 border-b border-sinergy-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <img src={h.token.logo} alt={h.token.symbol} className="w-7 h-7 rounded-full" onError={(e) => { e.target.style.display = 'none' }} />
                    <div>
                      <div className="text-sm font-semibold text-sinergy-text">{h.token.symbol}</div>
                      <div className="text-[10px] text-sinergy-muted">{h.token.name}</div>
                    </div>
                  </div>
                  <div className="text-right w-24 text-sm font-mono text-sinergy-text">
                    {h.uiAmount >= 1e6 ? `${(h.uiAmount / 1e6).toFixed(2)}M` : h.uiAmount >= 1000 ? h.uiAmount.toLocaleString('en-US', { maximumFractionDigits: 2 }) : h.uiAmount.toFixed(4)}
                  </div>
                  <div className={`text-right w-20 text-sm font-mono ${h.usdValue != null ? 'text-sinergy-text' : 'text-sinergy-muted'}`}>
                    {h.usdValue != null ? `${h.usdValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
                  </div>
                </div>
              ))}
              {/* Total USD row */}
              {(portfolio.some(h => h.usdValue != null) || (balance && prices[TOKEN_LIST[0].address]?.value)) && (
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-2.5 bg-sinergy-bg/40 border-t border-sinergy-border">
                  <span className="text-[10px] text-sinergy-muted uppercase tracking-wider">Total Value</span>
                  <div className="w-24" />
                  <div className="text-right w-20 text-sm font-mono font-bold text-sinergy-accent">
                    ${(() => {
                      let total = 0
                      if (balance && prices[TOKEN_LIST[0].address]?.value) total += balance * prices[TOKEN_LIST[0].address].value
                      for (const h of portfolio) if (h.usdValue != null) total += h.usdValue
                      return total.toLocaleString('en-US', { maximumFractionDigits: 2 })
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Token Prices */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-sinergy-text">Live Market Prices</h2>
          {loading && (
            <span className="text-sinergy-muted text-xs flex items-center gap-1">
              <span className="animate-spin w-3 h-3 border border-sinergy-muted border-t-transparent rounded-full" />
              Refreshing...
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {FEATURED_TOKENS.map((token) => {
            const p = prices[token.address]
            const change = getChange(p)
            const positive = change !== null && change >= 0
            return (
              <div
                key={token.address}
                className="bg-sinergy-surface border border-sinergy-border rounded-xl p-3 hover:border-sinergy-accent/50 transition-all group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src={token.logo}
                    alt={token.symbol}
                    className="w-6 h-6 rounded-full"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  <span className="text-xs font-bold text-sinergy-text">{token.symbol}</span>
                </div>
                <div className="text-sm font-mono font-semibold text-sinergy-text">
                  {loading ? <span className="text-sinergy-muted/40">Loading...</span> : formatPrice(p)}
                </div>
                {change !== null && (
                  <div className={`text-[10px] font-mono mt-0.5 ${positive ? 'text-sinergy-green' : 'text-sinergy-red'}`}>
                    {formatChange(change)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          to="/strategy"
          className="bg-sinergy-surface border border-sinergy-border rounded-xl p-5 hover:border-sinergy-accent/50 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-sinergy-accent/20 flex items-center justify-center mb-3 group-hover:bg-sinergy-accent/30 transition-all">
            <svg className="w-4 h-4 text-sinergy-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-sinergy-text mb-1">Strategy Builder</h3>
          <p className="text-sinergy-muted text-xs">Write your strategy in plain English. AI parses rules, risk, and triggers automatically.</p>
        </Link>
        <Link
          to="/backtest"
          className="bg-sinergy-surface border border-sinergy-border rounded-xl p-5 hover:border-sinergy-green/50 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-sinergy-green/20 flex items-center justify-center mb-3 group-hover:bg-sinergy-green/30 transition-all">
            <svg className="w-4 h-4 text-sinergy-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-sinergy-text mb-1">Backtest Engine</h3>
          <p className="text-sinergy-muted text-xs">Simulate strategies against 60 days of Birdeye live price data with full P&L metrics.</p>
        </Link>
        <Link
          to="/receipts"
          className="bg-sinergy-surface border border-sinergy-border rounded-xl p-5 hover:border-sinergy-cyan/50 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-sinergy-cyan/20 flex items-center justify-center mb-3 group-hover:bg-sinergy-cyan/30 transition-all">
            <svg className="w-4 h-4 text-sinergy-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-sinergy-text mb-1">On-Chain Receipts</h3>
          <p className="text-sinergy-muted text-xs">Commit strategy SHA-256 hashes to Solana Devnet via Solflare. Verifiable forever.</p>
        </Link>
      </div>

      {/* Recent Receipts */}
      {receipts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-sinergy-text">Recent Receipts</h2>
            <Link to="/receipts" className="text-xs text-sinergy-accent hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {receipts.slice(0, 3).map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-sinergy-surface border border-sinergy-border rounded-lg px-4 py-3">
                <div>
                  <div className="text-xs text-sinergy-text font-medium truncate max-w-[200px]">{r.prompt?.slice(0, 60)}...</div>
                  <div className="text-[10px] text-sinergy-muted font-mono mt-0.5">{r.hash?.slice(0, 16)}...</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${r.txSignature ? 'bg-sinergy-green/20 text-sinergy-green' : 'bg-sinergy-muted/20 text-sinergy-muted'}`}>
                    {r.txSignature ? 'on-chain' : r.source === 'supabase' ? 'cloud' : 'local'}
                  </div>
                  <div className="text-[10px] text-sinergy-muted">{new Date(r.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
