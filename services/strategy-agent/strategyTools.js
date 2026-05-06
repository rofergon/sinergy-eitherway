import { createHash, randomUUID } from 'node:crypto'
import { tool } from 'langchain'
import { z } from 'zod'
import { parseStrategy, validateRisk } from '../../src/lib/strategyParser.js'
import { runBacktest } from '../../src/lib/backtest.js'
import { TOKEN_LIST, TOKENS } from '../../src/config.js'

const timeframeSchema = z.enum(['1m', '5m', '15m', '1h', '4h', '1d'])
const sideSchema = z.enum(['long', 'short'])

export const TOOL_DEFINITIONS = [
  {
    name: 'list_strategy_capabilities',
    description: 'Discovery tool. Use first to learn valid indicators, operators, limits, defaults, and supported timeframes.',
  },
  {
    name: 'analyze_market_context',
    description: 'Discovery tool. Use before selecting timeframe, EMA periods, or strategy family.',
  },
  {
    name: 'list_strategy_templates',
    description: 'Discovery tool. Use before drafting when a built-in template may fit the goal.',
  },
  {
    name: 'clone_strategy_template',
    description: 'Mutation tool. Use when a template closely matches the requested strategy.',
  },
  {
    name: 'update_strategy_draft',
    description: 'Mutation tool. Use to align timeframe, sides, sizing, risk rules, and engine source.',
  },
  {
    name: 'validate_strategy_draft',
    description: 'Verification tool. Use after creating or updating a strategy and before backtesting.',
  },
  {
    name: 'run_strategy_backtest',
    description: 'Terminal tool. Use after validation when the user asks to test or backtest.',
  },
  {
    name: 'prepare_strategy_receipt',
    description: 'Terminal tool. Prepare a hashable receipt payload. Wallet signing remains client-side.',
  },
]

export const parseStrategyPromptSchema = z.object({
  prompt: z.string().min(1),
})

export const listStrategyCapabilitiesSchema = z.object({
  ownerAddress: z.string().optional(),
})

export const analyzeMarketContextSchema = z.object({
  prompt: z.string().optional(),
  tokenSymbol: z.string().optional(),
  timeframe: timeframeSchema.optional(),
  bars: z.number().int().positive().optional(),
})

export const listStrategyTemplatesSchema = z.object({
  prompt: z.string().optional(),
  tokenSymbol: z.string().optional(),
})

export const cloneStrategyTemplateSchema = z.object({
  templateId: z.string().min(1),
  prompt: z.string().min(1),
  ownerAddress: z.string().optional(),
})

export const updateStrategyDraftSchema = z.object({
  strategy: z.record(z.string(), z.unknown()),
  patch: z.record(z.string(), z.unknown()).optional(),
})

export const generatePineLikeStrategySchema = z.object({
  prompt: z.string().min(1),
  tokenSymbol: z.string().optional(),
  timeframe: timeframeSchema.optional(),
  style: z.enum(['ema_cross', 'rsi_reversion', 'ema_rsi_swing']).optional(),
  fastEma: z.number().int().positive().max(300).optional(),
  slowEma: z.number().int().positive().max(500).optional(),
  rsiPeriod: z.number().int().positive().max(100).optional(),
  rsiEntry: z.number().min(1).max(99).optional(),
  rsiExit: z.number().min(1).max(99).optional(),
  enabledSides: z.array(z.enum(['long', 'short'])).min(1).optional(),
})

export const validateStrategyRiskSchema = z.object({
  rules: z.record(z.string(), z.unknown()),
})

export const validateStrategyDraftSchema = z.object({
  strategy: z.record(z.string(), z.unknown()),
})

export const runStrategyBacktestSchema = z.object({
  rules: z.record(z.string(), z.unknown()),
  portfolioSize: z.number().positive().default(1000),
})

export const prepareStrategyReceiptSchema = z.object({
  prompt: z.string().min(1),
  rules: z.record(z.string(), z.unknown()),
  metrics: z.record(z.string(), z.unknown()).nullable().optional(),
})

function pickTokenSymbol(prompt, explicit) {
  const wanted = explicit?.trim().toUpperCase()
  if (wanted) return wanted

  const lower = prompt.toLowerCase()
  const found = TOKEN_LIST.find((token) =>
    lower.includes(token.symbol.toLowerCase()) || lower.includes(token.name.toLowerCase())
  )
  return found?.symbol || TOKENS.SOL.symbol
}

function inferTimeframe(prompt, explicit) {
  if (explicit) return explicit
  const lower = prompt.toLowerCase()
  if (/\b(1m|one minute|scalp)\b/.test(lower)) return '1m'
  if (/\b(5m|five minute)\b/.test(lower)) return '5m'
  if (/\b(15m|fifteen minute|intraday)\b/.test(lower)) return '15m'
  if (/\b(1h|hourly|swing)\b/.test(lower)) return '1h'
  if (/\b(4h)\b/.test(lower)) return '4h'
  return '1d'
}

function inferStyle(prompt, explicit) {
  if (explicit) return explicit
  const lower = prompt.toLowerCase()
  if (/\brsi\b/.test(lower) && /\b(ema|ma|moving average)\b/.test(lower)) return 'ema_rsi_swing'
  if (/\brsi\b/.test(lower)) return 'rsi_reversion'
  return 'ema_cross'
}

function inferEnabledSides(prompt, explicit) {
  if (explicit?.length) return Array.from(new Set(explicit))
  const lower = prompt.toLowerCase()
  if (/\b(short only|solo short|only short)\b/.test(lower)) return ['short']
  if (/\b(long only|solo long|only long)\b/.test(lower)) return ['long']
  if (/\b(short|both|ambos|long\/short)\b/.test(lower)) return ['long', 'short']
  return ['long']
}

function inferEmaPeriods(prompt) {
  const lower = prompt.toLowerCase()
  const slash = lower.match(/\bema\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/)
  if (slash) return { fast: Number(slash[1]), slow: Number(slash[2]) }

  const values = [...lower.matchAll(/\b(?:ema|ma|sma)\s*(\d{1,3})\b/g)].map((match) => Number(match[1]))
  if (values.length >= 2) return { fast: Math.min(values[0], values[1]), slow: Math.max(values[0], values[1]) }
  if (values.length === 1) return { fast: Math.min(values[0], 9), slow: Math.max(values[0], 21) }
  return { fast: 9, slow: 21 }
}

function inferPercent(prompt, patterns, fallback) {
  const lower = prompt.toLowerCase()
  for (const pattern of patterns) {
    const match = lower.match(pattern)
    if (match) return Number(match[1])
  }
  return fallback
}

export function listStrategyCapabilities() {
  return {
    capabilities: {
      timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
      operators: ['>', '>=', '<', '<=', 'crosses_above', 'crosses_below'],
      priceFields: ['open', 'high', 'low', 'close', 'volume'],
      supportedSides: ['long', 'short'],
      sourceLanguages: ['pine_like_v0'],
      indicatorCatalog: [
        { kind: 'ema', outputs: ['value'], params: [{ name: 'period', defaultValue: 21, min: 2, max: 300 }] },
        { kind: 'rsi', outputs: ['value'], params: [{ name: 'period', defaultValue: 14, min: 2, max: 100 }] },
        { kind: 'atr', outputs: ['value'], params: [{ name: 'period', defaultValue: 14, min: 2, max: 100 }] },
      ],
      sizingModes: [
        { mode: 'percent_of_equity', defaultValue: 10 },
        { mode: 'fixed_quote_notional', defaultValue: 1000 },
      ],
      riskRules: [
        { key: 'stopLossPct', min: 0.1, max: 50 },
        { key: 'takeProfitPct', min: 0.1, max: 200 },
        { key: 'trailingStopPct', min: 0.1, max: 50 },
        { key: 'maxBarsInTrade', min: 1, max: 500 },
      ],
      defaults: { backtestBars: 120, maxIndicatorLookback: 300 },
    },
  }
}

export function analyzeMarketContext(input = {}) {
  const prompt = input.prompt || ''
  const tokenSymbol = pickTokenSymbol(prompt, input.tokenSymbol)
  const timeframe = inferTimeframe(prompt, input.timeframe)
  const style = inferStyle(prompt)
  const { fast, slow } = inferEmaPeriods(prompt)
  const lower = prompt.toLowerCase()
  const overallRegime = /\b(range|sideways|mean reversion|reversion)\b/.test(lower)
    ? 'range'
    : /\b(breakout|break out|momentum)\b/.test(lower)
      ? 'breakout_ready'
      : 'trend'

  return {
    analysis: {
      tokenSymbol,
      recommendedTimeframe: timeframe,
      overallRegime,
      trendBias: overallRegime === 'range' ? 'sideways' : 'bullish',
      emaSuggestion: {
        fastPeriod: fast,
        slowPeriod: slow,
        preferred: style !== 'rsi_reversion',
        sideBias: inferEnabledSides(prompt).length > 1 ? 'both' : 'long_only',
      },
      supports: [{ price: 'derived-from-chart', strength: 0.62 }],
      resistances: [{ price: 'derived-from-chart', strength: 0.58 }],
      note: 'Local market context is inferred from the request and current strategy engine defaults.',
    },
  }
}

export function listStrategyTemplates(input = {}) {
  const prompt = input.prompt || ''
  const tokenSymbol = pickTokenSymbol(prompt, input.tokenSymbol)
  return {
    templates: [
      {
        id: 'ema-crossover',
        name: 'EMA Crossover',
        description: 'Trend-following fast/slow EMA cross with configurable stops.',
        score: inferStyle(prompt) === 'ema_cross' ? 0.92 : 0.62,
      },
      {
        id: 'rsi-mean-reversion',
        name: 'RSI Mean Reversion',
        description: 'Buy oversold, exit recovery, optional short side.',
        score: inferStyle(prompt) === 'rsi_reversion' ? 0.9 : 0.52,
      },
      {
        id: 'ema-rsi-swing',
        name: 'EMA + RSI Swing',
        description: 'EMA direction with RSI filter for cleaner entries.',
        score: inferStyle(prompt) === 'ema_rsi_swing' ? 0.9 : 0.66,
      },
    ].map((template) => ({ ...template, tokenSymbol })),
  }
}

export function buildStrategyDraft(input) {
  const prompt = input.prompt || ''
  const pine = input.pine || generatePineLikeStrategy({ prompt })
  const baseRules = input.rules || parseStrategy(prompt)
  const allocation = inferPercent(prompt, [/(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?(?:portfolio|wallet|equity|capital)/], baseRules.allocation || 10)
  const stopLoss = inferPercent(prompt, [/stop.?loss\s*(?:at\s*)?(\d+(?:\.\d+)?)\s*%/, /\bsl\s*(\d+(?:\.\d+)?)\s*%/], baseRules.stopLoss || 8)
  const takeProfit = inferPercent(prompt, [/take.?profit\s*(?:at\s*)?(\d+(?:\.\d+)?)\s*%/, /\btp\s*(\d+(?:\.\d+)?)\s*%/], baseRules.takeProfit || stopLoss * 2)
  const enabledSides = pine.enabledSides.length ? pine.enabledSides : inferEnabledSides(prompt)

  const strategy = {
    id: randomUUID(),
    ownerAddress: input.ownerAddress || 'local-agent',
    name: `${pine.tokenSymbol} ${pine.style.replaceAll('_', ' ')}`,
    tokenSymbol: pine.tokenSymbol,
    timeframe: pine.timeframe,
    enabledSides,
    status: 'draft',
    sizing: { mode: 'percent_of_equity', value: allocation },
    riskRules: {
      stopLossPct: stopLoss,
      takeProfitPct: takeProfit,
      trailingStopPct: /\btrailing\b/i.test(prompt) ? Math.max(1, Math.round(stopLoss / 2)) : undefined,
      maxBarsInTrade: pine.timeframe === '15m' ? 40 : 30,
    },
    costModel: { feeBps: 10, slippageBps: 5, startingEquity: 1000 },
    rules: {
      ...baseRules,
      allocation,
      stopLoss,
      takeProfit,
      actions: enabledSides.includes('short') ? ['LONG', 'SHORT'] : ['LONG'],
      triggers: [{ type: 'PINE_SCRIPT', value: 1 }],
      script: pine.script,
      engine: pine.engine,
      summary: `${baseRules.summary}\n\n${pine.script}`,
    },
    engine: pine.engine,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return { strategy }
}

export function updateStrategyDraft(input) {
  const parsed = updateStrategyDraftSchema.parse(input)
  const now = new Date().toISOString()
  const strategy = {
    ...parsed.strategy,
    ...(parsed.patch || {}),
    updatedAt: now,
  }

  if (strategy.rules && strategy.riskRules) {
    strategy.rules = {
      ...strategy.rules,
      allocation: strategy.sizing?.value ?? strategy.rules.allocation,
      stopLoss: strategy.riskRules.stopLossPct ?? strategy.rules.stopLoss,
      takeProfit: strategy.riskRules.takeProfitPct ?? strategy.rules.takeProfit,
      maxBars: strategy.riskRules.maxBarsInTrade ?? strategy.rules.maxBars,
      trailingStop: strategy.riskRules.trailingStopPct ?? strategy.rules.trailingStop,
    }
  }

  return { strategy }
}

export function validateStrategyDraft(input) {
  const parsed = validateStrategyDraftSchema.parse(input)
  const strategy = parsed.strategy
  const rules = strategy.rules || strategy
  const risk = validateRisk(rules)
  const issues = []

  if (!strategy.timeframe) issues.push({ path: 'timeframe', code: 'missing_timeframe', message: 'Strategy timeframe is required.' })
  if (!Array.isArray(strategy.enabledSides) || strategy.enabledSides.length === 0) {
    issues.push({ path: 'enabledSides', code: 'missing_side', message: 'At least one enabled side is required.' })
  }
  if (!rules.script && !rules.engine) {
    issues.push({ path: 'engine', code: 'missing_engine', message: 'A Pine-like engine or script is required for agent-built strategies.' })
  }
  if (risk.checks.some((check) => check.severity === 'critical')) {
    issues.push({ path: 'risk', code: 'critical_risk', message: 'Risk validation has a critical issue.' })
  }

  return {
    validation: {
      ok: issues.length === 0,
      issues,
      risk,
    },
  }
}

export function cloneStrategyTemplate(input) {
  const parsed = cloneStrategyTemplateSchema.parse(input)
  const styleByTemplate = {
    'ema-crossover': 'ema_cross',
    'rsi-mean-reversion': 'rsi_reversion',
    'ema-rsi-swing': 'ema_rsi_swing',
  }
  const pine = generatePineLikeStrategy({
    prompt: parsed.prompt,
    style: styleByTemplate[parsed.templateId] || inferStyle(parsed.prompt),
  })
  return buildStrategyDraft({ prompt: parsed.prompt, ownerAddress: parsed.ownerAddress, pine })
}

export function generatePineLikeStrategy(input) {
  const parsed = generatePineLikeStrategySchema.parse(input)
  const tokenSymbol = pickTokenSymbol(parsed.prompt, parsed.tokenSymbol)
  const timeframe = inferTimeframe(parsed.prompt, parsed.timeframe)
  const style = inferStyle(parsed.prompt, parsed.style)
  const enabledSides = inferEnabledSides(parsed.prompt, parsed.enabledSides)
  const fast = parsed.fastEma || 9
  const slow = parsed.slowEma || 21
  const rsiPeriod = parsed.rsiPeriod || 14
  const rsiEntry = parsed.rsiEntry || 30
  const rsiExit = parsed.rsiExit || 55

  const lines = [
    `strategy("${tokenSymbol} ${style.replaceAll('_', ' ')}")`,
    `token = "${tokenSymbol}"`,
    `timeframe = "${timeframe}"`,
    `enabledSides = "${enabledSides.join(',')}"`,
    '',
  ]

  if (style === 'rsi_reversion') {
    lines.push(`rsiValue = ta.rsi(close, ${rsiPeriod})`)
    if (enabledSides.includes('long')) {
      lines.push(`longEntry = rsiValue <= ${rsiEntry}`, `longExit = rsiValue >= ${rsiExit}`)
    }
    if (enabledSides.includes('short')) {
      lines.push(`shortEntry = rsiValue >= ${100 - rsiEntry}`, `shortExit = rsiValue <= ${100 - rsiExit}`)
    }
  } else {
    lines.push(`fast = ta.ema(close, ${fast})`, `slow = ta.ema(close, ${slow})`)
    if (style === 'ema_rsi_swing') lines.push(`rsiValue = ta.rsi(close, ${rsiPeriod})`)
    if (enabledSides.includes('long')) {
      lines.push(
        style === 'ema_rsi_swing'
          ? `longEntry = ta.crossover(fast, slow) and rsiValue < 70`
          : `longEntry = ta.crossover(fast, slow)`,
        style === 'ema_rsi_swing'
          ? `longExit = ta.crossunder(fast, slow) or rsiValue > 78`
          : `longExit = ta.crossunder(fast, slow)`
      )
    }
    if (enabledSides.includes('short')) {
      lines.push(
        style === 'ema_rsi_swing'
          ? `shortEntry = ta.crossunder(fast, slow) and rsiValue > 30`
          : `shortEntry = ta.crossunder(fast, slow)`,
        style === 'ema_rsi_swing'
          ? `shortExit = ta.crossover(fast, slow) or rsiValue < 22`
          : `shortExit = ta.crossover(fast, slow)`
      )
    }
  }

  const script = lines.join('\n')
  return {
    script,
    engine: { sourceType: 'pine_like_v0', script },
    summary: `${tokenSymbol} ${style.replaceAll('_', ' ')} strategy on ${timeframe}`,
    tokenSymbol,
    timeframe,
    enabledSides,
    style,
  }
}

export function strategyToRules(strategyOrRules) {
  return strategyOrRules?.rules || strategyOrRules
}

export async function prepareStrategyReceipt(input) {
  const parsed = prepareStrategyReceiptSchema.parse(input)
  const payload = {
    prompt: parsed.prompt,
    tokens: Array.isArray(parsed.rules.tokens)
      ? parsed.rules.tokens.map((token) => token?.address).filter(Boolean)
      : [],
    rules: parsed.rules,
    metrics: parsed.metrics || null,
    timestamp: Math.floor(Date.now() / 60000),
  }
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return {
    id: randomUUID(),
    hash,
    payload,
    canCommitOnChain: true,
    note: 'Receipt prepared only; wallet signing remains client-side.',
  }
}

export function createStrategyTools(trace = []) {
  const wrap = (name, fn) => async (input) => {
    const step = trace.length + 1
    const entry = {
      step,
      tool: name,
      input,
      startedAt: new Date().toISOString(),
    }
    trace.push(entry)
    try {
      const output = await fn(input)
      entry.output = output
      entry.completedAt = new Date().toISOString()
      return output
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error)
      entry.completedAt = new Date().toISOString()
      throw error
    }
  }

  return [
    tool(wrap('parse_strategy_prompt', async (input) => ({ rules: parseStrategy(input.prompt) })), {
      name: 'parse_strategy_prompt',
      description: 'Parse a natural-language Solana DeFi strategy prompt into structured local strategy rules.',
      schema: parseStrategyPromptSchema,
    }),
    tool(wrap('list_strategy_capabilities', async () => listStrategyCapabilities()), {
      name: 'list_strategy_capabilities',
      description: TOOL_DEFINITIONS.find((item) => item.name === 'list_strategy_capabilities').description,
      schema: listStrategyCapabilitiesSchema,
    }),
    tool(wrap('analyze_market_context', async (input) => analyzeMarketContext(input)), {
      name: 'analyze_market_context',
      description: TOOL_DEFINITIONS.find((item) => item.name === 'analyze_market_context').description,
      schema: analyzeMarketContextSchema,
    }),
    tool(wrap('list_strategy_templates', async (input) => listStrategyTemplates(input)), {
      name: 'list_strategy_templates',
      description: TOOL_DEFINITIONS.find((item) => item.name === 'list_strategy_templates').description,
      schema: listStrategyTemplatesSchema,
    }),
    tool(wrap('generate_pine_like_strategy', async (input) => generatePineLikeStrategy(input)), {
      name: 'generate_pine_like_strategy',
      description: 'Generate a Pine-like script compatible with this app backtesting engine.',
      schema: generatePineLikeStrategySchema,
    }),
    tool(wrap('clone_strategy_template', async (input) => cloneStrategyTemplate(input)), {
      name: 'clone_strategy_template',
      description: TOOL_DEFINITIONS.find((item) => item.name === 'clone_strategy_template').description,
      schema: cloneStrategyTemplateSchema,
    }),
    tool(wrap('update_strategy_draft', async (input) => updateStrategyDraft(input)), {
      name: 'update_strategy_draft',
      description: TOOL_DEFINITIONS.find((item) => item.name === 'update_strategy_draft').description,
      schema: updateStrategyDraftSchema,
    }),
    tool(wrap('validate_strategy_draft', async (input) => validateStrategyDraft(input)), {
      name: 'validate_strategy_draft',
      description: TOOL_DEFINITIONS.find((item) => item.name === 'validate_strategy_draft').description,
      schema: validateStrategyDraftSchema,
    }),
    tool(wrap('validate_strategy_risk', async (input) => ({ validation: validateRisk(input.rules) })), {
      name: 'validate_strategy_risk',
      description: 'Validate parsed strategy risk using the current Sinergy risk checks.',
      schema: validateStrategyRiskSchema,
    }),
    tool(wrap('run_strategy_backtest', async (input) => ({ backtest: await runBacktest(input.rules, input.portfolioSize) })), {
      name: 'run_strategy_backtest',
      description: 'Run the current Sinergy backtest engine. Use only when the user asks to test, backtest, simulate, or evaluate.',
      schema: runStrategyBacktestSchema,
    }),
    tool(wrap('prepare_strategy_receipt', async (input) => ({ receipt: await prepareStrategyReceipt(input) })), {
      name: 'prepare_strategy_receipt',
      description: 'Prepare a SHA-256 strategy receipt payload. This does not sign or send a wallet transaction.',
      schema: prepareStrategyReceiptSchema,
    }),
  ]
}
