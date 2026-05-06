import { AGENT_URL } from '../config'

export async function runStrategyAgent({ goal, ownerAddress, portfolioSize = 1000, chartBars, timeframe }) {
  const res = await fetch(`${AGENT_URL}/strategy/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal,
      ownerAddress: ownerAddress || undefined,
      portfolioSize,
      chartBars,
      timeframe,
    }),
  })

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error?.message || `Agent request failed (${res.status})`)
  }
  return json.result
}

export async function runStrategyAgentStream({ goal, ownerAddress, portfolioSize = 1000, chartBars, timeframe, onEvent }) {
  const res = await fetch(`${AGENT_URL}/strategy/run/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal,
      ownerAddress: ownerAddress || undefined,
      portfolioSize,
      chartBars,
      timeframe,
    }),
  })

  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error?.message || `Agent stream failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''

    for (const chunk of chunks) {
      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '))
      if (!dataLine) continue
      const event = JSON.parse(dataLine.slice(6))
      onEvent?.(event)
      if (event.type === 'done') finalResult = event.result
      if (event.type === 'error') throw new Error(event.message)
    }
  }

  if (!finalResult) throw new Error('Agent stream ended without a final result.')
  return finalResult
}

export async function getStrategyAgentHealth() {
  const res = await fetch(`${AGENT_URL}/health`)
  if (!res.ok) throw new Error(`Agent health failed (${res.status})`)
  return res.json()
}
