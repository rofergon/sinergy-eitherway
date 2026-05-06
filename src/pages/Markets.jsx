import React, { useEffect, useState, useCallback } from 'react'
import { getTokenOverview, getMultipleTokenPrices } from '../lib/birdeye'
import { TOKEN_LIST } from '../config'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { getHistoricalPrices } from '../lib/birdeye'

const PERIODS = ['1H', '1D', '1W', '1M']

function StatCard({ label, value, sub, color = 'text-sinergy-text' }) {
  return (
    <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
      <div className="text-sinergy-muted text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-bold font-mono text-sm ${color}`}>{value}</div>
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
        ${payload[0]?.value?.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </div>
    </div>
  )
}

export default function Markets() {
  const [selected, setSelected] = useState(TOKEN_LIST[0])
  const [overview, setOverview] = useState(null)
  const [chartData, setChartData] = useState([])
  const [period, setPeriod] = useState('1D')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [allPrices, setAllPrices] = useState({})
  const [pricesLoading, setPricesLoading] = useState(true)

  // Fetch all token prices for the table
  useEffect(() => {
    let cancelled = false
    async function loadAllPrices() {
      setPricesLoading(true)
      try {
        const result = await getMultipleTokenPrices(TOKEN_LIST.map((t) => t.address))
        if (!cancelled) setAllPrices(result)
      } catch {
        // silently fail — table will show dashes
      } finally {
        if (!cancelled) setPricesLoading(false)
      }
    }
    loadAllPrices()
    const interval = setInterval(loadAllPrices, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const fetchData = useCallback(async (token, per) => {
    setLoading(true)
    setError(null)
    try {
      const [ov, hist] = await Promise.allSettled([
        getTokenOverview(token.address),
        getHistoricalPrices(token.address, per, 30),
      ])
      if (ov.status === 'fulfilled') setOverview(ov.value)
      if (hist.status === 'fulfilled' && hist.value?.length) {
        const sorted = [...hist.value].sort((a, b) => a.unixTime - b.unixTime)
        setChartData(
          sorted.map((item) => ({
            time: new Date(item.unixTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            price: item.value,
          }))
        )
      } else {
        setChartData([])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selected, period)
  }, [selected, period, fetchData])

  const fmt = (v, d = 2) => (v == null ? '—' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: d }) : v)
  const fmtUSD = (v) => {
    if (v == null) return '—'
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
    if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`
    return `$${v?.toFixed(4)}`
  }

  const change = overview?.priceChange24hPercent
  const changeColor = change == null ? 'text-sinergy-muted' : change >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-sinergy-text">Markets</h1>
        <p className="text-sinergy-muted text-xs mt-0.5">Live Birdeye price data — Solana ecosystem tokens</p>
      </div>

      {/* Token selector */}
      <div className="flex flex-wrap gap-2">
        {TOKEN_LIST.map((token) => (
          <button
            key={token.address}
            onClick={() => setSelected(token)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              selected.address === token.address
                ? 'border-sinergy-accent bg-sinergy-accent/20 text-sinergy-accent'
                : 'border-sinergy-border bg-sinergy-surface text-sinergy-muted hover:text-sinergy-text hover:border-sinergy-accent/50'
            }`}
          >
            <img src={token.logo} alt={token.symbol} className="w-4 h-4 rounded-full" onError={(e) => { e.target.style.display = 'none' }} />
            {token.symbol}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-sinergy-red/10 border border-sinergy-red/30 rounded-lg p-3 text-sinergy-red text-xs">
          Failed to load data: {error}. Birdeye may rate-limit requests. Please try again in a moment.
        </div>
      )}

      {/* Overview stats */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard
            label="Price"
            value={`$${fmt(overview.price, overview.price > 1 ? 2 : 6)}`}
            color="text-sinergy-text"
          />
          <StatCard
            label="24h Change"
            value={change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
            color={changeColor}
          />
          <StatCard
            label="24h Volume"
            value={fmtUSD(overview.v24hUSD)}
            color="text-sinergy-cyan"
          />
          <StatCard
            label="Market Cap"
            value={fmtUSD(overview.mc)}
            color="text-sinergy-text"
          />
          <StatCard
            label="Liquidity"
            value={fmtUSD(overview.liquidity)}
            color="text-sinergy-text"
          />
          <StatCard
            label="Holders"
            value={overview.holder ? overview.holder.toLocaleString() : '—'}
            color="text-sinergy-text"
          />
        </div>
      )}

      {/* Chart */}
      <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img src={selected.logo} alt={selected.symbol} className="w-5 h-5 rounded-full" onError={(e) => { e.target.style.display = 'none' }} />
            <span className="text-sm font-semibold text-sinergy-text">{selected.name}</span>
            <span className="text-sinergy-muted text-xs">/ USD</span>
          </div>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-all ${
                  period === p
                    ? 'bg-sinergy-accent text-white'
                    : 'text-sinergy-muted hover:text-sinergy-text'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <span className="animate-spin w-6 h-6 border-2 border-sinergy-accent border-t-transparent rounded-full" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sinergy-muted text-sm">
            No price history available for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v > 1000 ? (v / 1000).toFixed(1) + 'K' : v > 1 ? v.toFixed(1) : v.toFixed(4)}`}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#9945FF"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#9945FF' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* All tokens table */}
      <div className="bg-sinergy-surface border border-sinergy-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-sinergy-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sinergy-text">All Tokens</h2>
          {pricesLoading && (
            <span className="text-sinergy-muted text-[10px] flex items-center gap-1">
              <span className="animate-spin w-2.5 h-2.5 border border-sinergy-muted border-t-transparent rounded-full" />
              Updating prices...
            </span>
          )}
        </div>
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 border-b border-sinergy-border/50 bg-sinergy-bg/30">
          <span className="text-[10px] text-sinergy-muted uppercase tracking-wider">Token</span>
          <span className="text-[10px] text-sinergy-muted uppercase tracking-wider text-right w-20">Price</span>
          <span className="text-[10px] text-sinergy-muted uppercase tracking-wider text-right w-16">24h</span>
          <span className="text-[10px] text-sinergy-muted uppercase tracking-wider text-right w-16">Chart</span>
        </div>
        <div className="divide-y divide-sinergy-border">
          {TOKEN_LIST.map((token) => {
            const p = allPrices[token.address]
            const price = p?.value
            const change24h = p?.priceChange24h
            const isSelected = selected.address === token.address
            const fmtPrice = (v) => {
              if (v == null) return '—'
              if (v >= 1000) return `${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
              if (v >= 1) return `${v.toFixed(2)}`
              return `${v.toFixed(6)}`
            }
            return (
              <button
                key={token.address}
                onClick={() => setSelected(token)}
                className={`w-full grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3 hover:bg-sinergy-bg/50 transition-all text-left ${isSelected ? 'bg-sinergy-accent/5 border-l-2 border-sinergy-accent' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                  <div>
                    <div className="text-sm font-semibold text-sinergy-text">{token.symbol}</div>
                    <div className="text-[10px] text-sinergy-muted">{token.name}</div>
                  </div>
                </div>
                {/* Price */}
                <div className="text-right w-20">
                  {pricesLoading && !price ? (
                    <div className="h-3.5 w-14 bg-sinergy-border/40 rounded animate-pulse ml-auto" />
                  ) : (
                    <div className="text-sm font-mono font-semibold text-sinergy-text">{fmtPrice(price)}</div>
                  )}
                </div>
                {/* 24h change */}
                <div className="text-right w-16">
                  {pricesLoading && change24h == null ? (
                    <div className="h-3 w-10 bg-sinergy-border/40 rounded animate-pulse ml-auto" />
                  ) : (
                    <div className={`text-xs font-mono font-semibold ${
                      change24h == null ? 'text-sinergy-muted' :
                      change24h >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'
                    }`}>
                      {change24h == null ? '—' : `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`}
                    </div>
                  )}
                </div>
                {/* Sparkline indicator bar */}
                <div className="w-16 flex items-center justify-end">
                  {change24h != null && (
                    <div className={`h-1 rounded-full ${change24h >= 0 ? 'bg-sinergy-green' : 'bg-sinergy-red'}`}
                      style={{ width: `${Math.min(Math.abs(change24h) * 4, 64)}px` }}
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
