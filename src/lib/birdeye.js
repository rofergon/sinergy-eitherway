import { PROXY_API } from '../config'

const BIRDEYE_BASE = 'https://public-api.birdeye.so'

// Cache to avoid hammering the API
const cache = new Map()
const CACHE_TTL = 45_000 // 45 seconds

function cached(key, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data)
  return fn().then((data) => {
    cache.set(key, { data, ts: Date.now() })
    return data
  })
}

async function birdeyeFetch(path) {
  const url = `${BIRDEYE_BASE}${path}`
  const res = await fetch(PROXY_API(url), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Birdeye ${res.status}: ${path}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.message || 'Birdeye error')
  return json.data
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

// Fetch historical OHLCV — type can be "1D","1W","1M"
export async function getHistoricalPrices(address, type = '1D', limit = 30) {
  return cached(`history:${address}:${type}:${limit}`, async () => {
    const now = Math.floor(Date.now() / 1000)
    const secondsMap = { '1H': 3600, '1D': 86400, '1W': 604800, '1M': 2592000 }
    const interval = secondsMap[type] || 86400
    const timeFrom = now - interval * limit
    const path = `/defi/history_price?address=${address}&address_type=token&type=${type}&time_from=${timeFrom}&time_to=${now}`
    const data = await birdeyeFetch(path)
    return data?.items || []
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
