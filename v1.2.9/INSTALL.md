# StarMemory DSH Plugin v1.2.9 安装指南

## 版本说明

v1.2.9 修复**激活总开关 bug**（v1.2.8 测试机确诊，bug #5）：host 永久 pending 不激活，工具/Config/client 全没起来。

### 根因（测试机铁证）
`index.mjs` 的 `inject` 写了 `['tools', 'effect']`，但 **`effect` 不是可注入服务，是 ctx 自带方法**。DSH 把 `'effect'` 当要注入的服务去等 → 等不到 → **host 永远 pending 不激活** → 26 工具/Config/client 全没起来 → 面板空白。

| 插件 | inject | 用 ctx.effect？ | 激活？ |
|---|---|---|---|
| nekowhale | `['tools']` | 否 | ✅ |
| bili-whale | `['sessionController','webServer','connection']` | 是（未声明 effect） | ✅ |
| starmemory (v1.2.8) | `['tools','effect']` | 是（声明了 effect） | ❌ pending(waiting for service: effect) |

### 修复（v1.2.9）
- `export const inject = ['tools', 'effect']` → `['tools']`（`ctx.effect(...)` 调用代码不动，删 inject 里的 `'effect'` 即可）。
- 注释改正确语义：effect 是 ctx 自带方法，绝不能写进 inject（bili-whale 用 ctx.effect() 不声明也激活是铁证）。
- 门禁 `check:package` 加第四条：index.mjs 的 `inject` 不得含 `'effect'`（防回归），且必须含 `'tools'`。

### 与 v1.2.8 的差异
- `inject` 只留 `['tools']`；check-package 门禁加 inject 检查。
- 结构、数据通道、权威规则、26 工具、视觉、i18n、打包配置、首次安装面板修复、schemastery 依赖全部不变。

## 安装步骤（必须正规安装）

### 1. 安装插件（git 源，一行，bundle 自动挂载，profile 闭包自动注入 SDK）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.9
```

> 不要用本地 link / 手动拷目录安装：会绕过 plugin_manager，依赖三字段留空导致 `schemastery` 找不到（v1.2.6 已确认走正规装）。

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```
激活不再 pending（不再 `waiting for service: effect`）；`memory_ping` 返回 `version: "1.2.9"`。

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（v1.2.5 版，验收点不变；另测 i18n B3）。
