import { createAgent } from 'langchain'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { parseStrategy, validateRisk } from '../../src/lib/strategyParser.js'
import { runBacktest } from '../../src/lib/backtest.js'
import {
  TOOL_DEFINITIONS,
  analyzeMarketContext,
  buildStrategyDraft,
  cloneStrategyTemplate,
  createStrategyTools,
  generatePineLikeStrategy,
  listStrategyCapabilities,
  listStrategyTemplates,
  prepareStrategyReceipt,
  strategyToRules,
  updateStrategyDraft,
  validateStrategyDraft,
} from './strategyTools.js'

export const agentRequestSchema = z.object({
  goal: z.string().min(1),
  ownerAddress: z.string().optional(),
  portfolioSize: z.coerce.number().positive().default(1000),
  chartBars: z.coerce.number().int().positive().optional(),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).optional(),
  mode: z.enum(['run']).default('run'),
})

const SYSTEM_PROMPT = [
  'You are the Sinergy strategy agent: an autonomous strategy builder that drives tool calls to completion.',
  'At every step expose goal_state, next_tool, why, expected_artifact, and stop_condition.',
  'For new strategies use discovery first: capabilities, market context, templates, draft/update, validation, backtest, receipt.',
  'If validation or backtest is weak, repair or optimize once before finalizing.',
  'Do not invent backtest metrics, hashes, or wallet signatures.',
  'Never sign transactions or claim that a wallet action was completed.',
].join('\n')

function wantsBacktest(goal) {
  return /\b(backtest|test|simulate|evaluate|probar|prueba|simular)\b/i.test(goal)
}

function wantsPine(goal) {
  return /\b(pine|ema|rsi|moving average|ma cross|crossover|script)\b/i.test(goal)
}

function wantsTemplate(goal) {
  return /\b(template|plantilla|ema|rsi|crossover|mean reversion|swing)\b/i.test(goal)
}

function summarizeOutput(toolName, output) {
  if (!output) return 'Completed.'
  if (toolName === 'list_strategy_capabilities') return 'Read indicators, operators, timeframes, risk limits, and engine support.'
  if (toolName === 'analyze_market_context') {
    const analysis = output.analysis || {}
    return [
      analysis.recommendedTimeframe ? `Recommended TF ${analysis.recommendedTimeframe}` : null,
      analysis.overallRegime ? `Regime ${String(analysis.overallRegime).replaceAll('_', ' ')}` : null,
    ].filter(Boolean).join(' - ') || 'Reviewed market context.'
  }
  if (toolName === 'list_strategy_templates') return `${output.templates?.length || 0} strategy templates inspected.`
  if (toolName === 'clone_strategy_template') return `Prepared ${output.strategy?.name || 'template draft'} - ${output.strategy?.timeframe || 'timeframe set'}.`
  if (toolName === 'generate_pine_like_strategy') return `${output.summary}.`
  if (toolName === 'update_strategy_draft') return `Aligned draft risk, sizing, sides, timeframe, and engine source.`
  if (toolName === 'validate_strategy_draft') return output.validation?.ok ? 'Validation passed.' : `Validation found ${output.validation?.issues?.length || 0} issue(s).`
  if (toolName === 'validate_strategy_risk') return `Risk score ${output.validation?.score ?? '--'}/100.`
  if (toolName === 'run_strategy_backtest') {
    const summary = output.backtest?.summary || output.summary || {}
    return [
      Number.isFinite(summary.totalPnL) ? `PnL ${summary.totalPnL}` : null,
      Number.isFinite(summary.avgWinRate) ? `Win rate ${summary.avgWinRate}%` : null,
      Number.isFinite(summary.maxDrawdown) ? `Max DD ${summary.maxDrawdown}%` : null,
      Number.isFinite(summary.profitFactor) ? `PF ${summary.profitFactor}` : null,
    ].filter(Boolean).join(' - ') || 'Backtest finished.'
  }
  if (toolName === 'prepare_strategy_receipt') return `Receipt hash ${String(output.receipt?.hash || '').slice(0, 10)}... prepared.`
  return 'Completed.'
}

function assessBacktest(backtest) {
  const summary = backtest?.summary
  if (!summary) return { acceptable: false, reason: 'Backtest did not return a summary.' }
  const pnl = Number(summary.totalPnL || 0)
  const trades = backtest.tokenResults?.reduce((total, item) => total + (item.metrics?.totalTrades || 0), 0) || 0
  const profitFactor = Number(summary.profitFactor || 0)
  const maxDrawdown = Number(summary.maxDrawdown || 0)
  const acceptable = trades > 0 && pnl >= 0 && maxDrawdown <= 25 && (profitFactor === 0 || profitFactor >= 1)
  return {
    acceptable,
    reason: acceptable
      ? 'Backtest met the local acceptance checks.'
      : 'Initial creation backtest was weak; running a quick optimization retry loop.',
  }
}

function collectArtifacts(trace) {
  const artifacts = {}
  for (const entry of trace) {
    const output = entry.output || {}
    if (output.rules) artifacts.rules = output.rules
    if (output.script) {
      artifacts.pine = output
      artifacts.engine = output.engine
    }
    if (output.validation) artifacts.validation = output.validation
    if (output.backtest) artifacts.backtest = output.backtest
    if (output.receipt) artifacts.receipt = output.receipt
  }
  return artifacts
}

function responseTextFromAgent(response) {
  const messages = response?.messages
  const last = Array.isArray(messages) ? messages[messages.length - 1] : null
  const content = last?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || '').filter(Boolean).join('\n')
  }
  return ''
}

async function runToolStep(trace, toolName, toolInput, fn) {
  const entry = {
    step: trace.length + 1,
    tool: toolName,
    input: toolInput,
    startedAt: new Date().toISOString(),
    enforced: true,
    status: 'running',
  }
  trace.push(entry)
  try {
    const output = await fn()
    entry.output = output
    entry.resultSummary = summarizeOutput(toolName, output)
    entry.status = 'completed'
    entry.completedAt = new Date().toISOString()
    return output
  } catch (error) {
    entry.error = { message: error instanceof Error ? error.message : String(error) }
    entry.resultSummary = entry.error.message
    entry.status = 'error'
    entry.completedAt = new Date().toISOString()
    throw error
  }
}

async function runReasonedToolStep(trace, detail, fn) {
  return runToolStep(trace, detail.nextTool, detail.input || {}, async () => fn()).then((output) => {
    const entry = trace[trace.length - 1]
    entry.goalState = detail.goalState
    entry.nextTool = detail.nextTool
    entry.reason = detail.why
    entry.expectedArtifact = detail.expectedArtifact
    entry.stopCondition = detail.stopCondition
    return output
  })
}

async function completeRequiredArtifacts(input, trace, artifacts) {
  let rules = artifacts.rules
  if (!rules) {
    const parsed = await runToolStep(trace, 'parse_strategy_prompt', { prompt: input.goal }, async () => ({
      rules: parseStrategy(input.goal),
    }))
    rules = parsed.rules
  }

  let pine = artifacts.pine || null
  if (!pine && wantsPine(input.goal)) {
    pine = await runToolStep(trace, 'generate_pine_like_strategy', { prompt: input.goal }, async () =>
      generatePineLikeStrategy({ prompt: input.goal })
    )
    rules = {
      ...rules,
      actions: pine.enabledSides.includes('short') ? ['LONG', 'SHORT'] : ['LONG'],
      triggers: [{ type: 'PINE_SCRIPT', value: 1 }],
      script: pine.script,
      engine: pine.engine,
      summary: `${rules.summary}\n\n${pine.script}`,
    }
  }

  let validation = artifacts.validation
  if (!validation) {
    const checked = await runToolStep(trace, 'validate_strategy_risk', { rules }, async () => ({
      validation: validateRisk(rules),
    }))
    validation = checked.validation
  }

  let backtest = artifacts.backtest
  if (!backtest && wantsBacktest(input.goal)) {
    const tested = await runToolStep(trace, 'run_strategy_backtest', { rules, portfolioSize: input.portfolioSize }, async () => ({
      backtest: await runBacktest(rules, input.portfolioSize),
    }))
    backtest = tested.backtest
  }

  let receipt = artifacts.receipt
  if (!receipt) {
    const prepared = await runToolStep(trace, 'prepare_strategy_receipt', {
      prompt: input.goal,
      rules,
      metrics: backtest?.summary || null,
    }, async () => ({
      receipt: await prepareStrategyReceipt({
        prompt: input.goal,
        rules,
        metrics: backtest?.summary || null,
      }),
    }))
    receipt = prepared.receipt
  }

  return {
    rules,
    ...(pine ? { pine, engine: pine.engine } : {}),
    validation,
    ...(backtest ? { backtest } : {}),
    receipt,
  }
}

export class StrategyAgentService {
  constructor(options) {
    this.options = options
    this.modelEnabled = Boolean(options.modelApiKey)
  }

  async health() {
    return {
      ok: true,
      modelConfigured: this.modelEnabled,
      model: this.options.modelName,
      tools: TOOL_DEFINITIONS.map((tool) => tool.name),
      toolDefinitions: TOOL_DEFINITIONS,
    }
  }

  async run(rawInput, options = {}) {
    const input = agentRequestSchema.parse(rawInput)
    if (!this.modelEnabled) return this.runDeterministic(input, ['Model API key not configured; used deterministic tool workflow.'], options)

    const trace = []
    try {
      const model = new ChatOpenAI({
        model: this.options.modelName,
        apiKey: this.options.modelApiKey,
        useResponsesApi: true,
        configuration: { baseURL: this.options.modelBaseUrl },
        timeout: this.options.modelTimeoutMs,
        maxRetries: 0,
      })
      const agent = createAgent({
        model,
        tools: createStrategyTools(trace),
        systemPrompt: SYSTEM_PROMPT,
      })
      const response = await agent.invoke({
        messages: [{
          role: 'user',
          content: [
            input.goal,
            '',
            'Required workflow:',
            input.timeframe ? `Visible chart timeframe: ${input.timeframe}.` : null,
            input.chartBars ? `Visible chart window: ${input.chartBars} candles.` : null,
            '1. Call list_strategy_capabilities.',
            '2. Call analyze_market_context.',
            '3. Call list_strategy_templates.',
            wantsTemplate(input.goal) ? '4. Clone or generate a strategy draft.' : '4. Generate a strategy draft.',
            '5. Call update_strategy_draft.',
            '6. Call validate_strategy_draft.',
            wantsBacktest(input.goal) ? '7. Call run_strategy_backtest.' : null,
            '8. Call prepare_strategy_receipt.',
            'Return a concise final summary after the tools complete.',
          ].filter(Boolean).join('\n'),
        }],
      })
      const artifacts = await completeRequiredArtifacts(input, trace, collectArtifacts(trace))
      return {
        requestId: randomUUID(),
        finalMessage: responseTextFromAgent(response) || 'Strategy workflow completed.',
        usedTools: trace.map((entry) => entry.tool),
        toolTrace: trace,
        artifacts,
        modelModeUsed: 'langchain-tools',
        warnings: [],
      }
    } catch (error) {
      return this.runDeterministic(input, [
        `Native LangChain run failed: ${error instanceof Error ? error.message : String(error)}`,
      ], options)
    }
  }

  async runDeterministic(input, warnings = [], options = {}) {
    const trace = []
    const emit = typeof options.onEvent === 'function' ? options.onEvent : () => {}
    const record = async (detail, fn) => {
      const step = trace.length + 1
      emit('thinking_delta', {
        type: 'thinking_delta',
        text: `${detail.goalState}\n${detail.why}`,
      })
      emit('tool', {
        type: 'tool',
        phase: 'start',
        tool: detail.nextTool,
        step,
        message: detail.expectedArtifact,
      })
      const output = await runReasonedToolStep(trace, detail, fn)
      const entry = trace[trace.length - 1]
      emit('tool', {
        type: 'tool',
        phase: entry.error ? 'error' : 'done',
        tool: entry.tool,
        step: entry.step,
        message: entry.resultSummary || entry.expectedArtifact || 'Tool completed.',
        entry,
      })
      return output
    }

    const capabilities = await record({
      nextTool: 'list_strategy_capabilities',
      input: { ownerAddress: input.ownerAddress },
      goalState: 'Know the valid strategy schema before drafting.',
      why: 'Discovery comes first so the agent does not invent unsupported indicators, operators, timeframes, or risk fields.',
      expectedArtifact: 'Capabilities catalog with indicators, operators, sides, timeframes, sizing, and risk limits.',
      stopCondition: 'Capabilities include Pine-like engine support and valid risk parameters.',
    }, async () => listStrategyCapabilities())

    const parsed = await record({
      nextTool: 'parse_strategy_prompt',
      input: { prompt: input.goal, timeframe: input.timeframe, bars: input.chartBars },
      goalState: 'Convert the user request into local strategy constraints.',
      why: 'The prompt contains token, timeframe, risk, and side preferences that every later tool must preserve.',
      expectedArtifact: 'Parsed rules with token list, allocation, stop loss, take profit, and triggers.',
      stopCondition: 'Rules contain at least one token and a risk profile.',
    }, async () => ({
      rules: parseStrategy(input.goal),
    }))

    const market = await record({
      nextTool: 'analyze_market_context',
      input: { prompt: input.goal },
      goalState: 'Choose a strategy family and timeframe using market context.',
      why: 'The reference agent grounds EMA periods, timeframe, and regime choice before drafting.',
      expectedArtifact: 'Market regime, recommended timeframe, and EMA guidance.',
      stopCondition: 'A recommended timeframe and regime are available.',
    }, async () => analyzeMarketContext({ prompt: input.goal, timeframe: input.timeframe, bars: input.chartBars }))

    const templates = await record({
      nextTool: 'list_strategy_templates',
      input: { prompt: input.goal },
      goalState: 'Check whether a built-in strategy template matches the goal.',
      why: 'Templates reduce malformed drafts and mirror the production creation flow.',
      expectedArtifact: 'Ranked candidate templates.',
      stopCondition: 'A template can be cloned or the agent can generate custom Pine-like source.',
    }, async () => listStrategyTemplates({ prompt: input.goal }))

    let pine = null
    let draft = null
    const bestTemplate = templates.templates?.slice().sort((a, b) => b.score - a.score)[0]
    if (bestTemplate && bestTemplate.score >= 0.7) {
      draft = await record({
        nextTool: 'clone_strategy_template',
        input: { templateId: bestTemplate.id, prompt: input.goal, ownerAddress: input.ownerAddress },
        goalState: 'Create the initial strategy draft from the closest safe template.',
        why: `${bestTemplate.name} matches the requested idea and avoids a brittle from-scratch draft.`,
        expectedArtifact: 'Draft strategy with engine, timeframe, sides, sizing, and risk rules.',
        stopCondition: 'A draft strategy exists and can be updated or validated.',
      }, async () => cloneStrategyTemplate({ templateId: bestTemplate.id, prompt: input.goal, ownerAddress: input.ownerAddress }))
      pine = {
        script: draft.strategy.rules.script,
        engine: draft.strategy.engine,
        summary: draft.strategy.name,
        tokenSymbol: draft.strategy.tokenSymbol,
        timeframe: draft.strategy.timeframe,
        enabledSides: draft.strategy.enabledSides,
      }
    } else {
      pine = await record({
        nextTool: 'generate_pine_like_strategy',
        input: { prompt: input.goal, timeframe: market.analysis?.recommendedTimeframe },
        goalState: 'Generate an engine-backed strategy source.',
        why: 'No template scored high enough, so custom Pine-like source is the safest creation path.',
        expectedArtifact: 'Pine-like script and normalized engine payload.',
        stopCondition: 'Script contains entry and exit conditions for enabled sides.',
      }, async () => generatePineLikeStrategy({ prompt: input.goal, timeframe: market.analysis?.recommendedTimeframe }))
      draft = {
        strategy: buildStrategyDraft({
          prompt: input.goal,
          ownerAddress: input.ownerAddress,
          rules: parsed.rules,
          pine,
        }).strategy,
      }
    }

    const updated = await record({
      nextTool: 'update_strategy_draft',
      input: {
        strategy: draft.strategy,
        patch: {
          timeframe: market.analysis?.recommendedTimeframe || draft.strategy.timeframe,
          costModel: { ...draft.strategy.costModel, startingEquity: input.portfolioSize },
        },
      },
      goalState: 'Align the draft with market context and requested portfolio settings.',
      why: 'The draft should preserve template logic while matching timeframe, costs, and risk fields before validation.',
      expectedArtifact: 'Updated complete strategy draft.',
      stopCondition: 'Draft has synchronized rules, risk, cost model, and engine.',
    }, async () => updateStrategyDraft({
      strategy: draft.strategy,
      patch: {
        timeframe: market.analysis?.recommendedTimeframe || draft.strategy.timeframe,
        costModel: { ...draft.strategy.costModel, startingEquity: input.portfolioSize },
      },
    }))

    let strategy = updated.strategy
    let draftValidation = await record({
      nextTool: 'validate_strategy_draft',
      input: { strategy },
      goalState: 'Validate the complete strategy before any backtest.',
      why: 'Backtests should run only against a schema-safe strategy draft.',
      expectedArtifact: 'Validation result and any repairable issues.',
      stopCondition: 'Validation passes or reports concrete issues to fix.',
    }, async () => validateStrategyDraft({ strategy }))

    if (!draftValidation.validation.ok) {
      warnings.push('Validation found issues; applied a minimal automatic repair before continuing.')
      const repaired = await record({
        nextTool: 'update_strategy_draft',
        input: { strategy, patch: { enabledSides: strategy.enabledSides?.length ? strategy.enabledSides : ['long'] } },
        goalState: 'Repair validation issues without changing the user intent.',
        why: 'The agent should correct itself when validation returns actionable issues.',
        expectedArtifact: 'Repaired strategy draft.',
        stopCondition: 'The repaired draft can be validated again.',
      }, async () => updateStrategyDraft({
        strategy,
        patch: { enabledSides: strategy.enabledSides?.length ? strategy.enabledSides : ['long'] },
      }))
      strategy = repaired.strategy
      draftValidation = await record({
        nextTool: 'validate_strategy_draft',
        input: { strategy },
        goalState: 'Confirm the repair fixed validation.',
        why: 'A correction is not trusted until validation passes.',
        expectedArtifact: 'Clean validation result.',
        stopCondition: 'Validation passes or the run stops with a blocker.',
      }, async () => validateStrategyDraft({ strategy }))
    }

    const riskValidation = await record({
      nextTool: 'validate_strategy_risk',
      input: { rules: strategyToRules(strategy) },
      goalState: 'Score risk controls for the chat and receipt.',
      why: 'The app still uses local risk scoring in addition to draft validation.',
      expectedArtifact: 'Risk score and check list.',
      stopCondition: 'Risk checks are available for review.',
    }, async () => ({
      validation: validateRisk(strategyToRules(strategy)),
    }))

    let backtest = null
    if (wantsBacktest(input.goal)) {
      backtest = await record({
        nextTool: 'run_strategy_backtest',
        input: { rules: strategyToRules(strategy), portfolioSize: input.portfolioSize },
        goalState: 'Evaluate the validated strategy against the backtest engine.',
        why: 'The user explicitly requested a test/backtest, so this is mandatory before final response.',
        expectedArtifact: 'Backtest summary, trades, equity curve, and data source.',
        stopCondition: 'A summary exists with PnL, win rate, max drawdown, and profit factor.',
      }, async () => ({
        backtest: await runBacktest(strategyToRules(strategy), input.portfolioSize),
      }))

      const assessment = assessBacktest(backtest.backtest)
      if (!assessment.acceptable) {
        warnings.push(assessment.reason)
        const optimized = await record({
          nextTool: 'update_strategy_draft',
          input: {
            strategy,
            patch: {
              riskRules: {
                ...strategy.riskRules,
                stopLossPct: Math.max(3, Math.min(8, Number(strategy.riskRules?.stopLossPct || 6))),
                takeProfitPct: Math.max(6, Number(strategy.riskRules?.takeProfitPct || 12)),
                trailingStopPct: Math.max(1, Math.round(Number(strategy.riskRules?.stopLossPct || 6) / 2)),
              },
            },
          },
          goalState: 'Optimize the draft after a weak initial backtest.',
          why: 'A quick retry loop tightens exits and adds trailing protection while preserving the strategy family.',
          expectedArtifact: 'Optimized draft strategy.',
          stopCondition: 'The optimized draft is ready for a second validation and backtest.',
        }, async () => updateStrategyDraft({
          strategy,
          patch: {
            riskRules: {
              ...strategy.riskRules,
              stopLossPct: Math.max(3, Math.min(8, Number(strategy.riskRules?.stopLossPct || 6))),
              takeProfitPct: Math.max(6, Number(strategy.riskRules?.takeProfitPct || 12)),
              trailingStopPct: Math.max(1, Math.round(Number(strategy.riskRules?.stopLossPct || 6) / 2)),
            },
          },
        }))
        strategy = optimized.strategy
        await record({
          nextTool: 'validate_strategy_draft',
          input: { strategy },
          goalState: 'Validate the optimized draft.',
          why: 'Optimization changed risk fields, so validation runs again before retesting.',
          expectedArtifact: 'Validation result for optimized strategy.',
          stopCondition: 'Validation passes.',
        }, async () => validateStrategyDraft({ strategy }))
        backtest = await record({
          nextTool: 'run_strategy_backtest',
          input: { rules: strategyToRules(strategy), portfolioSize: input.portfolioSize },
          goalState: 'Retest the optimized strategy.',
          why: 'The correction loop must prove whether the optimized parameters improved the result.',
          expectedArtifact: 'Second backtest summary.',
          stopCondition: 'Backtest returns final review metrics.',
        }, async () => ({
          backtest: await runBacktest(strategyToRules(strategy), input.portfolioSize),
        }))
      }
    }

    const receipt = await record({
      nextTool: 'prepare_strategy_receipt',
      input: {
      prompt: input.goal,
      rules: strategyToRules(strategy),
      metrics: backtest?.backtest?.summary || null,
      },
      goalState: 'Prepare a stable receipt for the final strategy artifact.',
      why: 'Receipts should be based on the final validated and backtested payload, not an early draft.',
      expectedArtifact: 'SHA-256 receipt hash and payload.',
      stopCondition: 'Receipt hash exists and can be saved or signed by the wallet later.',
    }, async () => ({
      receipt: await prepareStrategyReceipt({
        prompt: input.goal,
        rules: strategyToRules(strategy),
        metrics: backtest?.backtest?.summary || null,
      }),
    }))

    return {
      requestId: randomUUID(),
      finalMessage: backtest
        ? 'Strategy generated, risk-checked, backtested, and prepared for receipt.'
        : 'Strategy generated, risk-checked, and prepared for receipt.',
      usedTools: trace.map((entry) => entry.tool),
      toolTrace: trace,
      artifacts: {
        strategy,
        rules: strategyToRules(strategy),
        ...(pine ? { pine, engine: pine.engine } : {}),
        validation: riskValidation.validation,
        draftValidation: draftValidation.validation,
        capabilities: capabilities.capabilities,
        market: market.analysis,
        templates: templates.templates,
        ...(backtest ? { backtest: backtest.backtest } : {}),
        receipt: receipt.receipt,
      },
      modelModeUsed: 'deterministic-tools',
      warnings,
    }
  }
}
