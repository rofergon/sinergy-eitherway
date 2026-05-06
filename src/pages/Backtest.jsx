import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { parseStrategy } from '../lib/strategyParser'
import { runBacktest } from '../lib/backtest'

const PORTFOLIO_SIZES = [500, 1000, 5000, 10000, 50000]

function MetricCard({ label, value, color = 'text-sinergy-text', sub }) {
  return (
    <div className="bg-sinergy-bg rounded-xl border border-sinergy-border p-4">
      <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-sinergy-muted/60 text-[10px] font-mono mt-0.5">{sub}</div>}
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-sinergy-surface border border-sinergy-border rounded-lg px-3 py-2">
      <div className="text-sinergy-muted text-[10px] mb-1">{label}</div>
      <div className="text-sinergy-text font-mono text-xs font-semibold">
        ${payload[0]?.value?.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}

export default function Backtest() {
  const [searchParams] = useSearchParams()
  const [prompt, setPrompt] = useState(() => searchParams.get('prompt') || '')
  const [portfolio, setPortfolio] = useState(1000)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [selectedToken, setSelectedToken] = useState(0)

  // If navigated from StrategyBuilder with a pre-filled prompt, auto-run the backtest
  useEffect(() => {
    const pre = searchParams.get('prompt')
    if (pre && pre.trim()) {
      setPrompt(pre)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async () => {
    if (!prompt.trim()) return
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const rules = parseStrategy(prompt)
      const backtestResult = await runBacktest(rules, portfolio)
      setResult({ rules, ...backtestResult })
      setSelectedToken(0)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const summary = result?.summary
  const tokenResults = result?.tokenResults || []
  const merged = result?.merged || []

  const returnColor = summary?.avgReturn == null ? '' : summary.avgReturn >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'
  const pnlColor = summary?.totalPnL == null ? '' : summary.totalPnL >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'

  const displayData = selectedToken === -1 ? merged : (tokenResults[selectedToken]?.equityCurve || merged)

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-sinergy-text">Backtest Engine</h1>
        <p className="text-sinergy-muted text-xs mt-0.5">
          Simulate your strategy against up to 60 days of Birdeye historical price data.
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-sinergy-text mb-2">Strategy Description</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Buy SOL on every 10% dip, allocate 15% of portfolio, stop loss at 12%, take profit at 35%..."
            className="w-full bg-sinergy-bg border border-sinergy-border rounded-lg px-3 py-2 text-sinergy-text text-sm placeholder-sinergy-muted/50 resize-none focus:border-sinergy-accent/60 transition-all font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-sinergy-text mb-2">
            Portfolio Size: <span className="text-sinergy-accent font-mono">${portfolio.toLocaleString()}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PORTFOLIO_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setPortfolio(size)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  portfolio === size
                    ? 'bg-sinergy-accent text-white'
                    : 'bg-sinergy-bg border border-sinergy-border text-sinergy-muted hover:text-sinergy-text'
                }`}
              >
                ${size.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={run}
          disabled={!prompt.trim() || running}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-sinergy-green hover:bg-sinergy-green/80 text-sinergy-bg text-xs font-semibold transition-all disabled:opacity-40"
        >
          {running ? (
            <>
              <span className="animate-spin w-3 h-3 border-2 border-sinergy-bg border-t-transparent rounded-full" />
              Running Backtest...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Run Backtest
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-sinergy-red/10 border border-sinergy-red/30 rounded-lg p-3 text-sinergy-red text-xs">
          Backtest failed: {error}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {/* Summary Metrics */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-sinergy-text">Performance Summary</h2>
              <span className="text-[10px] font-mono text-sinergy-muted px-2 py-0.5 bg-sinergy-surface border border-sinergy-border rounded-full">
                {summary?.dataSource}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <MetricCard
                label="Total Return"
                value={`${summary?.avgReturn >= 0 ? '+' : ''}${summary?.avgReturn}%`}
                color={returnColor}
              />
              <MetricCard
                label="Net P&L"
                value={`${summary?.totalPnL >= 0 ? '+' : ''}$${Math.abs(summary?.totalPnL).toLocaleString()}`}
                color={pnlColor}
              />
              <MetricCard
                label="Win Rate"
                value={`${summary?.avgWinRate}%`}
                color={summary?.avgWinRate >= 50 ? 'text-sinergy-green' : 'text-sinergy-amber'}
              />
              <MetricCard
                label="Sharpe Ratio"
                value={summary?.sharpe}
                sub="risk-adj return"
                color={summary?.sharpe >= 1 ? 'text-sinergy-green' : summary?.sharpe >= 0 ? 'text-sinergy-amber' : 'text-sinergy-red'}
              />
              <MetricCard
                label="Max Drawdown"
                value={`${summary?.maxDrawdown}%`}
                color={summary?.maxDrawdown > 20 ? 'text-sinergy-red' : 'text-sinergy-amber'}
              />
            </div>
          </div>

          {/* Strategy Info */}
          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-sinergy-text mb-2">Parsed Strategy</h3>
            <div className="font-mono text-xs text-sinergy-muted bg-sinergy-bg rounded px-3 py-2">{result.rules?.summary}</div>
          </div>

          {/* Chart */}
          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-sinergy-text">Equity Curve</h2>
              {tokenResults.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setSelectedToken(-1)}
                    className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                      selectedToken === -1 ? 'bg-sinergy-accent text-white' : 'text-sinergy-muted hover:text-sinergy-text'
                    }`}
                  >
                    BLENDED
                  </button>
                  {tokenResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedToken(i)}
                      className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                        selectedToken === i ? 'bg-sinergy-accent text-white' : 'text-sinergy-muted hover:text-sinergy-text'
                      }`}
                    >
                      {r.token?.symbol}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={displayData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v > 1000 ? (v / 1000).toFixed(1) + 'K' : v}`}
                  width={55}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={(result.rules?.allocation / 100) * portfolio}
                  stroke="#6B7280"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#14F195"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#14F195' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Per-Token Results */}
          {tokenResults.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-sinergy-text mb-3">Per-Token Results</h2>
              <div className="space-y-3">
                {tokenResults.map((r, i) => (
                  <div key={i} className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <img src={r.token?.logo} alt={r.token?.symbol} className="w-6 h-6 rounded-full" onError={(e) => { e.target.style.display = 'none' }} />
                      <span className="text-sm font-semibold text-sinergy-text">{r.token?.name}</span>
                      <span className="text-sinergy-muted text-xs">{r.token?.symbol}</span>
                      {r.synthetic && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-sinergy-amber/20 text-sinergy-amber rounded font-mono ml-auto">SYNTHETIC</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                      {[
                        { l: 'Return', v: `${r.metrics.totalReturn >= 0 ? '+' : ''}${r.metrics.totalReturn}%`, c: r.metrics.totalReturn >= 0 ? 'text-sinergy-green' : 'text-sinergy-red' },
                        { l: 'P&L', v: `$${r.metrics.totalPnL}`, c: r.metrics.totalPnL >= 0 ? 'text-sinergy-green' : 'text-sinergy-red' },
                        { l: 'Win Rate', v: `${r.metrics.winRate}%`, c: 'text-sinergy-text' },
                        { l: 'Trades', v: r.metrics.totalTrades, c: 'text-sinergy-text' },
                        { l: 'Sharpe', v: r.metrics.sharpe, c: 'text-sinergy-text' },
                        { l: 'Max DD', v: `${r.metrics.maxDrawdown}%`, c: 'text-sinergy-amber' },
                      ].map((m) => (
                        <div key={m.l} className="bg-sinergy-bg rounded-lg p-2">
                          <div className="text-[9px] text-sinergy-muted uppercase tracking-wider mb-0.5">{m.l}</div>
                          <div className={`text-xs font-mono font-semibold ${m.c}`}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                    {r.trades?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] text-sinergy-muted uppercase tracking-wider mb-1.5">Recent Trades</div>
                        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                          {r.trades.map((trade, j) => (
                            <div key={j} className="flex items-center justify-between text-[10px] font-mono">
                              <span className={`px-1.5 py-0.5 rounded font-semibold ${trade.type === 'BUY' ? 'bg-sinergy-green/20 text-sinergy-green' : 'bg-sinergy-red/20 text-sinergy-red'}`}>
                                {trade.type}
                              </span>
                              <span className="text-sinergy-muted">{trade.date}</span>
                              <span className="text-sinergy-text">${trade.price?.toFixed(4)}</span>
                              {trade.pnl != null && (
                                <span className={trade.pnl >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'}>
                                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl}
                                </span>
                              )}
                              {trade.reason && <span className="text-sinergy-muted/60">{trade.reason}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
