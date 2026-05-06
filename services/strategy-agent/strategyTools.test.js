import test from 'node:test'
import assert from 'node:assert/strict'
import { generatePineLikeStrategy, prepareStrategyReceipt } from './strategyTools.js'
import { StrategyAgentService } from './agentService.js'

test('generatePineLikeStrategy creates app-compatible Pine-like source', () => {
  const result = generatePineLikeStrategy({
    prompt: 'EMA crossover SOL 15m with RSI filter long only',
  })

  assert.match(result.script, /longEntry\s*=/)
  assert.match(result.script, /ta\.ema/)
  assert.equal(result.engine.sourceType, 'pine_like_v0')
})

test('prepareStrategyReceipt hashes without exposing secrets', async () => {
  process.env.AGENT_MODEL_API_KEY = 'secret-test-key'
  const result = await prepareStrategyReceipt({
    prompt: 'Buy SOL',
    rules: { tokens: [{ address: 'So11111111111111111111111111111111111111112' }] },
  })

  assert.match(result.hash, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(result).includes('secret-test-key'), false)
})

test('agent deterministic fallback returns required artifacts without model key', async () => {
  const service = new StrategyAgentService({
    modelBaseUrl: 'https://api.openai.com/v1',
    modelName: 'test-model',
    modelApiKey: '',
    modelTimeoutMs: 1000,
  })

  const result = await service.run({
    goal: 'EMA crossover SOL 15m stop loss 5% backtest',
    portfolioSize: 500,
  })

  assert.equal(result.modelModeUsed, 'deterministic-tools')
  assert.ok(result.artifacts.rules)
  assert.ok(result.artifacts.validation)
  assert.ok(result.artifacts.receipt.hash)
  assert.ok(result.usedTools.includes('prepare_strategy_receipt'))
})
