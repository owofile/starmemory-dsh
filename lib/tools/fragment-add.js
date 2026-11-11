// memory_fragment_add：添加记忆碎片（associations 自动从 content 提取，同步中英文同义词映射）

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'
import { FRAGMENT_DEFAULTS, normalizeCategory, genId } from '../core.js'

export function createFragmentAddTool({ store }) {
  return {
    name: 'memory_fragment_add',
    description: '添加记忆碎片（associations将自动从content提取）。同时自动调用synonym_map_add将中英文关键词添加到同义词映射表。',
    parameters: {
      content: { type: 'string', required: true, description: '记忆内容' },
      associations: { type: 'array', items: { type: 'string' }, description: '关键词数组，用于搜索匹配（可选，默认自动提取）' },
      category: { type: 'string', description: '分类，默认 general' },
      layer: { type: 'string', enum: ['surface', 'deep'], description: '记忆层，默认 surface' },
      source: { type: 'string', enum: ['explicit', 'inferred'], description: '来源，默认 explicit' },
      source_type: { type: 'string', enum: ['inferred', 'corroborated', 'user_confirmed'], description: '佐证分类，默认 inferred' },
      memory_type: { type: 'string', enum: ['semantic', 'episodic', 'preference', 'procedure'], description: '记忆类型，默认 semantic' },
      confidence: { type: 'number', description: '置信度 0-1，默认 0.5' },
      ttl_policy: { type: 'string', enum: ['none', 'fixed', 'reconfirm_required'], description: '过期策略，默认 none' },
      expires_at: { type: 'string', description: '过期时间 ISO，可选' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const id = genId()
      const assocs = args.associations?.length > 0 ? args.associations : store.extractKeywordsBound(args.content)
      const fragment = {
        ...FRAGMENT_DEFAULTS,
        id,
        content: args.content,
        category: normalizeCategory(args.category) || 'general',
        layer: args.layer || 'surface',
        weight: 0.5,
        source: args.source || 'explicit',
        associations: assocs,
        created_at: new Date().toISOString(),
        access_count: 0,
        last_recalled: null,
        recall_frequency: 0,
      }
      for (const k of ['source_type', 'memory_type', 'confidence', 'ttl_policy', 'expires_at']) {
        if (args[k] !== undefined) fragment[k] = args[k]
      }
      const fragments = store.loadFragments()
      fragments.push(fragment)
      store.saveFragments(fragments)
      const mappingsAdded = store.learnMappings(assocs)
      return ok({ fragment, mappingsAdded }, { id })
    },
  }
}
