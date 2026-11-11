# StarMemory DSH Plugin v1.2.8 安装指南

## 版本说明

v1.2.8 修复**依赖版本漂移导致的激活失败**（v1.2.7 测试机确诊，bug #4）。

### 根因（测试机铁证）
插件 `Config` 用了 `z.boolean().default().volatile()`，但 `package.json` 的 `dependencies` **未声明 `@deepseek-ai/schemastery`**（假设 SDK 由 profile 闭包注入）。pnpm hoisted 时把全局 schemastery 定成 **3.18.1**（该版本**无 `.volatile()`**），插件解析到旧版 → `TypeError: ...volatile is not a function` → host 侧激活失败。而 DSH 本体用的是 **3.19.0**（有 `.volatile()`）。

| schemastery 版本 | `.volatile()` |
|---|---|
| 3.18.1（插件 hoisted 到） | 无 |
| 3.19.0（DSH 本体用） | 有 |

### 修复（v1.2.8）
- `package.json` 加 `"dependencies": { "@deepseek-ai/schemastery": "^3.19.0" }`——强制解析到 ≥3.19.0（有 `.volatile()`），杜绝 hoist 到旧版。
- 门禁 `check:package` 加第三条：schemastery 依赖必须声明且范围可达 ≥3.19.0（防回归）。
- `.volatile()` 本身是 live-sync 关键（panel 改值 → `loader/volatile-update` → 同步 recall-runtime.json），**不能丢**——保留原逻辑。

### 与 v1.2.7 的差异
- `dependencies` 声明 schemastery `^3.19.0`；check-package 门禁加版本约束检查。
- 结构、数据通道、权威规则、26 工具、视觉、i18n、打包配置（files/inject）、首次安装面板修复全部不变。

## 安装步骤（必须正规安装）

### 1. 安装插件（git 源，一行，bundle 自动挂载，profile 闭包自动注入 SDK）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.8
```

> 不要用本地 link / 手动拷目录安装：会绕过 plugin_manager，依赖三字段留空导致 `schemastery` 找不到（v1.2.6 已确认走正规装）。

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```
激活不再报 `volatile is not a function`；`memory_ping` 返回 `version: "1.2.8"`。

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（v1.2.5 版，验收点不变；另测 i18n B3）。
