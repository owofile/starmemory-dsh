// memory_fragment_stats：碎片统计（分层/分类/权重/召回频次/30天未用）
// 逻辑直译自 OpenCode 版 index.js

import { ok, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createFragmentStatsTool({ store }) {
  return {
    name: 'memory_fragment_stats',
    description: '查看碎片统计',
    parameters: {},
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute() {
      const fragments = store.loadFragments()
      const by_layer = { deep: 0, surface: 0 }
      const by_category = {}
      let totalWeight = 0
      let totalFreq = 0
      for (const f of fragments) {
        by_layer[f.layer || 'surface']++
        const cat = f.category || 'general'
        by_category[cat] = (by_category[cat] || 0) + 1
        totalWeight += f.weight || 0.5
        totalFreq += f.recall_frequency || 0
      }
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const unused_over_30days = fragments.filter((f) => !f.last_recalled || new Date(f.last_recalled) < thirtyDaysAgo).length
      return ok({
        stats: {
          total: fragments.length,
          by_layer,
          by_category,
          avg_weight: fragments.length ? totalWeight / fragments.length : 0,
          avg_recall_frequency: fragments.length ? totalFreq / fragments.length : 0,
          unused_over_30days,
        },
      })
    },
  }
}
