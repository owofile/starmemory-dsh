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
import { createFragmentStatsTool } from './lib/tools/fragment-stats.js'
import { createFragmentCompactTool } from './lib/tools/fragment-compact.js'
import { createFragmentDreamTool } from './lib/tools/fragment-dream.js'
import { createArchiveStatusTool } from './lib/tools/archive-status.js'
import { createFragmentRestoreTool } from './lib/tools/fragment-restore.js'
import { createFragmentDiagnosisTool } from './lib/tools/fragment-diagnosis.js'
import { createExportTool, createImportTool } from './lib/tools/export-import.js'
import { createManualTool } from './lib/tools/manual.js'
import { createSynonymViewTool, createSynonymAddTool, createSynonymDeleteTool, createSynonymUpdateTool } from './lib/tools/synonym-map.js'
import { createSqliteTool } from './lib/tools/sqlite.js'
import { createRecallSetTool, createRecallEnableTool, createRecallStatusTool, createRecallPreviewTool } from './lib/tools/recall.js'
import { pingTool } from './lib/tools/memory-ping.js'

export const name = 'starmemory-dsh'
// 依赖注入声明：用啥服务必须在此声明，DSH 才会挂到 ctx 上（测试机实测教训：
// inject=[] 时 ctx.tools 是 undefined，注册循环第一轮就抛错）。
// effect 显式声明（有些版本默认在 ctx 上，但显式更符合契约）。
export const inject = ['tools', 'effect']

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
    // P0
    createMemoryTool(deps),
    createFragmentAddTool(deps),
    createFragmentSearchTool(deps),
    createFragmentViewTool(deps),
    createFragmentUpdateTool(deps),
    createFragmentDeleteTool(deps),
    createFragmentDeepSearchTool(deps),
    // P1
    createFragmentStatsTool(deps),
    createFragmentCompactTool(deps),
    createFragmentDreamTool(deps),
    createArchiveStatusTool(deps),
    createFragmentRestoreTool(deps),
    createFragmentDiagnosisTool(deps),
    // P2
    createExportTool(deps),
    createImportTool(deps),
    createManualTool(),
    createSynonymViewTool(deps),
    createSynonymAddTool(deps),
    createSynonymDeleteTool(deps),
    createSynonymUpdateTool(deps),
    createSqliteTool(deps),
    // P3
    createRecallSetTool(deps),
    createRecallEnableTool(deps),
    createRecallStatusTool(deps),
    createRecallPreviewTool(deps),
  ]
  for (const tool of tools) ctx.tools.register(defineTool(tool))
}
