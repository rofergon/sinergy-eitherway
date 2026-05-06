import { BIRDEYE_API_KEY, PROXY_API } from '../config'

const BIRDEYE_BASE = 'https://public-api.birdeye.so'

// Cache to avoid hammering the API.
const cache = new Map()
const CACHE_TTL = 45_000

const CHART_PERIODS = {
  '1H': { candleType: '1m', seconds: 60 * 60, limit: 60 },
  '1D': { candleType: '15m', seconds: 24 * 60 * 60, limit: 96 },
  '1W': { candleType: '1H', seconds: 7 * 24 * 60 * 60, limit: 168 },
  '1M': { candleType: '4H', seconds: 30 * 24 * 60 * 60, limit: 180 },
}

function cached(key, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data)
  return fn().then((data) => {
    cache.set(key, { data, ts: Date.now() })
    return data
  })
}

async function birdeyeFetch(path, options = {}) {
  const url = `${BIRDEYE_BASE}${path}`
  const headers = {
    Accept: 'application/json',
    'x-chain': options.chain || 'solana',
  }

  if (BIRDEYE_API_KEY) headers['X-API-KEY'] = BIRDEYE_API_KEY

  const directRes = BIRDEYE_API_KEY
    ? await fetch(url, { headers }).catch((error) => ({ directError: error }))
    : null

  const res = directRes && !directRes.directError
    ? directRes
    : await fetch(PROXY_API(url), { headers: { Accept: 'application/json' } })

  if (!res.ok) throw new Error(`Birdeye ${res.status}: ${path}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.message || 'Birdeye error')
  return json.data
}

function normalizeCandle(item) {
  const time = item.unixTime ?? item.unix_time ?? item.time
  const open = item.o ?? item.open
  const high = item.h ?? item.high
  const low = item.l ?? item.low
  const close = item.c ?? item.close ?? item.value
  const volume = item.v ?? item.volume

  if ([time, open, high, low, close].some((v) => v == null || Number.isNaN(Number(v)))) {
    return null
  }

  return {
    unixTime: Number(time),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: volume == null ? null : Number(volume),
  }
}

export async function getTokenPrice(address) {
  return cached(`price:${address}`, () =>
    birdeyeFetch(`/defi/price?address=${address}`)
  )
}

export async function getTokenOverview(address) {
  return cached(`overview:${address}`, () =>
    birdeyeFetch(`/defi/token_overview?address=${address}`)
  )
}

export async function getTokenOHLCV(address, period = '1D') {
  return cached(`ohlcv:${address}:${period}`, async () => {
    const config = CHART_PERIODS[period] || CHART_PERIODS['1D']
    const now = Math.floor(Date.now() / 1000)
    const params = new URLSearchParams({
      address,
      type: config.candleType,
      currency: 'usd',
      time_from: String(now - config.seconds),
      time_to: String(now),
    })
    const data = await birdeyeFetch(`/defi/ohlcv?${params.toString()}`)

    return (data?.items || [])
      .map(normalizeCandle)
      .filter(Boolean)
      .sort((a, b) => a.unixTime - b.unixTime)
      .slice(-config.limit)
  })
}

// The backtest engine expects [{ unixTime, value }], so expose OHLCV closes in that shape.
export async function getHistoricalPrices(address, type = '1D', limit = 30) {
  return cached(`history:${address}:${type}:${limit}`, async () => {
    const now = Math.floor(Date.now() / 1000)
    const candleType = type === '1H' ? '1H' : '1D'
    const secondsPerCandle = candleType === '1H' ? 3600 : 86400
    const params = new URLSearchParams({
      address,
      type: candleType,
      currency: 'usd',
      time_from: String(now - secondsPerCandle * limit),
      time_to: String(now),
    })
    const data = await birdeyeFetch(`/defi/ohlcv?${params.toString()}`)

    return (data?.items || [])
      .map(normalizeCandle)
      .filter(Boolean)
      .sort((a, b) => a.unixTime - b.unixTime)
      .slice(-limit)
      .map((item) => ({ unixTime: item.unixTime, value: item.close }))
  })
}

export async function getMultipleTokenPrices(addresses) {
  const results = {}
  await Promise.allSettled(
    addresses.map(async (addr) => {
      try {
        const data = await getTokenPrice(addr)
        results[addr] = data
      } catch {
        results[addr] = null
      }
    })
  )
  return results
}
