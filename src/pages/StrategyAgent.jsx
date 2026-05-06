import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { runStrategyAgentStream, getStrategyAgentHealth } from '../lib/agent'
import { saveStrategy } from '../lib/strategies'
import { useWallet } from '../lib/wallet-context'
import { getTokenOHLCV } from '../lib/birdeye'
import { TOKENS } from '../config'

const EXAMPLES = [
  'Create an EMA crossover strategy for SOL on 15m, long only, stop loss 5%, validate it, and run a backtest.',
  'Generate an RSI mean reversion strategy for JUP, conservative risk, validate it, then prepare a receipt.',
  'Build a long/short EMA and RSI swing strategy for BONK with 10% allocation and simulate it.',
]

const PORTFOLIO_SIZES = [500, 1000, 5000, 10000]
const TIMEFRAMES = [
  { id: '1m', label: '1m', period: '1H', defaultBars: 60 },
  { id: '5m', label: '5m', period: '1D', defaultBars: 72 },
  { id: '15m', label: '15m', period: '1D', defaultBars: 90 },
  { id: '1h', label: '1H', period: '1W', defaultBars: 120 },
  { id: '4h', label: '4H', period: '1M', defaultBars: 120 },
  { id: '1d', label: '1D', period: '1M', defaultBars: 90 },
]

function shortHash(value) {
  if (!value) return '--'
  return value.length <= 14 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`
}

function humanizeToolName(tool = '') {
  return tool.split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return '--'
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function metricNumber(value, fallback = '--') {
  return Number.isFinite(value) ? value : fallback
}

function normalizeError(error) {
  if (!error) return null
  if (typeof error === 'string') return error
  return error.message || JSON.stringify(error)
}

function inferEmaPeriods(script = '') {
  const periods = [...script.matchAll(/ta\.ema\([^,]+,\s*(\d{1,3})\s*\)/g)].map((match) => Number(match[1]))
  return { fast: periods[0] || 9, slow: periods[1] || 21 }
}

function ema(values, period) {
  const out = Array(values.length).fill(null)
  const k = 2 / (period + 1)
  let prev = null
  values.forEach((value, index) => {
    if (index === period - 1) {
      prev = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period
      out[index] = prev
    } else if (index >= period && prev != null) {
      prev = value * k + prev * (1 - k)
      out[index] = prev
    }
  })
  return out
}

function timeLabel(unixTime, timeframe) {
  const date = new Date(unixTime * 1000)
  if (['1m', '5m', '15m', '1h'].includes(timeframe)) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function syntheticCandles(count = 120) {
  const now = Math.floor(Date.now() / 1000)
  const candles = []
  let close = 145
  for (let index = 0; index < count; index += 1) {
    const open = close
    const wave = Math.sin(index / 8) * 0.008
    const drift = 0.0009
    close = Math.max(1, close * (1 + drift + wave + (Math.random() - 0.52) * 0.018))
    const spread = Math.max(Math.abs(close - open) * 0.9, close * 0.004)
    candles.push({
      unixTime: now - (count - index) * 15 * 60,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
      close,
      volume: 100000 + Math.random() * 300000,
      synthetic: true,
    })
  }
  return candles
}

function normalizeChartCandles(rawCandles, timeframe) {
  return rawCandles.map((item) => ({
    date: item.date || timeLabel(item.unixTime, timeframe),
    unixTime: item.unixTime,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    value: item.close,
    synthetic: item.synthetic,
  }))
}

function buildChartData({ backtest, script, chartCandles, visibleBars, timeframe }) {
  const tokenResult = backtest?.tokenResults?.[0]
  const curve = tokenResult?.equityCurve || backtest?.merged || []
  const periods = inferEmaPeriods(script)

  if (!curve.length) {
    const candles = normalizeChartCandles(chartCandles, timeframe).slice(-visibleBars)
    const prices = candles.map((item) => item.close)
    return {
      candles,
      trades: [],
      fast: ema(prices, periods.fast),
      slow: ema(prices, periods.slow),
      periods,
    }
  }

  const candles = curve.slice(-visibleBars).map((point, index, sliced) => {
    const prev = sliced[index - 1]?.price ?? point.price ?? point.value
    const close = point.price ?? point.value
    const drift = close - prev
    const spread = Math.max(Math.abs(drift) * 0.75, close * 0.0015)
    return {
      date: point.date,
      open: prev,
      close,
      high: Math.max(prev, close) + spread,
      low: Math.min(prev, close) - spread,
      value: point.value,
    }
  })
  const prices = candles.map((item) => item.close)
  return {
    candles,
    trades: tokenResult?.trades || [],
    fast: ema(prices, periods.fast),
    slow: ema(prices, periods.slow),
    periods,
  }
}

function AgentPriceChart({ backtest, script, chartCandles, visibleBars, timeframe, loading }) {
  const { candles, trades, fast, slow, periods } = useMemo(
    () => buildChartData({ backtest, script, chartCandles, visibleBars, timeframe }),
    [backtest, chartCandles, script, timeframe, visibleBars]
  )
  if (!candles.length) {
    return (
      <div className="flex h-[390px] items-center justify-center rounded-lg border border-dashed border-sinergy-border bg-sinergy-bg text-sm text-sinergy-muted">
        {loading ? 'Loading market candles...' : 'No candles available for this market window.'}
      </div>
    )
  }

  const width = 980
  const height = 390
  const pad = { top: 24, right: 78, bottom: 36, left: 16 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const allValues = [
    ...candles.flatMap((item) => [item.high, item.low]),
    ...fast.filter(Number.isFinite),
    ...slow.filter(Number.isFinite),
  ]
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = max - min || max || 1
  const yMin = min - range * 0.08
  const yMax = max + range * 0.08
  const yRange = yMax - yMin || 1
  const step = plotW / Math.max(candles.length - 1, 1)
  const candleW = Math.max(3, Math.min(10, step * 0.58))
  const xFor = (index) => pad.left + index * step
  const yFor = (value) => pad.top + ((yMax - value) / yRange) * plotH
  const pathFor = (series) => series
    .map((value, index) => Number.isFinite(value) ? `${index === 0 || !Number.isFinite(series[index - 1]) ? 'M' : 'L'}${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}` : '')
    .filter(Boolean)
    .join(' ')
  const markerFor = (trade, index) => {
    const foundIndex = candles.findIndex((item) => item.date === trade.date)
    const dataIndex = foundIndex === -1 ? Math.min(index * 8, candles.length - 1) : foundIndex
    const candle = candles[dataIndex]
    const isBuy = ['BUY', 'SHORT'].includes(trade.type)
    return { x: xFor(dataIndex), y: yFor(trade.price || candle.close), isBuy, label: trade.type }
  }
  const grid = Array.from({ length: 5 }, (_, index) => yMin + (yRange / 4) * index)
  const last = candles[candles.length - 1]

  return (
    <div className="relative h-[390px] overflow-hidden rounded-lg border border-sinergy-border bg-[#070B12]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {grid.map((value) => {
          const y = yFor(value)
          return (
            <g key={value}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#1E2D45" strokeDasharray="4 6" />
              <text x={width - pad.right + 10} y={y + 4} fill="#8CA0BD" fontSize="11" fontFamily="monospace">
                {formatPrice(value)}
              </text>
            </g>
          )
        })}
        {candles.map((item, index) => {
          const x = xFor(index)
          const yOpen = yFor(item.open)
          const yClose = yFor(item.close)
          const yHigh = yFor(item.high)
          const yLow = yFor(item.low)
          const up = item.close >= item.open
          const color = up ? '#14F195' : '#FF4D4D'
          const bodyY = Math.min(yOpen, yClose)
          const bodyH = Math.max(Math.abs(yClose - yOpen), 1.5)
          return (
            <g key={`${item.date}-${index}`}>
              <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1.3" />
              <rect x={x - candleW / 2} y={bodyY} width={candleW} height={bodyH} rx="1" fill={color} opacity="0.88" />
            </g>
          )
        })}
        <path d={pathFor(fast)} fill="none" stroke="#2EA7FF" strokeWidth="2" />
        <path d={pathFor(slow)} fill="none" stroke="#00D4FF" strokeWidth="2" opacity="0.86" />
        {trades.map((trade, index) => {
          const marker = markerFor(trade, index)
          return (
            <g key={`${trade.type}-${trade.date}-${index}`}>
              <circle cx={marker.x} cy={marker.y} r="4" fill={marker.isBuy ? '#14F195' : '#F5A623'} />
              <text x={marker.x + 6} y={marker.y - 7} fill={marker.isBuy ? '#14F195' : '#F5A623'} fontSize="11" fontFamily="monospace" fontWeight="700">
                {marker.isBuy ? 'Buy' : 'Sell'}
              </text>
            </g>
          )
        })}
        {[0, Math.floor(candles.length / 2), candles.length - 1].map((index) => (
          <text key={index} x={xFor(index)} y={height - 12} textAnchor="middle" fill="#8CA0BD" fontSize="11" fontFamily="monospace">
            {candles[index]?.date}
          </text>
        ))}
      </svg>
      <div className="absolute left-4 top-4 space-y-2">
        <div className="rounded-lg border border-sinergy-border bg-sinergy-card/95 px-3 py-2 text-[11px] font-mono text-sinergy-text">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#2EA7FF]" />
          EMA value (period={periods.fast})
        </div>
        <div className="rounded-lg border border-sinergy-border bg-sinergy-card/95 px-3 py-2 text-[11px] font-mono text-sinergy-text">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#00D4FF]" />
          EMA value (period={periods.slow})
        </div>
      </div>
      <div className="absolute right-4 top-4 rounded bg-sinergy-green px-2 py-1 font-mono text-xs font-bold text-sinergy-bg">
        {formatPrice(last.close)}
      </div>
      {candles[0]?.synthetic && (
        <div className="absolute bottom-3 left-4 rounded border border-sinergy-amber/30 bg-sinergy-amber/10 px-2 py-1 text-[10px] font-bold text-sinergy-amber">
          Synthetic preview
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color = 'text-sinergy-text' }) {
  return (
    <div className="rounded-lg border border-sinergy-border bg-sinergy-bg p-4">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-sinergy-muted">{label}</div>
      <div className={`font-mono text-lg font-bold ${color}`}>{value}</div>
    </div>
  )
}

function BacktestStats({ backtest }) {
  const summary = backtest?.summary
  if (!summary) return null
  const pnl = Number(summary.totalPnL || 0)
  const trades = backtest.tokenResults?.reduce((total, item) => total + (item.metrics?.totalTrades || 0), 0) || 0
  const exposure = backtest.tokenResults?.[0]?.metrics?.exposurePct
  return (
    <div className="rounded-b-xl border border-t-0 border-sinergy-border bg-sinergy-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-sinergy-muted">Backtest Stats</div>
          <h2 className="text-base font-bold text-sinergy-text">Backtesting Snapshot</h2>
          <p className="text-xs text-sinergy-muted">Core validation metrics stay connected to the chart signals.</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full border border-sinergy-border px-3 py-1 text-[10px] font-mono text-sinergy-muted">15m</span>
          <span className="rounded-full border border-sinergy-border px-3 py-1 text-[10px] font-mono text-sinergy-muted">{trades} trades</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Net PNL" value={`${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`} color={pnl >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'} />
        <Metric label="Win Rate" value={`${metricNumber(summary.avgWinRate)}%`} />
        <Metric label="Max Drawdown" value={`${metricNumber(summary.maxDrawdown)}%`} color="text-sinergy-amber" />
        <Metric label="Profit Factor" value={metricNumber(summary.profitFactor)} />
        <Metric label="Exposure / Trades" value={`${metricNumber(exposure)}% / ${trades}`} />
      </div>
    </div>
  )
}

function ToolStep({ entry }) {
  const error = normalizeError(entry.error)
  return (
    <div className="border-l border-sinergy-border pl-4">
      <div className="relative rounded-lg border border-sinergy-border bg-sinergy-card/80 p-3">
        <span className={`absolute -left-[21px] top-4 h-3 w-3 rounded-full ${error ? 'bg-sinergy-red' : 'bg-sinergy-green'}`} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-sinergy-text">{entry.step}. {humanizeToolName(entry.tool)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${error ? 'bg-sinergy-red/10 text-sinergy-red' : 'bg-sinergy-green/10 text-sinergy-green'}`}>
            {error ? 'ERROR' : 'COMPLETED'}
          </span>
        </div>
        <p className="mt-1 text-xs text-sinergy-muted">{entry.resultSummary || entry.expectedArtifact || 'Completed.'}</p>
        {entry.reason && <p className="mt-2 border-t border-sinergy-border/60 pt-2 text-[11px] text-sinergy-muted">{entry.reason}</p>}
      </div>
    </div>
  )
}

function LiveToolStep({ event }) {
  return (
    <div className="border-l border-sinergy-border pl-4">
      <div className="relative rounded-lg border border-sinergy-border bg-sinergy-card/70 p-3">
        <span className={`absolute -left-[21px] top-4 h-3 w-3 rounded-full ${event.phase === 'start' ? 'animate-pulse bg-sinergy-amber' : 'bg-sinergy-green'}`} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-sinergy-text">{event.step}. {humanizeToolName(event.tool)}</span>
          <span className="rounded-full bg-sinergy-amber/10 px-2 py-0.5 text-[10px] font-bold text-sinergy-amber">
            {event.phase === 'start' ? 'RUNNING' : 'COMPLETED'}
          </span>
        </div>
        <p className="mt-1 text-xs text-sinergy-muted">{event.message}</p>
      </div>
    </div>
  )
}

export default function StrategyAgent() {
  const navigate = useNavigate()
  const { address } = useWallet()
  const [goal, setGoal] = useState(EXAMPLES[0])
  const [portfolioSize, setPortfolioSize] = useState(1000)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [health, setHealth] = useState(null)
  const [saved, setSaved] = useState(null)
  const [messages, setMessages] = useState([])
  const [liveTools, setLiveTools] = useState([])
  const [liveThinking, setLiveThinking] = useState('')
  const [timeframe, setTimeframe] = useState('15m')
  const [visibleBars, setVisibleBars] = useState(90)
  const [chartCandles, setChartCandles] = useState([])
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState(null)

  useEffect(() => {
    getStrategyAgentHealth()
      .then(setHealth)
      .catch(() => setHealth({ ok: false, modelConfigured: false, tools: [] }))
  }, [])

  useEffect(() => {
    const selected = TIMEFRAMES.find((item) => item.id === timeframe) || TIMEFRAMES[2]
    setVisibleBars((current) => Math.min(Math.max(current, 30), selected.defaultBars))
    let cancelled = false
    async function loadCandles() {
      setChartLoading(true)
      setChartError(null)
      try {
        const candles = await getTokenOHLCV(TOKENS.SOL.address, selected.period)
        if (!cancelled) setChartCandles(candles.length ? candles : syntheticCandles(selected.defaultBars + 40))
      } catch (err) {
        if (!cancelled) {
          setChartCandles(syntheticCandles(selected.defaultBars + 40))
          setChartError(err.message || 'Could not load live candles; showing synthetic preview.')
        }
      } finally {
        if (!cancelled) setChartLoading(false)
      }
    }
    loadCandles()
    return () => {
      cancelled = true
    }
  }, [timeframe])

  const artifacts = result?.artifacts
  const rules = artifacts?.rules
  const validation = artifacts?.validation
  const receipt = artifacts?.receipt
  const backtest = artifacts?.backtest
  const pineScript = artifacts?.pine?.script
  const backtestPrompt = useMemo(() => pineScript || goal, [pineScript, goal])

  const run = async () => {
    const cleanGoal = goal.trim()
    if (!cleanGoal) return
    setRunning(true)
    setError(null)
    setSaved(null)
    setResult(null)
    setLiveTools([])
    setLiveThinking('')
    setMessages([{ id: `user-${Date.now()}`, role: 'user', text: cleanGoal }])
    try {
      const next = await runStrategyAgentStream({
        goal: cleanGoal,
        ownerAddress: address,
        portfolioSize,
        chartBars: visibleBars,
        timeframe,
        onEvent: (event) => {
          if (event.type === 'thinking_delta') {
            setLiveThinking((current) => `${current}${current ? '\n\n' : ''}${event.text}`)
          }
          if (event.type === 'tool') {
            setLiveTools((current) => {
              const key = `${event.step}-${event.tool}`
              const exists = current.some((item) => `${item.step}-${item.tool}` === key)
              if (exists) return current.map((item) => (`${item.step}-${item.tool}` === key ? { ...item, ...event } : item))
              return [...current, event]
            })
          }
        },
      })
      setResult(next)
      setMessages((current) => [...current, { id: next.requestId, role: 'agent', text: next.finalMessage, result: next }])
    } catch (err) {
      setError(err.message || 'Agent request failed')
    } finally {
      setRunning(false)
    }
  }

  const saveGeneratedStrategy = async () => {
    if (!rules || !receipt?.hash) return
    setSaving(true)
    setError(null)
    try {
      const row = await saveStrategy(address || null, goal, rules, validation, receipt.hash, null)
      const localReceipt = {
        id: row?.id || receipt.id,
        prompt: goal,
        parsedRules: rules,
        risk: validation,
        hash: receipt.hash,
        txSignature: null,
        createdAt: Date.now(),
      }
      const existing = JSON.parse(localStorage.getItem('sinergy_receipts') || '[]')
      localStorage.setItem('sinergy_receipts', JSON.stringify([localReceipt, ...existing.filter((item) => item.hash !== receipt.hash)]))
      setSaved(localReceipt.id)
    } catch (err) {
      setError(err.message || 'Could not save generated strategy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-sinergy-border bg-sinergy-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold uppercase tracking-wide text-sinergy-muted">Agent Workspace</span>
            <span className="rounded-lg border border-sinergy-border bg-sinergy-card px-3 py-1 text-xs font-bold text-sinergy-muted">SOL/USDC</span>
            <span className="rounded-lg border border-sinergy-border bg-sinergy-card px-3 py-1 text-xs font-bold text-sinergy-muted">{timeframe}</span>
            <span className="rounded-lg border border-sinergy-border bg-sinergy-card px-3 py-1 text-xs font-bold text-sinergy-muted">{visibleBars} candles</span>
            <span className="rounded-lg border border-sinergy-border bg-sinergy-card px-3 py-1 text-xs font-bold text-sinergy-muted">{health?.tools?.length || 0} tools</span>
          </div>
          <button
            onClick={() => navigate(`/backtest?prompt=${encodeURIComponent(backtestPrompt)}`)}
            className="rounded-lg border border-sinergy-border px-4 py-2 text-xs font-bold text-sinergy-text transition-all hover:border-sinergy-accent/50"
          >
            Edit strategy
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.12fr_1fr]">
        <section>
          <div className="rounded-t-xl border border-sinergy-border bg-sinergy-surface p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {TIMEFRAMES.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setTimeframe(item.id)
                    setVisibleBars(item.defaultBars)
                  }}
                  className={`rounded px-3 py-1 text-xs font-bold ${item.id === timeframe ? 'bg-sinergy-amber/20 text-sinergy-amber' : 'text-sinergy-muted hover:text-sinergy-text'}`}
                >
                  {item.label}
                </button>
              ))}
              <span className="ml-2 rounded bg-sinergy-amber/20 px-3 py-1 text-xs font-bold text-sinergy-amber">Candles</span>
              <span className="text-xs text-sinergy-muted">Line</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setVisibleBars((current) => Math.max(25, Math.round(current * 0.72)))}
                  className="rounded border border-sinergy-border px-2 py-1 text-xs font-bold text-sinergy-muted hover:text-sinergy-text"
                >
                  Zoom +
                </button>
                <button
                  onClick={() => setVisibleBars((current) => Math.min(chartCandles.length || 180, Math.round(current * 1.35)))}
                  className="rounded border border-sinergy-border px-2 py-1 text-xs font-bold text-sinergy-muted hover:text-sinergy-text"
                >
                  Zoom -
                </button>
                <span className="rounded-full border border-sinergy-border px-2 py-1 text-[10px] font-mono text-sinergy-muted">
                  {visibleBars} candles
                </span>
              </div>
            </div>
            <AgentPriceChart
              backtest={backtest}
              script={pineScript}
              chartCandles={chartCandles}
              visibleBars={visibleBars}
              timeframe={timeframe}
              loading={chartLoading}
            />
            {chartError && (
              <div className="mt-2 rounded border border-sinergy-amber/25 bg-sinergy-amber/5 px-3 py-2 text-[11px] text-sinergy-amber">
                {chartError}
              </div>
            )}
          </div>
          <BacktestStats backtest={backtest} />
        </section>

        <section className="flex min-h-[760px] flex-col rounded-xl border border-sinergy-border bg-sinergy-surface">
          <div className="border-b border-sinergy-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-base font-bold uppercase tracking-wide text-sinergy-muted">Agent Workspace</h1>
                <p className="text-xs text-sinergy-muted">Describe a strategy goal and the agent will build, validate, and backtest it.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-sinergy-green/30 bg-sinergy-green/10 px-3 py-1 text-[10px] font-bold text-sinergy-green">Ready</span>
                <span className="rounded-full border border-sinergy-border px-3 py-1 text-[10px] font-mono text-sinergy-muted">{shortHash(address)}</span>
              </div>
            </div>
          </div>

          <div className="border-b border-sinergy-border px-4 py-3">
            <div className="text-xs font-semibold text-sinergy-muted">CONVERSATION</div>
            <div className="text-[11px] text-sinergy-muted">{messages.length} turns - {result?.modelModeUsed || (running ? 'streaming' : 'idle')}</div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-sinergy-border bg-sinergy-bg p-4 text-sm text-sinergy-muted">
                Try: create a strategy, validate it, run a backtest, then ask the agent to improve weak results.
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'ml-auto max-w-3xl' : 'mr-auto max-w-4xl'}>
                <div className={`rounded-xl border p-4 ${message.role === 'user' ? 'border-sinergy-accent/30 bg-sinergy-accent/10' : 'border-sinergy-border bg-sinergy-card/80'}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full border border-sinergy-border px-2 py-0.5 text-[10px] font-bold uppercase text-sinergy-muted">
                      {message.role === 'user' ? 'You' : 'Agent'}
                    </span>
                    <span className="rounded-full bg-sinergy-green/10 px-2 py-0.5 text-[10px] font-bold text-sinergy-green">Run</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-sinergy-text">{message.text}</p>
                </div>
              </div>
            ))}

            {(running || liveTools.length > 0) && (
              <div className="mr-auto max-w-4xl rounded-xl border border-sinergy-border bg-sinergy-card/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full border border-sinergy-border px-2 py-0.5 text-[10px] font-bold uppercase text-sinergy-muted">Agent</span>
                  <span className="rounded-full bg-sinergy-green/10 px-2 py-0.5 text-[10px] font-bold text-sinergy-green">Run</span>
                  {running && <span className="text-[10px] text-sinergy-amber">streaming...</span>}
                </div>
                {liveThinking && (
                  <div className="mb-3 rounded-lg border border-sinergy-amber/25 bg-sinergy-amber/5 px-3 py-2 text-[11px] leading-relaxed text-sinergy-amber">
                    {liveThinking.split('\n').slice(-4).join('\n')}
                  </div>
                )}
                <div className="space-y-3">
                  {liveTools.map((event) => <LiveToolStep key={`${event.step}-${event.tool}`} event={event} />)}
                </div>
              </div>
            )}

            {result && (
              <div className="mr-auto max-w-4xl rounded-xl border border-sinergy-border bg-sinergy-card/80 p-4">
                <div className="space-y-3">
                  {result.toolTrace?.map((entry) => <ToolStep key={`${entry.step}-${entry.tool}`} entry={entry} />)}
                </div>
                {result.warnings?.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {result.warnings.map((warning) => (
                      <div key={warning} className="rounded-lg border border-sinergy-amber/30 bg-sinergy-amber/10 px-3 py-2 text-xs text-sinergy-amber">
                        {warning}
                      </div>
                    ))}
                  </div>
                )}
                {backtest?.summary && (
                  <div className="mt-4 rounded-lg border border-sinergy-green/25 bg-sinergy-green/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-sinergy-text">Backtest Results</div>
                      <div className={`font-mono text-lg font-bold ${backtest.summary.totalPnL >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'}`}>
                        {backtest.summary.totalPnL >= 0 ? '+' : ''}{backtest.summary.totalPnL} USD
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-3">
                      <Metric label="Win Rate" value={`${backtest.summary.avgWinRate}%`} />
                      <Metric label="Trades" value={backtest.tokenResults?.[0]?.metrics?.totalTrades ?? '--'} />
                      <Metric label="Max DD" value={`${backtest.summary.maxDrawdown}%`} />
                      <Metric label="PF" value={backtest.summary.profitFactor} />
                    </div>
                  </div>
                )}
                {receipt && (
                  <div className="mt-4 rounded-lg border border-sinergy-amber/25 bg-sinergy-amber/5 p-3">
                    <h3 className="text-sm font-bold text-sinergy-text">What do you want to do with this strategy?</h3>
                    <p className="mt-1 text-xs text-sinergy-muted">Review it manually, ask the agent for a change, or save the generated receipt.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => navigate(`/backtest?prompt=${encodeURIComponent(backtestPrompt)}`)}
                        className="rounded-lg border border-sinergy-border px-4 py-2 text-xs font-bold text-sinergy-muted transition-all hover:border-sinergy-cyan/50 hover:text-sinergy-cyan"
                      >
                        Manual Edit
                      </button>
                      <button
                        onClick={saveGeneratedStrategy}
                        disabled={saving || !receipt?.hash}
                        className="rounded-lg border border-sinergy-green/40 px-4 py-2 text-xs font-bold text-sinergy-green transition-all hover:bg-sinergy-green/10 disabled:opacity-40"
                      >
                        {saving ? 'Saving...' : 'Save Receipt'}
                      </button>
                      <Link to="/receipts" className="rounded-lg bg-sinergy-green px-4 py-2 text-xs font-bold text-sinergy-bg transition-all hover:bg-sinergy-green/80">
                        View Receipts
                      </Link>
                      {saved && <span className="self-center text-xs text-sinergy-green">Saved locally and to cloud when configured.</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mx-4 mb-3 rounded-lg border border-sinergy-red/30 bg-sinergy-red/10 p-3 text-xs text-sinergy-red">
              {error}
            </div>
          )}

          <div className="border-t border-sinergy-border p-4">
            <div className="flex gap-2">
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                rows={1}
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-sinergy-border bg-sinergy-bg px-3 py-3 text-sm text-sinergy-text placeholder-sinergy-muted/50 transition-all focus:border-sinergy-accent/60"
                placeholder="Describe the strategy you want to build, validate, improve, or continue..."
              />
              <button
                onClick={run}
                disabled={!goal.trim() || running}
                className="h-11 w-11 shrink-0 rounded-full bg-sinergy-amber text-lg font-bold text-sinergy-bg transition-all hover:bg-sinergy-amber/80 disabled:opacity-40"
                title="Run agent"
              >
                {running ? '...' : 'Run'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {PORTFOLIO_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => setPortfolioSize(size)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
                      portfolioSize === size
                        ? 'bg-sinergy-accent text-white'
                        : 'border border-sinergy-border bg-sinergy-bg text-sinergy-muted hover:text-sinergy-text'
                    }`}
                  >
                    ${size.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.slice(0, 2).map((example) => (
                  <button key={example} onClick={() => setGoal(example)} className="rounded-lg border border-sinergy-border px-2 py-1 text-[10px] text-sinergy-muted hover:text-sinergy-text">
                    {example.slice(0, 34)}...
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
