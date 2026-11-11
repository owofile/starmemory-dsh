// memory_fragment_restore：从 SQLite 归档恢复碎片（id=恢复单条 / query=搜索预览 / list=归档列表）
// 直译自 OpenCode 版 external/fragment-restorer.js（去 spawn，内联调用）
// 原文行为保留：id 模式恢复+删除归档行；query/list 模式只读不恢复

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createFragmentRestoreTool({ store, getArchive }) {
  return {
    name: 'memory_fragment_restore',
    description: '从SQLite归档恢复碎片（附加功能）',
    parameters: {
      action: { type: 'string', enum: ['id', 'query', 'list'], required: true, description: '恢复方式：id=按ID恢复 / query=按关键词搜索 / list=查看归档列表' },
      param: { type: 'string', description: 'ID 或关键词' },
      limit: { type: 'number', description: '返回数量，默认 20' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const archive = getArchive()
      if (!archive) return err('Archive not available')
      const { action, param, limit } = args

      if (action === 'id') {
        if (!param) return err('Missing required param: param (fragment id)')
        const frag = archive.getById(param)
        if (!frag) return err('Fragment not found in archive', { id: param })
        // upsert 到 JSON
        const fragments = store.loadFragments()
        const idx = fragments.findIndex((f) => f.id === frag.id)
        if (idx !== -1) fragments[idx] = frag
        else fragments.push(frag)
        store.saveFragments(fragments)
        archive.deleteFromArchive(frag.id)
        return ok({ fragment: frag }, { id: frag.id })
      }

      if (action === 'query') {
        if (!param) return err('Missing required param: param (query)')
        // 原文口径：整句 LIKE（非分词），只读预览不恢复
        const rows = archive.db.prepare(
          'SELECT * FROM fragment_archive WHERE content LIKE ? OR associations LIKE ? LIMIT 10',
        ).all(`%${param}%`, `%${param}%`)
        if (rows.length === 0) return err('No fragments found matching query')
        const results = rows.map((row) => {
          const frag = {}
          for (const [k, v] of Object.entries(row)) {
            if (k === 'associations') {
              try { frag[k] = JSON.parse(v || '[]') } catch { frag[k] = [] }
            } else {
              frag[k] = v
            }
          }
          delete frag.archived_at
          return frag
        })
        return ok({ fragments: results, count: results.length }, { count: results.length })
      }

      if (action === 'list') {
        const n = limit || 20
        const archived = archive.listArchived(n)
        return ok({ archived, count: archived.length }, { count: archived.length })
      }

      return err('Unknown action. Use: id, query, list')
    },
  }
}
