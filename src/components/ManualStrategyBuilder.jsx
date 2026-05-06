import React, { useEffect, useMemo, useState } from 'react'
import { TOKEN_LIST } from '../config'
import {
  MANUAL_INDICATORS,
  MANUAL_OPERATORS,
  MANUAL_PRICE_FIELDS,
  MANUAL_TEMPLATES,
  MANUAL_TIMEFRAMES,
  activeIndicatorSummary,
  buildManualStrategyScript,
  createManualDraft,
  makeGroup,
  makeOperand,
  makeRule,
} from '../lib/manualStrategy'

const FIELD_CLASS = 'w-full bg-sinergy-bg border border-sinergy-border rounded-lg px-2.5 py-2 text-xs text-sinergy-text focus:border-sinergy-accent/60 transition-all'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function updateInRules(draft, scope, side, groupId, ruleId, updater) {
  const next = clone(draft)
  next[scope][side] = next[scope][side].map((group) => {
    if (group.id !== groupId) return group
    return {
      ...group,
      rules: group.rules.map((rule) => (rule.id === ruleId ? updater(rule) : rule)),
    }
  })
  return next
}

function OperandEditor({ operand, onChange }) {
  const indicator = MANUAL_INDICATORS.find((item) => item.kind === operand.indicator) || MANUAL_INDICATORS[0]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <select
        value={operand.type}
        onChange={(e) => onChange(makeOperand(e.target.value))}
        className={FIELD_CLASS}
      >
        <option value="price">Price</option>
        <option value="indicator">Indicator</option>
        <option value="constant">Constant</option>
      </select>

      {operand.type === 'price' && (
        <>
          <select
            value={operand.field}
            onChange={(e) => onChange({ ...operand, field: e.target.value })}
            className={FIELD_CLASS}
          >
            {MANUAL_PRICE_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
          </select>
          <NumberField label="Bars Ago" value={operand.barsAgo || 0} min={0} onChange={(value) => onChange({ ...operand, barsAgo: value })} />
        </>
      )}

      {operand.type === 'constant' && (
        <NumberField label="Value" value={operand.value} onChange={(value) => onChange({ ...operand, value })} />
      )}

      {operand.type === 'indicator' && (
        <>
          <select
            value={operand.indicator}
            onChange={(e) => {
              const next = MANUAL_INDICATORS.find((item) => item.kind === e.target.value) || MANUAL_INDICATORS[0]
              const sourceParam = next.params.find((param) => param.key === 'source')
              const periodParam = next.params.find((param) => param.key === 'period')
              onChange({
                type: 'indicator',
                indicator: next.kind,
                source: sourceParam?.defaultValue || 'close',
                period: periodParam?.defaultValue || 14,
                barsAgo: operand.barsAgo || 0,
              })
            }}
            className={FIELD_CLASS}
          >
            {MANUAL_INDICATORS.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
          </select>

          {indicator.params.some((param) => param.key === 'source') && (
            <select
              value={operand.source || 'close'}
              onChange={(e) => onChange({ ...operand, source: e.target.value })}
              className={FIELD_CLASS}
            >
              {MANUAL_PRICE_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
            </select>
          )}

          {indicator.params.some((param) => param.key === 'period') && (
            <NumberField label="Period" value={operand.period || 14} min={1} onChange={(value) => onChange({ ...operand, period: value })} />
          )}

          <NumberField label="Bars Ago" value={operand.barsAgo || 0} min={0} onChange={(value) => onChange({ ...operand, barsAgo: value })} />
        </>
      )}
    </div>
  )
}

function NumberField({ label, value, onChange, min }) {
  return (
    <label className="relative">
      <span className="absolute -top-1.5 left-2 bg-sinergy-bg px-1 text-[8px] uppercase tracking-wider text-sinergy-muted">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={FIELD_CLASS}
      />
    </label>
  )
}

function RuleGroupEditor({ title, groups, scope, side, draft, setDraft }) {
  const setGroups = (groupsNext) => {
    setDraft({ ...clone(draft), [scope]: { ...draft[scope], [side]: groupsNext } })
  }

  return (
    <div className="border border-sinergy-border rounded-xl bg-sinergy-bg/40 p-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h4 className="text-xs font-semibold text-sinergy-text">{title}</h4>
          <p className="text-[10px] text-sinergy-muted mt-0.5">Blocks are OR. Rules inside a block are AND.</p>
        </div>
        <button
          type="button"
          onClick={() => setGroups([...groups, makeGroup()])}
          className="px-2.5 py-1.5 rounded-lg border border-sinergy-border text-sinergy-muted hover:text-sinergy-text text-[10px] transition-all"
        >
          Add Block
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="text-xs text-sinergy-muted bg-sinergy-surface rounded-lg p-3">No rules configured.</div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className="border border-sinergy-border/70 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-sinergy-cyan">BLOCK {groupIndex + 1}</span>
                <button
                  type="button"
                  onClick={() => setGroups(groups.filter((item) => item.id !== group.id))}
                  className="text-[10px] text-sinergy-red hover:text-sinergy-red/80"
                >
                  Remove
                </button>
              </div>

              {group.rules.map((rule, ruleIndex) => (
                <div key={rule.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-sinergy-muted">{ruleIndex === 0 ? 'IF' : 'AND'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextGroups = groups.map((item) => item.id === group.id
                          ? { ...item, rules: item.rules.filter((entry) => entry.id !== rule.id) }
                          : item)
                        setGroups(nextGroups)
                      }}
                      className="text-[10px] text-sinergy-muted hover:text-sinergy-red"
                    >
                      Remove Rule
                    </button>
                  </div>
                  <OperandEditor
                    operand={rule.left}
                    onChange={(left) => setDraft(updateInRules(draft, scope, side, group.id, rule.id, (current) => ({ ...current, left })))}
                  />
                  <div className="grid grid-cols-1 lg:grid-cols-[160px_1fr] gap-2">
                    <select
                      value={rule.operator}
                      onChange={(e) => setDraft(updateInRules(draft, scope, side, group.id, rule.id, (current) => ({ ...current, operator: e.target.value })))}
                      className={FIELD_CLASS}
                    >
                      {MANUAL_OPERATORS.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                    </select>
                    <OperandEditor
                      operand={rule.right}
                      onChange={(right) => setDraft(updateInRules(draft, scope, side, group.id, rule.id, (current) => ({ ...current, right })))}
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const nextGroups = groups.map((item) => item.id === group.id
                    ? { ...item, rules: [...item.rules, makeRule()] }
                    : item)
                  setGroups(nextGroups)
                }}
                className="w-full rounded-lg border border-dashed border-sinergy-border py-2 text-[10px] text-sinergy-muted hover:text-sinergy-text hover:border-sinergy-accent/50 transition-all"
              >
                Add AND Rule
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ManualStrategyBuilder({ initialDraft, onChange }) {
  const [draft, setDraft] = useState(() => initialDraft || createManualDraft())
  const [activeSide, setActiveSide] = useState('long')
  const script = useMemo(() => buildManualStrategyScript(draft), [draft])
  const indicators = useMemo(() => activeIndicatorSummary(draft), [draft])

  useEffect(() => {
    onChange?.(script, draft)
  }, [script, draft, onChange])

  const setField = (key, value) => setDraft({ ...clone(draft), [key]: value })
  const sideEnabled = draft.enabledSides.includes(activeSide)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        <div className="space-y-4">
          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-sinergy-text mb-3">Templates</h3>
            <div className="space-y-2">
              {MANUAL_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    const next = createManualDraft(template.id)
                    setDraft(next)
                    setActiveSide(next.enabledSides.includes('long') ? 'long' : 'short')
                  }}
                  className="w-full text-left rounded-lg border border-sinergy-border bg-sinergy-bg px-3 py-2 hover:border-sinergy-accent/60 transition-all"
                >
                  <div className="text-xs font-semibold text-sinergy-text">{template.name}</div>
                  <div className="text-[10px] text-sinergy-muted mt-0.5">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-sinergy-text">Strategy Setup</h3>
            <input
              value={draft.name}
              onChange={(e) => setField('name', e.target.value)}
              className={FIELD_CLASS}
              placeholder="Strategy name"
            />
            <div className="grid grid-cols-2 gap-2">
              <select value={draft.tokenSymbol} onChange={(e) => setField('tokenSymbol', e.target.value)} className={FIELD_CLASS}>
                {TOKEN_LIST.map((token) => <option key={token.symbol} value={token.symbol}>{token.symbol}</option>)}
              </select>
              <select value={draft.timeframe} onChange={(e) => setField('timeframe', e.target.value)} className={FIELD_CLASS}>
                {MANUAL_TIMEFRAMES.map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['long', 'short'].map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => {
                    const enabled = draft.enabledSides.includes(side)
                    const enabledSides = enabled ? draft.enabledSides.filter((item) => item !== side) : [...draft.enabledSides, side]
                    setField('enabledSides', enabledSides.length ? enabledSides : [side])
                    setActiveSide(side)
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-mono transition-all ${
                    draft.enabledSides.includes(side)
                      ? side === 'long' ? 'bg-sinergy-green/15 text-sinergy-green border border-sinergy-green/30' : 'bg-sinergy-red/15 text-sinergy-red border border-sinergy-red/30'
                      : 'bg-sinergy-bg border border-sinergy-border text-sinergy-muted'
                  }`}
                >
                  {side.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-sinergy-text">Risk Management</h3>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Allocation %" value={draft.allocation} min={1} onChange={(value) => setField('allocation', value)} />
              <NumberField label="Stop Loss %" value={draft.stopLoss} min={0} onChange={(value) => setField('stopLoss', value)} />
              <NumberField label="Take Profit %" value={draft.takeProfit} min={0} onChange={(value) => setField('takeProfit', value)} />
              <NumberField label="Trail Stop %" value={draft.trailingStop} min={0} onChange={(value) => setField('trailingStop', value)} />
              <NumberField label="Max Bars" value={draft.maxBars} min={0} onChange={(value) => setField('maxBars', value)} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-xs font-semibold text-sinergy-text">Active Indicators</h3>
                <p className="text-[10px] text-sinergy-muted mt-0.5">Detected from your rule operands and reused in the generated script.</p>
              </div>
              <span className="text-[10px] font-mono text-sinergy-muted">{indicators.length} active</span>
            </div>
            {indicators.length === 0 ? (
              <div className="text-xs text-sinergy-muted bg-sinergy-bg rounded-lg p-3">No indicators yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {indicators.map((indicator) => (
                  <div key={indicator.key} className="rounded-lg bg-sinergy-bg border border-sinergy-border p-3">
                    <div className="text-xs font-semibold text-sinergy-text">{indicator.label}</div>
                    <div className="text-[10px] font-mono text-sinergy-muted mt-1">
                      {indicator.source || 'range'} {indicator.period ? `/${indicator.period}` : ''} {indicator.barsAgo ? `[${indicator.barsAgo}]` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xs font-semibold text-sinergy-text">Trading Rules</h3>
                <p className="text-[10px] text-sinergy-muted mt-0.5">Configure each side independently, like the original strategy editor.</p>
              </div>
              <div className="flex gap-1">
                {['long', 'short'].map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setActiveSide(side)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                      activeSide === side ? 'bg-sinergy-accent text-white' : 'bg-sinergy-bg border border-sinergy-border text-sinergy-muted'
                    }`}
                  >
                    {side.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {sideEnabled ? (
              <div className="space-y-3">
                <RuleGroupEditor title={`${activeSide.toUpperCase()} Entry`} groups={draft.entryRules[activeSide]} scope="entryRules" side={activeSide} draft={draft} setDraft={setDraft} />
                <RuleGroupEditor title={`${activeSide.toUpperCase()} Exit`} groups={draft.exitRules[activeSide]} scope="exitRules" side={activeSide} draft={draft} setDraft={setDraft} />
              </div>
            ) : (
              <div className="text-xs text-sinergy-muted bg-sinergy-bg rounded-lg p-4">Enable {activeSide.toUpperCase()} to configure these rules.</div>
            )}
          </div>

          <div className="bg-sinergy-surface border border-sinergy-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-sinergy-text mb-2">Generated Pine-like Script</h3>
            <pre className="max-h-64 overflow-auto bg-sinergy-bg rounded-lg border border-sinergy-border p-3 text-[10px] text-sinergy-muted font-mono whitespace-pre-wrap">{script}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}
