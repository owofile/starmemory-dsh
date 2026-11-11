// memory_fragment_search：搜索记忆碎片（带温度随机性和同义词扩展）
// 逻辑直译自 OpenCode 版（含结构化过滤 / 排序模式 / 命中回写）

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'
import { computeActivation, applyFragmentFilters } from '../core.js'

export function createFragmentSearchTool({ store }) {
  return {
    name: 'memory_fragment_search',
    description: '搜索记忆碎片（带温度随机性和同义词扩展）',
    parameters: {
      query: { type: 'string', required: true, description: '搜索关键词' },
      temperature: { type: 'number', description: '随机性 0-1，默认 0.5' },
      limit: { type: 'number', description: '返回数量，默认 5' },
      layer: { type: 'string', enum: ['surface', 'deep'], description: '只搜索指定层（可选）' },
      weight_threshold: { type: 'number', description: '权重下限，默认 0.2' },
      source_type: { type: 'string', enum: ['inferred', 'corroborated', 'user_confirmed'], description: '只看此佐证分类（可选）' },
      memory_type: { type: 'string', enum: ['semantic', 'episodic', 'preference', 'procedure'], description: '只看此记忆类型（可选）' },
      consolidation: { type: 'string', enum: ['transient', 'consolidated', 'archived'], description: '只看此巩固状态（可选）' },
      exclude_expired: { type: 'boolean', description: '排除过期项（可选）' },
      min_activation: { type: 'number', description: '最小激活度 0-1（可选）' },
      sort: { type: 'string', enum: ['relevance', 'activation', 'weight'], description: '排序：relevance=相关性(默认) | activation=激活度 | weight=权重' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const { query, temperature = 0.5, limit = 5, layer, weight_threshold = 0.2, sort = 'relevance' } = args
      let fragments = store.loadFragments()
      if (layer) fragments = fragments.filter((f) => f.layer === layer)
      fragments = fragments.filter((f) => f.weight >= weight_threshold)
      fragments = applyFragmentFilters(fragments, args)

      const expandedQueries = store.expandQueryBound(query)
      const scored = fragments.map((f) => {
        let matchScore = 0
        const matchedTerms = []
        for (const q of expandedQueries) {
          if (f.content.toLowerCase().includes(q)) {
            matchScore += 1
            matchedTerms.push(q)
          }
          for (const a of f.associations || []) {
            if (a.toLowerCase().includes(q)) {
              matchScore += 0.8
              matchedTerms.push(a)
            }
          }
        }
        return { ...f, matchScore, matchedTerms: [...new Set(matchedTerms)] }
      }).filter((f) => f.matchScore > 0)

      scored.sort((a, b) => b.matchScore - a.matchScore)
      const selected = []
      for (let i = 0; i < Math.min(scored.length, limit * 2); i++) {
        const f = scored[i]
        const prob = f.weight * (1 - temperature * 0.5) + Math.random() * temperature * 0.5
        if (prob > weight_threshold || selected.length < limit) {
          if (selected.length < limit) {
            selected.push(f)
            store.updateRecall(f.id)
          }
        }
      }
      // 排序：relevance/weight 用权重降序，activation 用激活度
      if (sort === 'activation') selected.sort((a, b) => computeActivation(b) - computeActivation(a))
      else selected.sort((a, b) => b.weight - a.weight)

      const results = selected.slice(0, limit).map((f) => ({ ...f, activation: computeActivation(f) }))
      return ok({ results }, { count: results.length })
    },
  }
}
