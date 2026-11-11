# StarMemory DSH Plugin v1.2.10 安装指南

## 版本说明

v1.2.10 修复 **client 侧服务注入失败**（v1.2.9 测试机确诊，bug #6）：Plugins 页卡片 + 聊天区滑块不出现，Console 零输出（静默）。

### 根因（测试机铁证，浏览器插桩）
apply 被调用但 **`ctx` 上只有 `fiber`**，声明的 `slots`/`locale`/`configForms` **一个都没挂上**。第一行业务代码 `ctx.slots.inject(...)` / `ctx.configForms.get(...)` 抛 `TypeError`，被 apply 的 try/catch 吞掉（所以无红字）→ 卡片/滑块没注册 → 面板空白。

**client 侧 DSH 对 `inject` 要么整批成功、要么整批失败**：starmemory 一次 inject `['slots','locale','configForms']` 全没挂上；对照能用的插件——nekowhale 只 inject `['slots']`（成功），configForms 用**回调式 `ctx.inject(['configForms','settingsSchema'], (sctx) => {...})`** 拿。

### 修复（v1.2.10，nekowhale 验证姿势）
1. `module.exports.inject = ['slots']`（只声明确定能用的 slots，删 locale/configForms）。
2. `configForms` 经 **`ctx.inject(['configForms','settingsSchema'], (sctx) => {...})`** 回调拿 scope → 建 bridge/commit → 在回调内注册两个 slot。
3. `locale` 单独 `ctx.inject(['locale'], cb)` 最佳努力（失败/服务名不可解析 → `t.setLocale` 不升级，回退中文；不影响 configForms）。
4. `makeTranslator` 改可升级版：`tr.setLocale(localeService)` 闭包共享（locale 异步注入后语言切换仍即时生效）。

### 与 v1.2.9 的差异
- client inject 只 `['slots']`；configForms/locale 改回调式访问；makeTranslator 加 setLocale。
- 门禁 `check:package` 加第五条：client inject 必须含 `'slots'` 且不得含其他服务（防整批失败回归）。
- 结构、数据通道、权威规则、26 工具、视觉、i18n（字典）、打包配置、首次安装面板修复、schemastery 依赖全部不变。

## 安装步骤（必须正规安装）

### 1. 安装插件（git 源，一行，bundle 自动挂载，profile 闭包自动注入 SDK）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.10
```

> 不要用本地 link / 手动拷目录安装：会绕过 plugin_manager，依赖三字段留空导致 `schemastery` 找不到（v1.2.6 已确认走正规装）。

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```
Console 有 `[starmemory]` 正常 log（不再是静默）；Plugins 页出现 StarMemory 卡片（首次禁用/占位态）；开「自动召回」→ 聊天区右上角滑块出现；无 `TypeError`、无白屏。

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（v1.2.5 版，验收点不变；另测 i18n B3）。
