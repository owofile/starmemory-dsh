# StarMemory DSH Plugin v1.2.12 安装指南

## 版本说明

v1.2.12 修复 **Plugins 页设置面板不渲染**（v1.2.11 测试机确诊，bug #8 收尾）：照抄实测能显示设置的 **nekowhale 整套姿势**。

### v1.2.11 的教训（4 条 DEBUG 铁证）
v1.2.11 只给 `dsh.client.inject` 加了 `@deepseek-ai/dsh-client-ui-plugin-manager`（`plugins.*` 槽声明者），**仍不渲染**：
```
✅ apply called          ✅ configForms cb          ✅ registered slot shell.overlay
✅ registered slot plugins.item      ❌ RecallCard rendered（缺）
```
注册全部成功、无报错，但 **`plugins.item` 槽注册了却没消费者去渲染它**（RecallCard 从未被 React 调用）。

### 根因（对照 nekowhale 源码，实测能显示设置）
`plugins.item` 在 0.2.2-rc.1 上**无消费者**（v1.2.11 证明：注册成功但组件不渲染）。而 **nekowhale**（实测能显示设置）用的是 **`plugins.bundle.config`**（Plugins 页包详情配置）+ `dsh.client.inject` = `@deepseek-ai/dsh-client-ui-renderer` + `@deepseek-ai/dsh-client-ui-layout`（设置 UI 基础设施）+ 注册元数据带 `inject: () => face` + 嵌在 `ctx.inject` 回调里用 `sctx.slots`。

### 修复（v1.2.12，照抄 nekowhale 整套姿势）
- `dsh.client.inject` 加 `@deepseek-ai/dsh-client-ui-renderer` + `@deepseek-ai/dsh-client-ui-layout`（nekowhale 注入的设置 UI 基础设施）。
- 槽 `plugins.item` → **`plugins.bundle.config`**（`key: PKG` 包名），位置从"Plugins 页官方组卡片"变"Plugins 页 starmemory 包详情配置"。
- 注册姿势照 nekowhale：嵌在 `ctx.inject(['configForms','settingsSchema'], (sctx) => ...)` 回调内、用 **`sctx.slots`**（回调作用域）、元数据带 **`inject: () => face`**（惰性 face，`hooks.scope === scope`）。
- `createScopeBridge`/`makeCommit`/`createCard` 不动（face.hooks.scope 就是原 scope，bridge/commit 照旧）。

### 与 v1.2.11 的差异
- inject 加 ui-renderer+ui-layout；槽改 plugins.bundle.config + key:PKG + inject:()=>face + sctx.slots；check-package 加第七/八条。
- 结构、数据通道、权威规则、26 工具、视觉、i18n（字典）、打包配置、首次安装面板修复、schemastery 依赖全部不变。

## 安装步骤（必须正规安装）

### 1. 安装插件（git 源，一行，bundle 自动挂载，profile 闭包自动注入 SDK）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.12
```

> 不要用本地 link / 手动拷目录安装：会绕过 plugin_manager，依赖三字段留空导致 `schemastery` 找不到（v1.2.6 已确认走正规装）。

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```
Console 预期顺序：
1. `[starmemory] DEBUG apply called, ctx keys: ...`
2. `[starmemory] DEBUG configForms cb, sctx keys: ...`
3. `[starmemory] DEBUG registered slot shell.overlay` / `... plugins.bundle.config`
4. **`[starmemory] DEBUG RecallCard rendered, view: page`**（组件真被调用 = 渲染链通）

进 **Plugins 页 → 点开 starmemory-dsh 包 → 详情配置区**，应见 Switch + 0-6 档位；开「自动召回」→ 聊天区右上角滑块出现；无 `TypeError`、无白屏。

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（v1.2.5 版，验收点不变；另测 i18n B3）。
