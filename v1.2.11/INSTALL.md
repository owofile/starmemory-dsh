# StarMemory DSH Plugin v1.2.11 安装指南

## 版本说明

v1.2.11 修复 **Plugins 页设置卡片 + 聊天区滑块不渲染**（v1.2.10 测试机确诊，bug #8）：注册代码无报错但 UI 不出现。

### 根因（对照 dsh-bili-scroll 实测 + 07 文档源码确认）
`plugins.item` 槽（Plugins 页设置卡片）的**声明者/消费者**是 `@deepseek-ai/dsh-client-ui-plugin-manager`。该包**不在客户端种子表**（07-settings-panel.md：`store`/`ui-slots`/`ui-primitives`/`ui-dockkit`），**必须经 `dsh.client.inject` 显式注入** client bundle。

starmemory v1.2.10 的 `dsh.client.inject` 只有 `@deepseek-ai/dsh-client-ui-primitives`，**没注入 plugin-manager** → 应用 bundle 里 `plugins.item` 槽**没有消费者** → 注册成功（`slots` 服务在、`register` 无报错）但**组件永不被调用** → `sm-ef` DOM 计数 0、无 warn/error。

**对照**：`holoiallo/dsh-bili-scroll`（实测能显示设置面板）`dsh.client.inject` 注入了 `@deepseek-ai/dsh-client-ui-settings` + `@deepseek-ai/dsh-client-ui-settings-plugins`（它消费的 `settings.section` 槽声明者包）——印证机制：**槽的声明者包必须注入，否则槽无消费者、注册了也不渲染**。

### 修复（v1.2.11）
- `dsh.client.inject` 加 `@deepseek-ai/dsh-client-ui-plugin-manager`（`plugins.item` 槽声明者），槽名 `plugins.item` 不变（保留 Plugins 页卡片位置）。
- 诊断 log（测试机判读）：apply 入口 ctx keys / configForms 回调 sctx keys / 两个槽注册成功 / **RecallCard 渲染（view）**——组件真被调用 = 槽有消费者 = 渲染链通。
- 门禁 `check:package` 加第六条：`dsh.client.inject` 必须含 `@deepseek-ai/dsh-client-ui-plugin-manager`（防回归）。

### 与 v1.2.10 的差异
- `dsh.client.inject` 加 plugin-manager；RecallCard 首行加诊断 log；check-package 加第六条。
- 结构、数据通道、权威规则、26 工具、视觉、i18n（字典）、打包配置、首次安装面板修复、schemastery 依赖全部不变。

## 安装步骤（必须正规安装）

### 1. 安装插件（git 源，一行，bundle 自动挂载，profile 闭包自动注入 SDK）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.11
```

> 不要用本地 link / 手动拷目录安装：会绕过 plugin_manager，依赖三字段留空导致 `schemastery` 找不到（v1.2.6 已确认走正规装）。

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```
Console 预期顺序：
1. `[starmemory] DEBUG apply called, ctx keys: ...`（apply 入口）
2. `[starmemory] DEBUG configForms cb, sctx keys: ...`（configForms 作用域）
3. `[starmemory] DEBUG registered slot shell.overlay` / `... plugins.item`（两个槽注册成功）
4. **`[starmemory] DEBUG RecallCard rendered, view: summary|page`**（组件真被调用 = 渲染链通）

Plugins 页出现 StarMemory 卡片（首次禁用/占位态）；开「自动召回」→ 聊天区右上角滑块出现；无 `TypeError`、无白屏。

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（v1.2.5 版，验收点不变；另测 i18n B3）。
