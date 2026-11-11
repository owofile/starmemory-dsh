// StarMemory DSH 插件 —— Cordis entry（纯 cordis 包，无 client half）
//
// 契约要点（PORT.md §4）：
// - 命名导出 name / inject / apply（default 导出不会被 unwrapExports 识别）
// - inject 只声明用到的 ctx 服务；依赖三字段留空由 profile 闭包注入
// - 工具注册是 effect 式，卸载自动注销
//
// defineTool 导入收口在 apply 内（单点）：若安装版 dsh 的导出名/来源不同，只改这一处。

export const name = 'starmemory-dsh'
export const inject = []

export async function apply(ctx) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')

  const { pingTool } = await import('./lib/tools/memory-ping.js')
  ctx.tools.register(defineTool(pingTool))

  // Phase 2+ 起在此追加：store/archive 初始化（ctx.effect）+ P0-P3 工具注册
}
