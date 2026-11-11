// memory_fragment_view / update / delete：碎片列表查看、字段更新、删除

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createFragmentViewTool({ store }) {
  return {
    name: 'memory_fragment_view',
    description: '查看碎片列表',
    parameters: {
      category: { type: 'string', description: '按分类筛选（可选）' },
      layer: { type: 'string', description: '按层筛选（可选）' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      let fragments = store.loadFragments()
      if (args.category) fragments = fragments.filter((f) => f.category === args.category)
      if (args.layer) fragments = fragments.filter((f) => f.layer === args.layer)
      return ok({ fragments }, { count: fragments.length })
    },
  }
}

export function createFragmentUpdateTool({ store }) {
  return {
    name: 'memory_fragment_update',
    description: '更新碎片',
    parameters: {
      id: { type: 'string', required: true, description: '碎片 ID' },
      content: { type: 'string', description: '新内容（可选）' },
      category: { type: 'string', description: '分类（可选）' },
      layer: { type: 'string', enum: ['surface', 'deep'], description: '层（可选）' },
      weight: { type: 'number', description: '权重 0-1（可选）' },
      source: { type: 'string', enum: ['explicit', 'inferred'], description: '来源（可选）' },
      source_type: { type: 'string', enum: ['inferred', 'corroborated', 'user_confirmed'], description: '佐证分类（可选）' },
      confidence: { type: 'number', description: '置信度 0-1（可选）' },
      memory_type: { type: 'string', enum: ['semantic', 'episodic', 'preference', 'procedure'], description: '记忆类型（可选）' },
      ttl_policy: { type: 'string', enum: ['none', 'fixed', 'reconfirm_required'], description: '过期策略（可选）' },
      expires_at: { type: 'string', description: '过期时间 ISO（可选）' },
      consolidation_status: { type: 'string', enum: ['transient', 'consolidated', 'archived'], description: '巩固状态（可选）' },
      base_activation: { type: 'number', description: '基础激活 0-1（可选）' },
      stability: { type: 'number', description: '稳定性 0-1（可选）' },
      decay_rate: { type: 'number', description: '衰减率 0-1（可选）' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const fragments = store.loadFragments()
      const idx = fragments.findIndex((f) => f.id === args.id)
      if (idx === -1) return err('Fragment not found', { id: args.id })
      const frag = fragments[idx]
      if (args.content !== undefined) {
        frag.content = args.content
        frag.associations = store.extractKeywordsBound(args.content)
      }
      if (args.category !== undefined) frag.category = args.category
      if (args.layer !== undefined) frag.layer = args.layer
      if (args.weight !== undefined) frag.weight = args.weight
      if (args.source !== undefined) frag.source = args.source
      for (const k of ['source_type', 'confidence', 'memory_type', 'ttl_policy', 'expires_at', 'consolidation_status', 'base_activation', 'stability', 'decay_rate']) {
        if (args[k] !== undefined) frag[k] = args[k]
      }
      store.saveFragments(fragments)
      return ok({ fragment: frag }, { id: frag.id })
    },
  }
}

export function createFragmentDeleteTool({ store }) {
  return {
    name: 'memory_fragment_delete',
    description: '删除碎片',
    parameters: {
      id: { type: 'string', required: true, description: '碎片 ID' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const fragments = store.loadFragments()
      const idx = fragments.findIndex((f) => f.id === args.id)
      if (idx === -1) return err('Fragment not found', { id: args.id })
      fragments.splice(idx, 1)
      store.saveFragments(fragments)
      return ok({ deleted: args.id }, { id: args.id })
    },
  }
}
