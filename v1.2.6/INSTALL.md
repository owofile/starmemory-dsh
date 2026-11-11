# StarMemory DSH Plugin v1.2.6 安装指南

## 版本说明

v1.2.6 是**打包配置修复版**（v1.2.5 在 DSH 实装实测确诊的三连 bug，测试机诊断）。修复后插件能通过正规 `dsh plugin add` 安装并正常显示设置面板/滑块。

### 修复的 bug（v1.2.5 实测确诊）

1. **`files` 漏 `cordis.patch.yml`**：`dsh.bundle.patch` 指向的文件不在 `files` 白名单 → npm/pnpm 按 `files` 过滤后包里没有 bundle patch → DSH 校验 bundle 找不到 patch → 装不上 / 不收进 client bundle。已把 `cordis.patch.yml` 加进 `files`。
2. **`dsh.client` 用 `external`**：DSH 不认 `external`，client half 不加载（面板/滑块都不出）。已改 `dsh.client.inject`，只列消费的 `@deepseek-ai/dsh-client-ui-primitives`；`react` 由 runtime 静态模块表自带，不用列。
3. **`@deepseek-ai/schemastery` 找不到**：不是依赖配置 bug，是**安装方式**问题——之前用本地 link 装（绕过 `plugin_manager`），依赖三字段留空导致 SDK fork 未注入。**正解 = 正规 `dsh plugin add`**（profile 闭包自动注入 fork）；不要把它加进 `dependencies`（DSH fork 有 `.volatile()`，公共 npm 版没有，加 dependencies 可能装到不匹配版本，风险更大）。

### 与 v1.2.5 的差异
- `files` 加 `cordis.patch.yml`；`dsh.client` `external` → `inject`。
- 新增门禁 `check:package`（`scripts/check-package.mjs`）：bundle patch 必须在 `files`、client 必须用 `inject`，锁死 bug 1/2 防回归。
- 结构、数据通道、权威规则、26 工具、视觉、i18n 全部不变。

## 安装步骤（必须正规安装）

### 1. 安装插件（git 源，一行，bundle 自动挂载，profile 闭包自动注入 SDK）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.6
```

> 不要用本地 link / 手动拷目录安装：会绕过 plugin_manager，依赖三字段留空导致 `schemastery` 找不到。若必须手动装，需按 SDK 接缝补链接（见 `StarMemory-DSH插件开发经验总结.md` 坑 2）。

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（v1.2.5 版，验收点不变；另测 i18n B3）。
