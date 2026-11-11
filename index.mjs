// StarMemory DSH 插件 —— Cordis entry（bundle 包，无 client half）
//
// 契约要点（PORT.md §4）：
// - 命名导出 name / inject / apply（default 导出不会被 unwrapExports 识别）
// - inject 只声明用到的 ctx 服务；依赖三字段留空由 profile 闭包注入
// - 工具注册是 effect 式，卸载自动注销；SQLite 句柄用 ctx.effect 的 disposer 关闭
//
// defineTool 导入收口在 apply 内（单点）：若安装版 dsh 的导出名/来源不同，只改这一处。

import path from 'node:path'
import { createMemoryTool } from './lib/tools/memory.js'
import { createFragmentAddTool } from './lib/tools/fragment-add.js'
import { createFragmentSearchTool } from './lib/tools/fragment-search.js'
import { createFragmentViewTool, createFragmentUpdateTool, createFragmentDeleteTool } from './lib/tools/fragment-crud.js'
import { createFragmentDeepSearchTool } from './lib/tools/fragment-deep-search.js'
import { pingTool } from './lib/tools/memory-ping.js'

export const name = 'starmemory-dsh'
export const inject = []

export async function apply(ctx) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const { createStore, resolveDataRoot } = await import('./lib/store.js')
  const { openArchive } = await import('./lib/archive.js')

  const dataRoot = resolveDataRoot()
  const store = createStore(dataRoot)

  // P5 迁移（幂等，启动时执行）：自动佐证升级 + 衰减参数修复
  store.migrateCorroborated()
  store.migrateDecayParams()

  // SQLite 归档句柄：apply 期创建，ctx.effect 的 disposer 在卸载时自动关闭
  const archive = openArchive(path.join(dataRoot, 'archive.db'))
  ctx.effect(() => {
    return () => { archive.close() }
  })

  const deps = { store, getArchive: () => archive }
  const tools = [
    pingTool,
    createMemoryTool(deps),
    createFragmentAddTool(deps),
    createFragmentSearchTool(deps),
    createFragmentViewTool(deps),
    createFragmentUpdateTool(deps),
    createFragmentDeleteTool(deps),
    createFragmentDeepSearchTool(deps),
  ]
  for (const tool of tools) ctx.tools.register(defineTool(tool))

  // Phase 3+ 起在此追加：P1（stats/compact/dream/archive_status/restore/diagnosis）、
  // P2（export/import/manual/synonym_map_*）、P3（recall_*）
}
