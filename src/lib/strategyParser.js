import { TOKENS, TOKEN_LIST } from '../config'

/**
 * Parse a natural-language DeFi strategy prompt into structured rules.
 */
export function parseStrategy(prompt) {
  const lower = prompt.toLowerCase()

  // --- Token Detection ---
  const tokens = TOKEN_LIST.filter(
    (t) =>
      lower.includes(t.symbol.toLowerCase()) ||
      lower.includes(t.name.toLowerCase())
  )
  if (tokens.length === 0) tokens.push(TOKENS.SOL, TOKENS.USDC)

  // --- Action Detection ---
  const actions = []
  if (/\b(buy|long|accumulate|dca|dollar.cost)\b/.test(lower)) actions.push('BUY')
  if (/\b(sell|short|exit|take.profit|tp)\b/.test(lower)) actions.push('SELL')
  if (/\b(hold|hodl|wait|patience)\b/.test(lower)) actions.push('HOLD')
  if (/\b(swap|exchange|trade)\b/.test(lower)) actions.push('SWAP')
  if (/\b(lend|supply|deposit|stake|yield|earn)\b/.test(lower)) actions.push('YIELD')
  if (/\b(borrow|leverage)\b/.test(lower)) actions.push('BORROW')
  if (actions.length === 0) actions.push('BUY')

  // --- Price Triggers ---
  const triggers = []
  const priceDropMatch = lower.match(/(?:drop|dip|fall|down|below|under)\s*(?:by\s*)?(\d+(?:\.\d+)?)\s*%/)
  if (priceDropMatch) {
    triggers.push({ type: 'PRICE_DROP', value: parseFloat(priceDropMatch[1]), direction: 'below' })
  }
  const priceRiseMatch = lower.match(/(?:rise|pump|gain|above|up|over)\s*(?:by\s*)?(\d+(?:\.\d+)?)\s*%/)
  if (priceRiseMatch) {
    triggers.push({ type: 'PRICE_RISE', value: parseFloat(priceRiseMatch[1]), direction: 'above' })
  }
  const rsiMatch = lower.match(/rsi\s*(?:below|under|<)?\s*(\d+)/)
  if (rsiMatch) {
    triggers.push({ type: 'RSI', value: parseFloat(rsiMatch[1]), condition: 'below' })
  }
  const maMatch = lower.match(/(?:ma|ema|sma)\s*(\d+)/)
  if (maMatch) {
    triggers.push({ type: 'MA_CROSS', period: parseInt(maMatch[1]) })
  }

  // --- Allocation ---
  const allocationMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?(?:portfolio|wallet|holdings|funds)/)
  const allocation = allocationMatch ? parseFloat(allocationMatch[1]) : 10

  // --- Stop Loss / Take Profit ---
  const stopLossMatch = lower.match(/stop.?loss\s*(?:at\s*)?(\d+(?:\.\d+)?)\s*%/)
  const stopLoss = stopLossMatch ? parseFloat(stopLossMatch[1]) : 10

  const takeProfitMatch = lower.match(/take.?profit\s*(?:at\s*)?(\d+(?:\.\d+)?)\s*%/)
  const takeProfit = takeProfitMatch ? parseFloat(takeProfitMatch[1]) : 30

  // --- Risk Level ---
  let riskLevel = 'medium'
  if (/\b(conservative|safe|low.risk|minimal.risk)\b/.test(lower)) riskLevel = 'low'
  if (/\b(aggressive|high.risk|max.risk|degen)\b/.test(lower)) riskLevel = 'high'
  if (allocation > 30 || (triggers.some(t => t.type === 'PRICE_DROP' && t.value > 20))) riskLevel = 'high'
  if (allocation < 10 && stopLoss < 8) riskLevel = 'low'

  // --- Time Horizon ---
  let timeHorizon = 'medium-term'
  if (/\b(daily|day\s*trade|scalp|short.term|swing)\b/.test(lower)) timeHorizon = 'short-term'
  if (/\b(long.term|hold|months?|years?|accumulate)\b/.test(lower)) timeHorizon = 'long-term'

  // --- Rebalancing ---
  let rebalance = null
  if (/\b(rebalance|rebalancing)\b/.test(lower)) {
    const freqMatch = lower.match(/rebalance\s+(?:every\s+)?(\w+)/)
    rebalance = freqMatch?.[1] || 'monthly'
  }

  // --- DCA ---
  const isDCA = /\b(dca|dollar.cost|average.in)\b/.test(lower)
  const dcaFreqMatch = lower.match(/(?:dca|average.in|invest)\s+(?:every\s+)?(\w+)/)
  const dcaFrequency = isDCA ? (dcaFreqMatch?.[1] || 'weekly') : null

  return {
    tokens: tokens.slice(0, 4),
    actions,
    triggers,
    allocation,
    stopLoss,
    takeProfit,
    riskLevel,
    timeHorizon,
    rebalance,
    isDCA,
    dcaFrequency,
    summary: buildSummary({ tokens, actions, triggers, allocation, stopLoss, takeProfit, timeHorizon, isDCA, dcaFrequency }),
  }
}

function buildSummary({ tokens, actions, triggers, allocation, stopLoss, takeProfit, timeHorizon, isDCA, dcaFrequency }) {
  const tokenNames = tokens.map((t) => t.symbol).join(', ')
  const actionStr = actions.join(' + ')
  let summary = `${actionStr} ${tokenNames} | ${allocation}% allocation | ${timeHorizon}`
  if (stopLoss) summary += ` | SL: ${stopLoss}%`
  if (takeProfit) summary += ` | TP: ${takeProfit}%`
  if (isDCA && dcaFrequency) summary += ` | DCA ${dcaFrequency}`
  if (triggers.length > 0) {
    const tStr = triggers
      .map((t) => {
        if (t.type === 'PRICE_DROP') return `on ${t.value}% dip`
        if (t.type === 'PRICE_RISE') return `on ${t.value}% rally`
        if (t.type === 'RSI') return `RSI < ${t.value}`
        if (t.type === 'MA_CROSS') return `MA${t.period} cross`
        return ''
      })
      .join(', ')
    summary += ` | Triggers: ${tStr}`
  }
  return summary
}

/**
 * Validate risk constraints on a parsed strategy.
 */
export function validateRisk(rules) {
  const checks = []

  checks.push({
    id: 'allocation',
    label: 'Position Sizing',
    description: `Allocating ${rules.allocation}% of portfolio`,
    pass: rules.allocation <= 25,
    severity: rules.allocation > 50 ? 'critical' : rules.allocation > 25 ? 'warning' : 'ok',
    recommendation:
      rules.allocation > 25
        ? `Reduce allocation to ≤ 25% to limit concentration risk. Current: ${rules.allocation}%`
        : 'Allocation is within safe range.',
  })

  checks.push({
    id: 'stop_loss',
    label: 'Stop Loss',
    description: `Stop loss at ${rules.stopLoss}%`,
    pass: rules.stopLoss <= 20,
    severity: !rules.stopLoss ? 'critical' : rules.stopLoss > 20 ? 'warning' : 'ok',
    recommendation:
      !rules.stopLoss
        ? 'No stop loss defined. Add a stop loss of 5-15% to protect capital.'
        : rules.stopLoss > 20
        ? `Stop loss too wide at ${rules.stopLoss}%. Consider tightening to 10-15%.`
        : 'Stop loss is well-defined.',
  })

  checks.push({
    id: 'reward_ratio',
    label: 'Risk/Reward Ratio',
    description: `TP ${rules.takeProfit}% vs SL ${rules.stopLoss}%`,
    pass: rules.takeProfit / rules.stopLoss >= 2,
    severity: rules.takeProfit / rules.stopLoss < 1.5 ? 'warning' : 'ok',
    recommendation:
      rules.takeProfit / rules.stopLoss < 2
        ? `Risk/reward ratio is ${(rules.takeProfit / rules.stopLoss).toFixed(1)}:1. Aim for at least 2:1.`
        : `Good R/R ratio of ${(rules.takeProfit / rules.stopLoss).toFixed(1)}:1.`,
  })

  checks.push({
    id: 'diversification',
    label: 'Diversification',
    description: `${rules.tokens.length} token${rules.tokens.length > 1 ? 's' : ''} in strategy`,
    pass: rules.tokens.length >= 2,
    severity: rules.tokens.length === 1 ? 'warning' : 'ok',
    recommendation:
      rules.tokens.length === 1
        ? 'Single-token strategy increases volatility. Consider diversifying across 2-3 tokens.'
        : 'Strategy includes multiple tokens for diversification.',
  })

  checks.push({
    id: 'risk_level',
    label: 'Overall Risk',
    description: `Risk level: ${rules.riskLevel.toUpperCase()}`,
    pass: rules.riskLevel !== 'high',
    severity: rules.riskLevel === 'high' ? 'warning' : 'ok',
    recommendation:
      rules.riskLevel === 'high'
        ? 'High-risk strategy detected. Ensure you can afford to lose the allocated amount.'
        : 'Risk level is acceptable for most investors.',
  })

  checks.push({
    id: 'triggers',
    label: 'Entry Triggers',
    description: rules.triggers.length > 0 ? `${rules.triggers.length} trigger(s) defined` : 'No explicit triggers',
    pass: rules.triggers.length > 0 || rules.isDCA,
    severity: rules.triggers.length === 0 && !rules.isDCA ? 'warning' : 'ok',
    recommendation:
      rules.triggers.length === 0 && !rules.isDCA
        ? 'No entry triggers defined. Add price drop %, RSI levels, or DCA frequency.'
        : 'Entry triggers are defined.',
  })

  const passed = checks.filter((c) => c.pass).length
  const score = Math.round((passed / checks.length) * 100)

  return { checks, score, passed, total: checks.length }
}
