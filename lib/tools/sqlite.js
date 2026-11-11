// memory_sqlite：SQLite 键值测试工具（archive.db 的 memory 表，复用归档层 kv 四操作）
// 原文走外部 sqlite-manager.js + 独立 db 文件；DSH 版内联到归档库，行为兼容

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createSqliteTool({ getArchive }) {
  return {
    name: 'memory_sqlite',
    description: 'SQLite 测试工具：存储 key-value（测试用）',
    parameters: {
      action: { type: 'string', enum: ['set', 'get', 'delete', 'list'], required: true, description: '操作' },
      key: { type: 'string', description: '键名' },
      value: { type: 'string', description: '值' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const archive = getArchive()
      if (!archive) return err('Archive not available')
      const { action, key, value } = args
      if (action === 'set') {
        if (!key || value === undefined) return err('Missing required params: key, value')
        return ok(archive.kvSet(key, value), { id: key })
      }
      if (action === 'get') {
        if (!key) return err('Missing required param: key')
        const r = archive.kvGet(key)
        return r.success ? ok(r) : err(r.error, { id: key })
      }
      if (action === 'delete') {
        if (!key) return err('Missing required param: key')
        const r = archive.kvDelete(key)
        return r.success ? ok(r) : err(r.error, { id: key })
      }
      if (action === 'list') {
        return ok(archive.kvList())
      }
      return err('Unknown action')
    },
  }
}
