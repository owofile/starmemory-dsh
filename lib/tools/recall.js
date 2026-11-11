// P3 召回四工具：recall_set / recall_enable / recall_status / recall_preview
// 逻辑直译自 OpenCode 版；候选选择走 core.autoRecallCandidates（四道闸门 + Token 预算，只读不写库）

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'
import { autoRecallCandidates, BASE_CONTEXT_TOKENS } from '../core.js'

export function createRecallSetTool({ store }) {
  return {
    name: 'memory_recall_set',
    description: '设置自动召回档位（0-6，0=OFF；写 recall-runtime.json，TUI 滑块实时读取）',
    parameters: {
      effort: { type: 'number', required: true, description: '档位 0-6，0=OFF，1-6 递增预算/topK/相关性放宽' },
      enabled: { type: 'boolean', description: '启用自动召回功能（可选，默认保持现有）' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const rec = store.setRecallLevel(args.effort)
      if (args.enabled !== undefined) store.setRecallEnabled(args.enabled)
      return ok({
        enabled: args.enabled !== undefined ? args.enabled : rec.enabled,
        effort: rec.effort,
        budget: rec.budget,
        topK: rec.topK,
        label: rec.label,
        labelZh: rec.labelZh,
        pct: rec.pct,
        relMin: rec.relMin,
        updated_at: rec.updated_at,
      }, { id: String(rec.effort) })
    },
  }
}

export function createRecallEnableTool({ store }) {
  return {
    name: 'memory_recall_enable',
    description: '启用/关闭自动召回功能（开=显示滑块+生效；关=隐藏滑块+仅主动召回）',
    parameters: {
      enabled: { type: 'boolean', required: true, description: 'true=启用，false=关闭（默认=关闭，仅主动召回）' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const rec = store.setRecallEnabled(args.enabled)
      return ok({
        enabled: rec.enabled,
        effort: rec.effort,
        label: rec.label,
        labelZh: rec.labelZh,
        pct: rec.pct,
        updated_at: rec.updated_at,
      })
    },
  }
}

export function createRecallStatusTool({ store }) {
  return {
    name: 'memory_recall_status',
    description: '查看自动召回功能开关、档位与预设',
    parameters: {},
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute() {
      const p = store.loadRecallParams()
      return ok({
        enabled: p.enabled,
        effort: p.effort,
        label: p.label,
        labelZh: p.labelZh,
        pct: p.pct,
        budget: p.budget,
        topK: p.topK,
        tempMin: p.tempMin,
        relMin: p.relMin,
        cold: p.cold,
        updated_at: p.updated_at,
        runtime_file: store.paths.recallRuntime,
      })
    },
  }
}

export function createRecallPreviewTool({ store }) {
  return {
    name: 'memory_recall_preview',
    description: '预览自动召回候选（四道闸门+Token预算，不写库）',
    parameters: {
      query: { type: 'string', description: '上下文关键词（可选，默认取最近消息）' },
      limit: { type: 'number', description: '返回条数，默认 10' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const p = store.loadRecallParams()
      if (!p.enabled || p.effort === 0) {
        return err('自动召回未启用（enabled=false 或 effort=0）。先调用 memory_recall_enable / memory_recall_set 打开。')
      }
      const candidates = autoRecallCandidates(store.loadFragments(), args.query || '', p)
      const limited = candidates.slice(0, args.limit || 10).map((c) => ({
        id: c.id,
        relevance: Number(c.relevance.toFixed(3)),
        temperature: Number(c.temperature.toFixed(3)),
        tokens: c.tokens,
        source_type: c.source_type,
        content: c.content.slice(0, 80) + (c.content.length > 80 ? '…' : ''),
      }))
      return ok({
        effort: p.effort,
        budget_tokens: Math.floor(p.budget * BASE_CONTEXT_TOKENS),
        candidates_total: candidates.length,
        selected: limited,
      }, { count: limited.length })
    },
  }
}
