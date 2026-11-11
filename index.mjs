// StarMemory DSH 插件 —— Cordis entry（bundle 包，无 client half）
//
// 契约要点（PORT.md §4）：
// - 命名导出 name / inject / apply（default 导出不会被 unwrapExports 识别）
// - inject 只声明用到的 ctx 服务；依赖三字段留空由 profile 闭包注入
// - 工具注册是 effect 式，卸载自动注销；SQLite 句柄用 ctx.effect 的 disposer 关闭
//
// defineTool 导入收口在 apply 内（单点）：若安装版 dsh 的导出名/来源不同，只改这一处。

import path from 'node:path'
// schemastery 用 dsh 的 fork（.volatile() 只在 fork 里；公共 npm 版没有）。
// Config 必须是静态命名导出（loader unwrapExports 只认命名导出，见 PORT.md §4）。
import z from '@deepseek-ai/schemastery'
import { createRecallConfigSync } from './lib/config.js'
import { createLogger } from './lib/log.js'
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
import { pingTool, PING_VERSION } from './lib/tools/memory-ping.js'

export const name = 'starmemory-dsh'
// 依赖注入声明：用啥服务必须在此声明，DSH 才会挂到 ctx 上（测试机实测教训：
// inject=[] 时 ctx.tools 是 undefined，注册循环第一轮就抛错）。
// 注意：effect 是 ctx 自带方法，不是可注入服务——绝不能写进 inject（否则 DSH
// 等一个叫 'effect' 的服务，永远 pending 不激活，测试机 bug #5 铁证：bili-whale
// 用 ctx.effect() 不声明也能激活）。故 inject 只列真正的服务（tools）。
export const inject = ['tools']

// ===== 设置面（v1.2.0）：召回开关 + 档位进 Plugins 页配置卡片 =====
// 设置命名空间 = 导出 Config 的条目 id（= 'starmemory-dsh'，与包名恰好相同）。
// 三个叶全部 volatile：改值宿主原地提交不重挂载，值照样持久化进 profile patch；
// 只有叶能标 volatile（容器标了写整组路径不被认，见 references/07 §1）。
// 权威规则（recallPanelConfigured 切双权威）见 lib/config.js 头注。
export const Config = z.object({
  recallEnabled: z.boolean().default(false).volatile(),
  recallEffort: z.number().min(0).max(6).default(0).volatile(),
  recallPanelConfigured: z.boolean().default(false).volatile(),
})

export async function apply(ctx, config) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const { createStore, resolveDataRoot } = await import('./lib/store.js')
  const { openArchive } = await import('./lib/archive.js')

  const dataRoot = resolveDataRoot()
  const store = createStore(dataRoot)
  const log = createLogger({ file: path.join(dataRoot, 'plugin.log') })
  log.info('apply start', { version: PING_VERSION })

  // P5 迁移（幂等，启动时执行）：自动佐证升级 + 衰减参数修复
  store.migrateCorroborated()
  store.migrateDecayParams()

  // SQLite 归档句柄：apply 期创建，ctx.effect 的 disposer 在卸载时自动关闭
  const archive = openArchive(path.join(dataRoot, 'archive.db'))
  log.info('archive opened')
  ctx.effect(() => {
    return () => {
      log.info('archive closing')
      archive.close()
    }
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
  log.info('tools registered', { count: tools.length })

  // ===== 召回配置同步（v1.2.0）：面板 Config ↔ recall-runtime.json =====
  // 权威规则：recallPanelConfigured=true → Config 为持久权威，apply 与
  // loader/volatile-update 时同步进 recall-runtime.json；false → runtime 为准。
  // 详情：lib/config.js 头注。
  const sync = createRecallConfigSync({
    setRecallEnabled: store.setRecallEnabled,
    setRecallLevel: store.setRecallLevel,
  })
  const syncRecallConfig = (reason) => {
    try {
      const r = sync.applyConfig(config)
      log.info('recall config sync', { reason, synced: r.synced, enabled: r.cfg.recallEnabled, effort: r.cfg.recallEffort })
    } catch (e) {
      log.error('recall config sync failed', { reason, error: String(e && e.stack ? e.stack : e) })
    }
  }
  syncRecallConfig('apply')
  // 改配置后必须重读：volatile 只保证不重挂载，插件要自己重读再交给业务对象
  if (typeof ctx.on === 'function') {
    ctx.effect(() => ctx.on('loader/volatile-update', () => syncRecallConfig('volatile-update')), 'starmemory-dsh: recall config sync')
  } else {
    log.warn('ctx.on unavailable; volatile-update sync disabled')
  }
  log.info('apply complete', { version: PING_VERSION })
}
