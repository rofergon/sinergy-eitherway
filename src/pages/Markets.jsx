import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getMultipleTokenPrices, getTokenOHLCV, getTokenOverview } from '../lib/birdeye'
import { TOKEN_LIST } from '../config'

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

function formatPrice(value, digits = 4) {
  if (value == null) return '--'
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function formatUSD(value) {
  if (value == null) return '--'
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
  return `$${value.toFixed(4)}`
}

function timeLabel(unixTime, period) {
  const date = new Date(unixTime * 1000)
  if (period === '1H' || period === '1D') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CandlestickChart({ data, period }) {
  const svgRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  if (!data.length) return null

  const width = 1000
  const height = 320
  const pad = { top: 18, right: 72, bottom: 34, left: 12 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const values = data.flatMap((item) => [item.high, item.low])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || max || 1
  const yMin = min - range * 0.08
  const yMax = max + range * 0.08
  const yRange = yMax - yMin || 1
  const step = plotW / Math.max(data.length - 1, 1)
  const candleW = Math.max(3, Math.min(10, step * 0.58))
  const grid = Array.from({ length: 5 }, (_, i) => yMin + (yRange / 4) * i)

  const xFor = (index) => pad.left + index * step
  const yFor = (value) => pad.top + ((yMax - value) / yRange) * plotH
  const hoveredIndex = hovered == null ? null : Math.max(0, Math.min(data.length - 1, hovered))
  const active = hoveredIndex == null ? null : data[hoveredIndex]

  const handleMove = (event) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((event.clientX - rect.left) / rect.width) * width
    const index = Math.round((x - pad.left) / step)
    setHovered(Math.max(0, Math.min(data.length - 1, index)))
  }

  return (
    <div className="relative h-[320px] w-full select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible"
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(null)}
        role="img"
        aria-label="OHLCV candlestick chart"
      >
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {grid.map((value) => {
          const y = yFor(value)
          return (
            <g key={value}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#1E2D45" strokeDasharray="4 6" />
              <text x={width - pad.right + 10} y={y + 4} fill="#6B7280" fontSize="11" fontFamily="monospace">
                ${formatPrice(value)}
              </text>
            </g>
          )
        })}
        {data.map((item, index) => {
          const x = xFor(index)
          const yOpen = yFor(item.open)
          const yClose = yFor(item.close)
          const yHigh = yFor(item.high)
          const yLow = yFor(item.low)
          const up = item.close >= item.open
          const color = up ? '#14F195' : '#EF4444'
          const bodyY = Math.min(yOpen, yClose)
          const bodyH = Math.max(Math.abs(yClose - yOpen), 1.5)
          return (
            <g key={`${item.unixTime}-${index}`}>
              <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1.4" />
              <rect
                x={x - candleW / 2}
                y={bodyY}
                width={candleW}
                height={bodyH}
                rx="1"
                fill={up ? '#14F195' : '#EF4444'}
                opacity={hoveredIndex === index ? 1 : 0.86}
              />
            </g>
          )
        })}
        {active && (
          <g>
            <line x1={xFor(hoveredIndex)} x2={xFor(hoveredIndex)} y1={pad.top} y2={height - pad.bottom} stroke="#9945FF" strokeDasharray="4 4" />
            <circle cx={xFor(hoveredIndex)} cy={yFor(active.close)} r="4" fill="#9945FF" />
          </g>
        )}
        {[0, Math.floor(data.length / 2), data.length - 1].map((index) => (
          <text key={index} x={xFor(index)} y={height - 10} textAnchor="middle" fill="#6B7280" fontSize="11" fontFamily="monospace">
            {timeLabel(data[index].unixTime, period)}
          </text>
        ))}
      </svg>
      {active && (
        <div className="absolute left-3 top-3 grid grid-cols-5 gap-2 rounded-lg border border-sinergy-border bg-sinergy-bg/95 px-3 py-2 text-[10px] font-mono shadow-xl">
          <span className="text-sinergy-muted">{timeLabel(active.unixTime, period)}</span>
          <span className="text-sinergy-text">O ${formatPrice(active.open)}</span>
          <span className="text-sinergy-text">H ${formatPrice(active.high)}</span>
          <span className="text-sinergy-text">L ${formatPrice(active.low)}</span>
          <span className={active.close >= active.open ? 'text-sinergy-green' : 'text-sinergy-red'}>C ${formatPrice(active.close)}</span>
        </div>
      )}
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

  useEffect(() => {
    let cancelled = false
    async function loadAllPrices() {
      setPricesLoading(true)
      try {
        const result = await getMultipleTokenPrices(TOKEN_LIST.map((t) => t.address))
        if (!cancelled) setAllPrices(result)
      } catch {
        if (!cancelled) setAllPrices({})
      } finally {
        if (!cancelled) setPricesLoading(false)
      }
    }
    loadAllPrices()
    const interval = setInterval(loadAllPrices, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const fetchData = useCallback(async (token, per) => {
    setLoading(true)
    setError(null)
    try {
      const [ov, candles] = await Promise.allSettled([
        getTokenOverview(token.address),
        getTokenOHLCV(token.address, per),
      ])

      if (ov.status === 'fulfilled') setOverview(ov.value)
      if (candles.status === 'fulfilled') setChartData(candles.value)
      if (candles.status === 'rejected') throw candles.reason
    } catch (e) {
      setChartData([])
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selected, period)
  }, [selected, period, fetchData])

  const change = overview?.priceChange24hPercent
  const changeColor = change == null ? 'text-sinergy-muted' : change >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'
  const lastCandle = chartData[chartData.length - 1]

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-sinergy-text">Markets</h1>
        <p className="text-sinergy-muted text-xs mt-0.5">Live Birdeye OHLCV data for Solana ecosystem tokens</p>
      </div>

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

      {error && (
        <div className="bg-sinergy-red/10 border border-sinergy-red/30 rounded-lg p-3 text-sinergy-red text-xs">
          Failed to load Birdeye data: {error}. Check the API key and rate limits.
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard label="Price" value={`$${formatPrice(overview.price, overview.price > 1 ? 2 : 6)}`} />
          <StatCard
            label="24h Change"
            value={change == null ? '--' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
            color={changeColor}
          />
          <StatCard label="24h Volume" value={formatUSD(overview.v24hUSD)} color="text-sinergy-cyan" />
          <StatCard label="Market Cap" value={formatUSD(overview.mc)} />
          <StatCard label="Liquidity" value={formatUSD(overview.liquidity)} />
          <StatCard label="Holders" value={overview.holder ? overview.holder.toLocaleString() : '--'} />
        </div>
      )}

      <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <img src={selected.logo} alt={selected.symbol} className="w-5 h-5 rounded-full" onError={(e) => { e.target.style.display = 'none' }} />
            <span className="text-sm font-semibold text-sinergy-text truncate">{selected.name}</span>
            <span className="text-sinergy-muted text-xs">/ USD</span>
            {lastCandle && (
              <span className={`text-xs font-mono ${lastCandle.close >= lastCandle.open ? 'text-sinergy-green' : 'text-sinergy-red'}`}>
                ${formatPrice(lastCandle.close, 6)}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-all ${
                  period === p ? 'bg-sinergy-accent text-white' : 'text-sinergy-muted hover:text-sinergy-text'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-[320px] flex items-center justify-center">
            <span className="animate-spin w-6 h-6 border-2 border-sinergy-accent border-t-transparent rounded-full" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-sinergy-muted text-sm">
            No OHLCV candles available for this period
          </div>
        ) : (
          <CandlestickChart data={chartData} period={period} />
        )}
      </div>

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
            return (
              <button
                key={token.address}
                onClick={() => setSelected(token)}
                className={`w-full grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3 hover:bg-sinergy-bg/50 transition-all text-left ${isSelected ? 'bg-sinergy-accent/5 border-l-2 border-sinergy-accent' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-sinergy-text">{token.symbol}</div>
                    <div className="text-[10px] text-sinergy-muted truncate">{token.name}</div>
                  </div>
                </div>
                <div className="text-right w-20">
                  {pricesLoading && !price ? (
                    <div className="h-3.5 w-14 bg-sinergy-border/40 rounded animate-pulse ml-auto" />
                  ) : (
                    <div className="text-sm font-mono font-semibold text-sinergy-text">${formatPrice(price, 6)}</div>
                  )}
                </div>
                <div className="text-right w-16">
                  {pricesLoading && change24h == null ? (
                    <div className="h-3 w-10 bg-sinergy-border/40 rounded animate-pulse ml-auto" />
                  ) : (
                    <div className={`text-xs font-mono font-semibold ${
                      change24h == null ? 'text-sinergy-muted' : change24h >= 0 ? 'text-sinergy-green' : 'text-sinergy-red'
                    }`}>
                      {change24h == null ? '--' : `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`}
                    </div>
                  )}
                </div>
                <div className="w-16 flex items-center justify-end">
                  {change24h != null && (
                    <div
                      className={`h-1 rounded-full ${change24h >= 0 ? 'bg-sinergy-green' : 'bg-sinergy-red'}`}
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
