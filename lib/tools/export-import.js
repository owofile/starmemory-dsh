// memory_export / memory_import：备份导出与导入
// 逻辑直译自 OpenCode 版；导出默认路径改为数据根（~/.starmemory/memory-backup-时间戳.json）

import fs from 'node:fs'
import path from 'node:path'
import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createExportTool({ store }) {
  return {
    name: 'memory_export',
    description: '导出碎片记忆+长期记忆到备份 JSON（默认数据根下 memory-backup-时间戳.json）',
    parameters: {
      path: { type: 'string', description: '导出路径（可选，默认数据根下带时间戳）' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const fragments = store.loadFragments()
      const memory = store.loadMemory() || {}
      const backup = {
        version: '2.2.1',
        exported_at: new Date().toISOString(),
        fragments,
        memory,
      }
      const ts = backup.exported_at.replace(/[:.]/g, '-')
      const outPath = args.path || path.join(store.dataRoot, `memory-backup-${ts}.json`)
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf-8')
      return ok({ path: outPath, fragments: fragments.length, exported_at: backup.exported_at })
    },
  }
}

export function createImportTool({ store }) {
  return {
    name: 'memory_import',
    description: '从备份 JSON 导入碎片记忆（mode=merge 按 id 去重合并 / replace 整体替换，默认 merge；长期记忆不自动覆盖）',
    parameters: {
      path: { type: 'string', required: true, description: '备份 JSON 路径（必填）' },
      mode: { type: 'string', enum: ['merge', 'replace'], description: '导入模式，默认 merge' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      if (!args.path || !fs.existsSync(args.path)) return err(`文件不存在: ${args.path}`)
      let data
      try {
        data = JSON.parse(fs.readFileSync(args.path, 'utf-8'))
      } catch (e) {
        return err(`JSON 解析失败: ${e.message}`)
      }
      const inFrags = Array.isArray(data.fragments) ? data.fragments : []
      if (!inFrags.length) return err('备份无碎片（fragments 为空）')
      const mode = args.mode || 'merge'
      const cur = store.loadFragments()
      let result
      if (mode === 'replace') {
        store.saveFragments(inFrags)
        result = { mode, imported: inFrags.length, total: inFrags.length }
      } else {
        const curIds = new Set(cur.map((f) => f.id))
        const added = inFrags.filter((f) => !curIds.has(f.id))
        store.saveFragments([...cur, ...added])
        result = { mode, imported: added.length, skipped: inFrags.length - added.length, total: cur.length + added.length }
      }
      return ok(result)
    },
  }
}
