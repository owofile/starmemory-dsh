// memory_fragment_deep_search：深度查询（JSON + SQLite 归档双查，命中自动恢复到 JSON，循环机制）
// 逻辑直译自 OpenCode 版 external/fragment-deep-search.js（去 spawn，内联调用）

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createFragmentDeepSearchTool({ store, getArchive }) {
  return {
    name: 'memory_fragment_deep_search',
    description: '深度查询碎片记忆：同时查询JSON和SQLite归档，找到后自动恢复到JSON（循环机制）',
    parameters: {
      query: { type: 'string', required: true, description: '搜索关键词' },
      limit: { type: 'number', description: '返回数量，默认 5' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const { query, limit = 5 } = args

      // 1) JSON 热数据搜索（分词口径：词命中 content +1 / associations +0.8）
      const terms = store.expandQueryBound(query)
      const jsonResults = store.loadFragments()
        .map((f) => {
          let matchScore = 0
          const content = (f.content || '').toLowerCase()
          const assocs = (f.associations || []).map((a) => String(a).toLowerCase())
          for (const q of terms) {
            if (content.includes(q)) matchScore += 1
            if (assocs.some((a) => a.includes(q))) matchScore += 0.8
          }
          return { ...f, matchScore }
        })
        .filter((f) => f.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit)
        .map((f) => ({ ...f, source: 'json' }))

      // 2) JSON 够数 → 直接返回
      if (jsonResults.length >= limit) {
        return ok({ query, results: jsonResults, total: jsonResults.length, source: 'json', restored_count: 0 }, { count: jsonResults.length })
      }

      // 3) 归档补齐 + 自动恢复到 JSON
      const archive = getArchive()
      if (!archive) return err('Archive not available')
      const archiveResults = archive.searchArchive(query, limit - jsonResults.length)
      let restoredCount = 0
      if (archiveResults.length > 0) {
        const fragments = store.loadFragments()
        for (const frag of archiveResults) {
          const idx = fragments.findIndex((f) => f.id === frag.id)
          const { matchScore, source, ...clean } = frag
          if (idx !== -1) fragments[idx] = clean
          else fragments.push(clean)
          archive.deleteFromArchive(frag.id)
          restoredCount++
        }
        store.saveFragments(fragments)
      }

      const combined = [...jsonResults, ...archiveResults.map((f) => ({ ...f, source: 'archive_restored' }))]
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit)

      return ok(
        { query, results: combined, total: combined.length, found_in_json: jsonResults.length, found_in_archive: archiveResults.length, restored_count: restoredCount, source: 'mixed' },
        { count: combined.length },
      )
    },
  }
}
