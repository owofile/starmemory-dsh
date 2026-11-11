# v1.1.1 测试机踩坑记录（v1.1.0 首次真机测试）

> 来源：`starmemory-dsh-port/StarMemory-DSH插件开发经验总结.md`（2026-11-11 完整踩坑记录）
> 结论：插件业务逻辑一次就对，卡在两个"接缝"问题，改完全链路跑通（26 工具注册 + LLM 真调 + SQLite/JSON 读写）。

## Bug 1：inject 漏声明 tools（主因，插件代码问题）

- 现象：apply 里 `ctx.tools.register(...)` 报 `Cannot read properties of undefined (reading 'register')`，26 个工具一个没注册，但 `archive.db` 建好了（建库代码在注册循环之前，错误位置误导排查方向）
- 根因：`export const inject = []` 空数组。DSH 是依赖注入架构，apply(ctx) 里的 ctx 不是全知全能的，用哪个服务必须在 inject 数组声明，DSH 才会把服务挂到 ctx 上
- 修复：`export const inject = ['tools', 'effect']`
- 经验：看到 `ctx.<something>` 报 undefined，第一反应查 inject 数组

## Bug 2：SDK 未注入（次因，安装方式问题）

- 现象：`await import('@deepseek-ai/dsh-tools')` 报 `Cannot find package '@deepseek-ai/dsh-tools'`
- 根因：本次测试手动 `link:` 安装绕过了 plugin_manager，插件目录在 profile 外，Node 从插件目录向上找不到 profile node_modules 里的 SDK
- 修复（环境侧）：给插件目录加 node_modules junction 指向 DSH 本体 SDK；正规用 plugin_manager 装不会有此问题
- 经验：README 里"依赖三字段留空由 profile 闭包注入"指的是 plugin.json 不写依赖、由 DSH 装插件时统一注入；手动装要自己补 SDK 链接

## v1.1.1 改动

- index.mjs：`inject` 从 `[]` 改为 `['tools', 'effect']`
- README：入口契约注明 inject 声明规则；安装节注明必须走 plugin_manager
- 排查顺序（继承）：inject 声明 → SDK 解析 → 注册调用栈 → 错误位置陷阱（建库成功 ≠ 全部成功）→ 调 memory_ping 验证端到端
