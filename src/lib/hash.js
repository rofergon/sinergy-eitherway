/**
 * SHA-256 hash of strategy data using Web Crypto API.
 * Returns hex string.
 */
export async function hashStrategy(strategyData) {
  const input = JSON.stringify({
    prompt: strategyData.prompt,
    tokens: strategyData.tokens?.map((t) => t.address),
    rules: strategyData.parsedRules,
    metrics: strategyData.metrics,
    timestamp: Math.floor(Date.now() / 60000), // minute-level granularity
  })

  const msgBuffer = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function shortHash(hash) {
  if (!hash) return ''
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`
}

export function formatTimestamp(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
