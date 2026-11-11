// memory_manual：说明书工具（查询 manual.json，未命中回退 README.md 摘录）
// 资产位置：包根 manual.json / README.md（从 import.meta.url 上溯两级）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MANUAL_PATH = path.join(PKG_ROOT, 'manual.json')
const README_PATH = path.join(PKG_ROOT, 'README.md')

export function createManualTool() {
  return {
    name: 'memory_manual',
    description: '【说明书工具】查询记忆插件的使用说明、工具用法、架构逻辑。当用户询问插件结构、工具如何使用、配置文件含义、数据存储方式等问题时，AI应主动使用此工具查询。参数keyword为查询关键词，不提供则返回完整说明书。查询不到时自动搜索插件目录下的README.md补充',
    parameters: {
      keyword: { type: 'string', description: '查询关键词（可选，不提供则返回完整说明书）' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      let manual
      try {
        manual = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf-8'))
      } catch (e) {
        return err(`Manual not found: ${e.message}`)
      }
      if (args.keyword) {
        const kw = args.keyword.toLowerCase()
        const searchInObject = (obj, p = '') => {
          const results = []
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = p ? `${p}.${key}` : key
            if (typeof value === 'string') {
              if (value.toLowerCase().includes(kw)) results.push({ path: currentPath, key, value })
            } else if (typeof value === 'object' && value !== null) {
              results.push(...searchInObject(value, currentPath))
            }
          }
          return results
        }
        const results = searchInObject(manual)
        if (results.length > 0) {
          return ok({ keyword: args.keyword, count: results.length, results: results.slice(0, 10) }, { count: results.length })
        }
        // 回退：README.md 摘录（命中词前后各取一段）
        try {
          const readmeContent = fs.readFileSync(README_PATH, 'utf-8')
          const idx = readmeContent.toLowerCase().indexOf(kw)
          if (idx !== -1) {
            const start = Math.max(0, idx - 200)
            const end = Math.min(readmeContent.length, idx + 800)
            let snippet = readmeContent.substring(start, end)
            if (start > 0) snippet = '...\n' + snippet
            if (end < readmeContent.length) snippet = snippet + '\n...'
            return ok({ keyword: args.keyword, source: 'README.md', snippet })
          }
        } catch {}
        return err(`Keyword "${args.keyword}" not found in manual or README`)
      }
      return ok({ manual })
    },
  }
}
