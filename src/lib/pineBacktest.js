const PRICE_FIELDS = new Set(['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4'])
const SIGNALS = new Set(['longEntry', 'longExit', 'shortEntry', 'shortExit'])

export const DEFAULT_PINE_SCRIPT = `strategy("EMA + RSI swing")
token = "SOL"
timeframe = "1d"
enabledSides = "long"

fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
rsi = ta.rsi(close, 14)

longEntry = ta.crossover(fast, slow) and rsi < 70
longExit = ta.crossunder(fast, slow) or rsi > 78`

export function isPineLikeScript(input = '') {
  return /\b(longEntry|shortEntry|longExit|shortExit)\s*=/.test(input) || /\bta\.(ema|sma|rsi|crossover|crossunder)\s*\(/.test(input)
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0
}

function candleValue(candle, field) {
  if (field === 'hl2') return (candle.high + candle.low) / 2
  if (field === 'hlc3') return (candle.high + candle.low + candle.close) / 3
  if (field === 'ohlc4') return (candle.open + candle.high + candle.low + candle.close) / 4
  return candle[field] ?? 0
}

function sma(values, period) {
  const out = Array(values.length).fill(null)
  let rolling = 0
  for (let i = 0; i < values.length; i += 1) {
    rolling += values[i]
    if (i >= period) rolling -= values[i - period]
    if (i >= period - 1) out[i] = rolling / period
  }
  return out
}

function ema(values, period) {
  const out = Array(values.length).fill(null)
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < values.length; i += 1) {
    if (i === period - 1) {
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
      out[i] = prev
    } else if (i >= period && prev !== null) {
      prev = values[i] * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

function rsi(values, period) {
  const out = Array(values.length).fill(null)
  let gains = 0
  let losses = 0
  for (let i = 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1]
    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)
    if (i <= period) {
      gains += gain
      losses += loss
      if (i === period) out[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses)
    } else {
      gains = (gains * (period - 1) + gain) / period
      losses = (losses * (period - 1) + loss) / period
      out[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses)
    }
  }
  return out
}

function roc(values, period) {
  return values.map((value, i) => (i < period || values[i - period] === 0 ? null : ((value - values[i - period]) / values[i - period]) * 100))
}

function atr(candles, period) {
  const ranges = candles.map((c, i) => {
    const prevClose = candles[i - 1]?.close ?? c.close
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose))
  })
  return ema(ranges, period)
}

function rolling(candles, period, field, mode) {
  return candles.map((_, i) => {
    if (i < period - 1) return null
    const values = candles.slice(i - period + 1, i + 1).map((c) => candleValue(c, field))
    return mode === 'high' ? Math.max(...values) : Math.min(...values)
  })
}

function vwap(candles) {
  let pv = 0
  let vol = 0
  return candles.map((c) => {
    const volume = c.volume || 0
    pv += ((c.high + c.low + c.close) / 3) * volume
    vol += volume
    return vol === 0 ? null : pv / vol
  })
}

function seriesFor(call, candles, cache) {
  const key = JSON.stringify(call)
  if (cache.has(key)) return cache.get(key)
  const source = (call.source && candles.map((c) => candleValue(c, call.source))) || candles.map((c) => c.close)
  let series
  if (call.name === 'ta.sma') series = sma(source, call.period)
  else if (call.name === 'ta.ema') series = ema(source, call.period)
  else if (call.name === 'ta.rsi') series = rsi(source, call.period)
  else if (call.name === 'ta.roc') series = roc(source, call.period)
  else if (call.name === 'ta.atr') series = atr(candles, call.period)
  else if (call.name === 'ta.vwap') series = vwap(candles)
  else if (call.name === 'ta.highest') series = rolling(candles, call.period, call.source || 'high', 'high')
  else if (call.name === 'ta.lowest') series = rolling(candles, call.period, call.source || 'low', 'low')
  else series = Array(candles.length).fill(null)
  cache.set(key, series)
  return series
}

function tokenize(input) {
  const tokens = []
  let i = 0
  while (i < input.length) {
    const char = input[i]
    if (/\s/.test(char)) {
      i += 1
    } else if (['>=', '<=', '==', '!='].includes(input.slice(i, i + 2))) {
      tokens.push(['op', input.slice(i, i + 2)])
      i += 2
    } else if ('+-*/><'.includes(char)) {
      tokens.push(['op', char])
      i += 1
    } else if ('(),[]'.includes(char)) {
      tokens.push(['p', char])
      i += 1
    } else if (char === '"') {
      const end = input.indexOf('"', i + 1)
      if (end === -1) throw new Error('Unterminated string in Pine-like script')
      tokens.push(['string', input.slice(i + 1, end)])
      i = end + 1
    } else if (/[0-9.]/.test(char)) {
      let end = i + 1
      while (/[0-9.]/.test(input[end] || '')) end += 1
      tokens.push(['number', Number(input.slice(i, end))])
      i = end
    } else if (/[A-Za-z_]/.test(char)) {
      let end = i + 1
      while (/[A-Za-z0-9_.$]/.test(input[end] || '')) end += 1
      tokens.push(['id', input.slice(i, end)])
      i = end
    } else {
      throw new Error(`Unsupported Pine-like character: ${char}`)
    }
  }
  tokens.push(['eof', ''])
  return tokens
}

function cursor(tokens) {
  let i = 0
  return {
    peek: () => tokens[i],
    next: () => tokens[i++],
    match: (type, value) => {
      const t = tokens[i]
      if (t?.[0] !== type || (value !== undefined && t[1] !== value)) return false
      i += 1
      return true
    },
    expect: (type, value) => {
      const t = tokens[i++]
      if (t?.[0] !== type || (value !== undefined && t[1] !== value)) throw new Error('Invalid Pine-like syntax')
      return t
    },
  }
}

function parseValue(cur) {
  const parsePrimary = () => {
    const t = cur.next()
    if (t[0] === 'number') return { type: 'number', value: t[1] }
    if (t[0] === 'id') {
      if (cur.match('p', '(')) {
        const args = []
        if (!cur.match('p', ')')) {
          do args.push(parseValue(cur))
          while (cur.match('p', ','))
          cur.expect('p', ')')
        }
        return { type: 'call', name: t[1], args }
      }
      return PRICE_FIELDS.has(t[1]) ? { type: 'price', field: t[1] } : { type: 'id', name: t[1] }
    }
    if (t[0] === 'op' && t[1] === '-') return { type: 'neg', value: parsePrimary() }
    if (t[0] === 'p' && t[1] === '(') {
      const expr = parseCondition(cur)
      cur.expect('p', ')')
      return expr
    }
    throw new Error('Invalid Pine-like value expression')
  }
  const parsePostfix = () => {
    let expr = parsePrimary()
    while (cur.match('p', '[')) {
      expr = { type: 'history', value: expr, barsAgo: Math.max(0, Math.trunc(cur.expect('number')[1])) }
      cur.expect('p', ']')
    }
    return expr
  }
  const parseMul = () => {
    let expr = parsePostfix()
    while (cur.peek()[0] === 'op' && ['*', '/'].includes(cur.peek()[1])) {
      expr = { type: 'math', op: cur.next()[1], left: expr, right: parsePostfix() }
    }
    return expr
  }
  let expr = parseMul()
  while (cur.peek()[0] === 'op' && ['+', '-'].includes(cur.peek()[1])) {
    expr = { type: 'math', op: cur.next()[1], left: expr, right: parseMul() }
  }
  return expr
}

function parseCondition(cur) {
  const parseBase = () => {
    if (cur.peek()[0] === 'id' && ['true', 'false'].includes(cur.peek()[1])) return { type: 'bool', value: cur.next()[1] === 'true' }
    if (cur.peek()[0] === 'id' && ['ta.crossover', 'ta.crossunder'].includes(cur.peek()[1])) {
      const name = cur.next()[1]
      cur.expect('p', '(')
      const left = parseValue(cur)
      cur.expect('p', ',')
      const right = parseValue(cur)
      cur.expect('p', ')')
      return { type: 'cross', dir: name === 'ta.crossover' ? 'above' : 'below', left, right }
    }
    const left = parseValue(cur)
    if (cur.peek()[0] === 'op' && ['>', '>=', '<', '<=', '==', '!='].includes(cur.peek()[1])) {
      return { type: 'cmp', op: cur.next()[1], left, right: parseValue(cur) }
    }
    return left
  }
  const parseNot = () => (cur.peek()[0] === 'id' && cur.peek()[1] === 'not' ? (cur.next(), { type: 'not', value: parseNot() }) : parseBase())
  const parseAnd = () => {
    let expr = parseNot()
    while (cur.peek()[0] === 'id' && cur.peek()[1] === 'and') {
      cur.next()
      expr = { type: 'logic', op: 'and', values: expr.type === 'logic' && expr.op === 'and' ? [...expr.values, parseNot()] : [expr, parseNot()] }
    }
    return expr
  }
  let expr = parseAnd()
  while (cur.peek()[0] === 'id' && cur.peek()[1] === 'or') {
    cur.next()
    expr = { type: 'logic', op: 'or', values: expr.type === 'logic' && expr.op === 'or' ? [...expr.values, parseAnd()] : [expr, parseAnd()] }
  }
  return expr
}

export function parsePineLikeStrategy(script) {
  const ast = { bindings: {}, signals: {}, tokenSymbol: 'SOL', timeframe: '1D', enabledSides: ['long'] }
  const lines = script.split(/\r?\n/).map((line) => line.replace(/\/\/.*$/, '').trim()).filter(Boolean)
  for (const line of lines) {
    if (/^strategy\s*\(/.test(line)) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/)
    if (!match) throw new Error(`Pine-like lines must be assignments: ${line}`)
    const [, name, expression] = match
    if (name === 'token') {
      ast.tokenSymbol = expression.replace(/^"|"$/g, '').toUpperCase()
    } else if (name === 'timeframe') {
      ast.timeframe = expression.replace(/^"|"$/g, '').toUpperCase()
    } else if (name === 'enabledSides') {
      ast.enabledSides = expression.replace(/^"|"$/g, '').split(',').map((s) => s.trim()).filter((s) => s === 'long' || s === 'short')
    } else {
      const cur = cursor(tokenize(expression))
      const parsed = SIGNALS.has(name) ? parseCondition(cur) : parseValue(cur)
      cur.expect('eof')
      if (SIGNALS.has(name)) ast.signals[name] = parsed
      else ast.bindings[name] = parsed
    }
  }
  return ast
}

function compileCall(node, bindings) {
  const source = node.args[0]?.type === 'price' ? node.args[0].field : 'close'
  const period = Math.max(1, Math.trunc(node.args[1]?.value ?? node.args[0]?.value ?? 14))
  if (['ta.ema', 'ta.sma', 'ta.rsi', 'ta.roc'].includes(node.name)) return { name: node.name, source, period }
  if (['ta.highest', 'ta.lowest'].includes(node.name)) return { name: node.name, source, period }
  if (node.name === 'ta.atr') return { name: node.name, period: Math.max(1, Math.trunc(node.args[0]?.value ?? 14)) }
  if (node.name === 'ta.vwap') return { name: node.name }
  if (node.name === 'math.abs') return { abs: compileValue(node.args[0], bindings) }
  throw new Error(`Unsupported Pine-like function: ${node.name}`)
}

function compileValue(node, bindings, stack = new Set()) {
  if (!node) return { type: 'number', value: 0 }
  if (node.type === 'id') {
    if (!bindings[node.name]) throw new Error(`Unknown Pine-like identifier: ${node.name}`)
    if (stack.has(node.name)) throw new Error(`Circular Pine-like binding: ${node.name}`)
    stack.add(node.name)
    const value = compileValue(bindings[node.name], bindings, stack)
    stack.delete(node.name)
    return value
  }
  if (node.type === 'call') return { type: 'series', call: compileCall(node, bindings) }
  if (node.type === 'math') return { ...node, left: compileValue(node.left, bindings), right: compileValue(node.right, bindings) }
  if (node.type === 'history') return { ...node, value: compileValue(node.value, bindings) }
  if (node.type === 'neg') return { ...node, value: compileValue(node.value, bindings) }
  return node
}

function compileCondition(node, bindings) {
  if (!node) return { type: 'bool', value: false }
  if (node.type === 'cmp' || node.type === 'cross') return { ...node, left: compileValue(node.left, bindings), right: compileValue(node.right, bindings) }
  if (node.type === 'logic') return { ...node, values: node.values.map((value) => compileCondition(value, bindings)) }
  if (node.type === 'not') return { ...node, value: compileCondition(node.value, bindings) }
  if (node.type === 'bool') return node
  return { type: 'cmp', op: '!=', left: compileValue(node, bindings), right: { type: 'number', value: 0 } }
}

function evalValue(node, candles, index, cache) {
  if (index < 0) return null
  if (node.type === 'number') return node.value
  if (node.type === 'price') return candleValue(candles[index], node.field)
  if (node.type === 'series') return seriesFor(node.call, candles, cache)[index] ?? null
  if (node.type === 'history') return evalValue(node.value, candles, index - node.barsAgo, cache)
  if (node.type === 'neg') {
    const value = evalValue(node.value, candles, index, cache)
    return value == null ? null : -value
  }
  if (node.type === 'math') {
    const left = evalValue(node.left, candles, index, cache)
    const right = evalValue(node.right, candles, index, cache)
    if (left == null || right == null) return null
    if (node.op === '+') return left + right
    if (node.op === '-') return left - right
    if (node.op === '*') return left * right
    return right === 0 ? null : left / right
  }
  return null
}

function compare(left, right, op) {
  if (left == null || right == null) return false
  if (op === '>') return left > right
  if (op === '>=') return left >= right
  if (op === '<') return left < right
  if (op === '<=') return left <= right
  if (op === '==') return left === right
  return left !== right
}

function evalCondition(node, candles, index, cache) {
  if (!node) return false
  if (node.type === 'bool') return node.value
  if (node.type === 'logic') return node.op === 'and' ? node.values.every((v) => evalCondition(v, candles, index, cache)) : node.values.some((v) => evalCondition(v, candles, index, cache))
  if (node.type === 'not') return !evalCondition(node.value, candles, index, cache)
  if (node.type === 'cmp') return compare(evalValue(node.left, candles, index, cache), evalValue(node.right, candles, index, cache), node.op)
  if (node.type === 'cross') {
    const prevLeft = evalValue(node.left, candles, index - 1, cache)
    const prevRight = evalValue(node.right, candles, index - 1, cache)
    const left = evalValue(node.left, candles, index, cache)
    const right = evalValue(node.right, candles, index, cache)
    if ([prevLeft, prevRight, left, right].some((value) => value == null)) return false
    return node.dir === 'above' ? prevLeft <= prevRight && left > right : prevLeft >= prevRight && left < right
  }
  return false
}

export function runPineBacktest({ script, token, candles, portfolioSize = 1000, allocation = 100, stopLoss = 10, takeProfit = 30, trailingStop = 0, maxBars = 0 }) {
  const ast = parsePineLikeStrategy(script)
  const compiled = {
    enabledSides: ast.enabledSides.length ? ast.enabledSides : ['long'],
    longEntry: compileCondition(ast.signals.longEntry, ast.bindings),
    longExit: compileCondition(ast.signals.longExit, ast.bindings),
    shortEntry: compileCondition(ast.signals.shortEntry, ast.bindings),
    shortExit: compileCondition(ast.signals.shortExit, ast.bindings),
  }
  const cache = new Map()
  const startingEquity = portfolioSize * (allocation / 100)
  let realizedEquity = startingEquity
  let position = null
  let barsWithExposure = 0
  const trades = []
  const equityCurve = []

  const open = (index, side) => {
    const c = candles[index]
    if (!c?.close || realizedEquity <= 0) return
    position = {
      side,
      entryIndex: index,
      entryTime: c.ts,
      entryPrice: c.close,
      quantity: realizedEquity / c.close,
      highestClose: c.close,
      lowestClose: c.close,
    }
  }

  const close = (index, reason) => {
    const c = candles[index]
    const fill = c.close
    const pnl = position.side === 'long'
      ? (fill - position.entryPrice) * position.quantity
      : (position.entryPrice - fill) * position.quantity
    realizedEquity += pnl
    trades.push({
      type: position.side === 'long' ? 'SELL' : 'COVER',
      side: position.side,
      entryPrice: round(position.entryPrice, 8),
      exitPrice: round(fill, 8),
      price: fill,
      date: new Date(c.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      pnl: round(pnl, 2),
      reason,
      barsHeld: index - position.entryIndex,
    })
    position = null
  }

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i]
    const longEntry = compiled.enabledSides.includes('long') && evalCondition(compiled.longEntry, candles, i, cache)
    const shortEntry = compiled.enabledSides.includes('short') && evalCondition(compiled.shortEntry, candles, i, cache)

    if (position) {
      position.highestClose = Math.max(position.highestClose, c.close)
      position.lowestClose = Math.min(position.lowestClose, c.close)
      const pnlPct = position.side === 'long'
        ? ((c.close - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - c.close) / position.entryPrice) * 100
      let exitReason = null
      if (pnlPct <= -stopLoss) exitReason = 'stop_loss'
      else if (pnlPct >= takeProfit) exitReason = 'take_profit'
      else if (Number(maxBars) > 0 && i - position.entryIndex >= Number(maxBars)) exitReason = 'max_bars'
      else if (Number(trailingStop) > 0 && position.side === 'long' && c.close <= position.highestClose * (1 - Number(trailingStop) / 100)) exitReason = 'trailing_stop'
      else if (Number(trailingStop) > 0 && position.side === 'short' && c.close >= position.lowestClose * (1 + Number(trailingStop) / 100)) exitReason = 'trailing_stop'
      else if (position.side === 'long' && evalCondition(compiled.longExit, candles, i, cache)) exitReason = 'rule'
      else if (position.side === 'short' && evalCondition(compiled.shortExit, candles, i, cache)) exitReason = 'rule'
      else if (position.side === 'long' && shortEntry) exitReason = 'reverse'
      else if (position.side === 'short' && longEntry) exitReason = 'reverse'

      if (exitReason) {
        const prior = position.side
        close(i, exitReason)
        if (exitReason === 'reverse') open(i, prior === 'long' ? 'short' : 'long')
      }
    } else if (longEntry !== shortEntry) {
      open(i, longEntry ? 'long' : 'short')
      if (position) {
        trades.push({
          type: position.side === 'long' ? 'BUY' : 'SHORT',
          side: position.side,
          price: position.entryPrice,
          date: new Date(c.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        })
      }
    }

    let equity = realizedEquity
    if (position) {
      equity += position.side === 'long'
        ? (c.close - position.entryPrice) * position.quantity
        : (position.entryPrice - c.close) * position.quantity
      barsWithExposure += 1
    }
    equityCurve.push({
      date: new Date(c.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: round(equity, 2),
      price: round(c.close, 6),
    })
  }

  if (position) close(candles.length - 1, 'end_of_data')
  const sells = trades.filter((t) => ['SELL', 'COVER'].includes(t.type))
  const winners = sells.filter((t) => t.pnl > 0)
  const losers = sells.filter((t) => t.pnl < 0)
  const finalValue = realizedEquity
  const totalPnL = finalValue - startingEquity
  const grossWins = winners.reduce((sum, t) => sum + t.pnl, 0)
  const grossLosses = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0))
  let peak = startingEquity
  let maxDrawdown = 0
  for (const point of equityCurve) {
    peak = Math.max(peak, point.value)
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - point.value) / peak) * 100)
  }

  return {
    token,
    equityCurve,
    trades: trades.slice(-30),
    pine: true,
    metrics: {
      totalReturn: round((totalPnL / startingEquity) * 100, 2),
      totalPnL: round(totalPnL, 2),
      finalValue: round(finalValue, 2),
      winRate: round((winners.length / Math.max(sells.length, 1)) * 100, 1),
      totalTrades: sells.length,
      wins: winners.length,
      losses: losers.length,
      sharpe: 0,
      maxDrawdown: round(maxDrawdown, 2),
      profitFactor: grossLosses === 0 ? (grossWins > 0 ? 999 : 0) : round(grossWins / grossLosses, 3),
      exposurePct: round((barsWithExposure / Math.max(candles.length, 1)) * 100, 2),
    },
  }
}
