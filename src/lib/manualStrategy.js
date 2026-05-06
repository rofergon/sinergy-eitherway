export const MANUAL_OPERATORS = ['>', '>=', '<', '<=', '==', '!=', 'crosses_above', 'crosses_below']
export const MANUAL_PRICE_FIELDS = ['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4']
export const MANUAL_TIMEFRAMES = ['1H', '1D', '1W', '1M']

export const MANUAL_INDICATORS = [
  { kind: 'ema', label: 'EMA', fn: 'ta.ema', output: 'value', params: [{ key: 'period', label: 'Period', defaultValue: 20 }, { key: 'source', label: 'Source', defaultValue: 'close' }] },
  { kind: 'sma', label: 'SMA', fn: 'ta.sma', output: 'value', params: [{ key: 'period', label: 'Period', defaultValue: 20 }, { key: 'source', label: 'Source', defaultValue: 'close' }] },
  { kind: 'rsi', label: 'RSI', fn: 'ta.rsi', output: 'value', params: [{ key: 'period', label: 'Period', defaultValue: 14 }, { key: 'source', label: 'Source', defaultValue: 'close' }] },
  { kind: 'roc', label: 'ROC', fn: 'ta.roc', output: 'value', params: [{ key: 'period', label: 'Period', defaultValue: 9 }, { key: 'source', label: 'Source', defaultValue: 'close' }] },
  { kind: 'atr', label: 'ATR', fn: 'ta.atr', output: 'value', params: [{ key: 'period', label: 'Period', defaultValue: 14 }] },
  { kind: 'vwap', label: 'VWAP', fn: 'ta.vwap', output: 'value', params: [] },
  { kind: 'highest', label: 'Rolling High', fn: 'ta.highest', output: 'value', params: [{ key: 'period', label: 'Lookback', defaultValue: 20 }, { key: 'source', label: 'Source', defaultValue: 'high' }] },
  { kind: 'lowest', label: 'Rolling Low', fn: 'ta.lowest', output: 'value', params: [{ key: 'period', label: 'Lookback', defaultValue: 20 }, { key: 'source', label: 'Source', defaultValue: 'low' }] },
]

export function makeOperand(type = 'price') {
  if (type === 'indicator') {
    return { type: 'indicator', indicator: 'ema', source: 'close', period: 20, barsAgo: 0 }
  }
  if (type === 'constant') return { type: 'constant', value: 0 }
  return { type: 'price', field: 'close', barsAgo: 0 }
}

export function makeRule(left = makeOperand('indicator'), operator = '>', right = makeOperand('constant')) {
  return { id: crypto.randomUUID(), left, operator, right }
}

export function makeGroup(rules = [makeRule()]) {
  return { id: crypto.randomUUID(), rules }
}

export function createManualDraft(templateId = 'ema-rsi') {
  const base = {
    name: 'Manual Strategy',
    tokenSymbol: 'SOL',
    timeframe: '1D',
    enabledSides: ['long'],
    allocation: 100,
    stopLoss: 10,
    takeProfit: 30,
    trailingStop: 0,
    maxBars: 0,
    entryRules: { long: [], short: [] },
    exitRules: { long: [], short: [] },
  }

  if (templateId === 'rsi-reversion') {
    return {
      ...base,
      name: 'RSI Mean Reversion',
      entryRules: {
        long: [makeGroup([makeRule({ type: 'indicator', indicator: 'rsi', source: 'close', period: 14, barsAgo: 0 }, '<=', { type: 'constant', value: 30 })])],
        short: [],
      },
      exitRules: {
        long: [makeGroup([makeRule({ type: 'indicator', indicator: 'rsi', source: 'close', period: 14, barsAgo: 0 }, '>=', { type: 'constant', value: 55 })])],
        short: [],
      },
    }
  }

  if (templateId === 'breakout') {
    return {
      ...base,
      name: 'Range Breakout',
      enabledSides: ['long', 'short'],
      stopLoss: 8,
      takeProfit: 24,
      entryRules: {
        long: [makeGroup([makeRule(makeOperand('price'), 'crosses_above', { type: 'indicator', indicator: 'highest', source: 'high', period: 20, barsAgo: 1 })])],
        short: [makeGroup([makeRule(makeOperand('price'), 'crosses_below', { type: 'indicator', indicator: 'lowest', source: 'low', period: 20, barsAgo: 1 })])],
      },
      exitRules: {
        long: [makeGroup([makeRule(makeOperand('price'), '<=', { type: 'indicator', indicator: 'ema', source: 'close', period: 10, barsAgo: 0 })])],
        short: [makeGroup([makeRule(makeOperand('price'), '>=', { type: 'indicator', indicator: 'ema', source: 'close', period: 10, barsAgo: 0 })])],
      },
    }
  }

  return {
    ...base,
    name: 'EMA + RSI Swing',
    entryRules: {
      long: [makeGroup([
        makeRule({ type: 'indicator', indicator: 'ema', source: 'close', period: 9, barsAgo: 0 }, 'crosses_above', { type: 'indicator', indicator: 'ema', source: 'close', period: 21, barsAgo: 0 }),
        makeRule({ type: 'indicator', indicator: 'rsi', source: 'close', period: 14, barsAgo: 0 }, '<', { type: 'constant', value: 70 }),
      ])],
      short: [],
    },
    exitRules: {
      long: [makeGroup([
        makeRule({ type: 'indicator', indicator: 'ema', source: 'close', period: 9, barsAgo: 0 }, 'crosses_below', { type: 'indicator', indicator: 'ema', source: 'close', period: 21, barsAgo: 0 }),
      ])],
      short: [],
    },
  }
}

export const MANUAL_TEMPLATES = [
  { id: 'ema-rsi', name: 'EMA + RSI Swing', description: 'Momentum entry with RSI filter and EMA exit.' },
  { id: 'rsi-reversion', name: 'RSI Mean Reversion', description: 'Buy oversold RSI and exit near neutral.' },
  { id: 'breakout', name: 'Range Breakout', description: 'Trade rolling high/low breaks on both sides.' },
]

function indicatorDef(kind) {
  return MANUAL_INDICATORS.find((item) => item.kind === kind) || MANUAL_INDICATORS[0]
}

function normalizeName(input, fallback) {
  const safe = String(input || fallback)
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[A-Za-z_]/.test(safe) ? safe : `v_${safe}`
}

function operandKey(operand) {
  return JSON.stringify({
    type: operand.type,
    field: operand.field,
    indicator: operand.indicator,
    source: operand.source,
    period: Number(operand.period || 0),
    barsAgo: Number(operand.barsAgo || 0),
  })
}

function indicatorExpression(operand) {
  const def = indicatorDef(operand.indicator)
  if (def.kind === 'vwap') return 'ta.vwap()'
  if (def.kind === 'atr') return `ta.atr(${Number(operand.period || 14)})`
  return `${def.fn}(${operand.source || 'close'}, ${Number(operand.period || 20)})`
}

function collectIndicatorOperands(draft) {
  const seen = new Map()
  const visit = (operand) => {
    if (operand?.type !== 'indicator') return
    const key = operandKey(operand)
    if (!seen.has(key)) {
      const def = indicatorDef(operand.indicator)
      seen.set(key, {
        key,
        name: normalizeName(`${def.kind}_${operand.period || 'value'}_${seen.size + 1}`, `i_${seen.size + 1}`),
        operand,
      })
    }
  }
  for (const side of ['long', 'short']) {
    for (const scope of ['entryRules', 'exitRules']) {
      for (const group of draft[scope][side] || []) {
        for (const rule of group.rules || []) {
          visit(rule.left)
          visit(rule.right)
        }
      }
    }
  }
  return [...seen.values()]
}

function operandExpression(operand, indicatorMap) {
  if (operand.type === 'constant') return String(Number(operand.value || 0))
  if (operand.type === 'price') {
    const base = operand.field || 'close'
    return Number(operand.barsAgo || 0) > 0 ? `${base}[${Number(operand.barsAgo)}]` : base
  }
  const binding = indicatorMap.get(operandKey(operand))
  const base = binding?.name || indicatorExpression(operand)
  return Number(operand.barsAgo || 0) > 0 ? `${base}[${Number(operand.barsAgo)}]` : base
}

function ruleExpression(rule, indicatorMap) {
  const left = operandExpression(rule.left, indicatorMap)
  const right = operandExpression(rule.right, indicatorMap)
  if (rule.operator === 'crosses_above') return `ta.crossover(${left}, ${right})`
  if (rule.operator === 'crosses_below') return `ta.crossunder(${left}, ${right})`
  return `${left} ${rule.operator} ${right}`
}

function groupsExpression(groups, indicatorMap) {
  const chunks = (groups || [])
    .filter((group) => group.rules?.length)
    .map((group) => group.rules.map((rule) => ruleExpression(rule, indicatorMap)).join(' and '))
    .map((expr) => (expr.includes(' and ') ? `(${expr})` : expr))
  return chunks.length ? chunks.join(' or ') : 'false'
}

export function buildManualStrategyScript(draft) {
  const indicators = collectIndicatorOperands(draft)
  const indicatorMap = new Map(indicators.map((entry) => [entry.key, entry]))
  const sides = draft.enabledSides?.length ? draft.enabledSides : ['long']
  const lines = [
    `strategy("${draft.name || 'Manual Strategy'}")`,
    `token = "${draft.tokenSymbol || 'SOL'}"`,
    `timeframe = "${draft.timeframe || '1D'}"`,
    `enabledSides = "${sides.join(',')}"`,
    '',
    ...indicators.map((entry) => `${entry.name} = ${indicatorExpression(entry.operand)}`),
    indicators.length ? '' : null,
    `longEntry = ${sides.includes('long') ? groupsExpression(draft.entryRules.long, indicatorMap) : 'false'}`,
    `longExit = ${sides.includes('long') ? groupsExpression(draft.exitRules.long, indicatorMap) : 'false'}`,
    `shortEntry = ${sides.includes('short') ? groupsExpression(draft.entryRules.short, indicatorMap) : 'false'}`,
    `shortExit = ${sides.includes('short') ? groupsExpression(draft.exitRules.short, indicatorMap) : 'false'}`,
  ].filter((line) => line !== null)

  return lines.join('\n')
}

export function activeIndicatorSummary(draft) {
  return collectIndicatorOperands(draft).map((entry) => {
    const def = indicatorDef(entry.operand.indicator)
    return {
      key: entry.key,
      label: def.label,
      source: entry.operand.source,
      period: entry.operand.period,
      barsAgo: entry.operand.barsAgo || 0,
    }
  })
}
