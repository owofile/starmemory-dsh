# StarMemory DSH Plugin v1.1.1 安装指南

## 版本说明

v1.1.1 是 v1.1.0（26 工具完整移植版）的**真机验收修复版**：测试机首次真机测试全链路跑通后，修复两个"接缝"问题（详见 `bugs/v1.1.1-inject-and-sdk.md`）。

### 与 v1.1.0 的差异
- **修复 inject 漏声明**（主因）：`inject` 从 `[]` 改为 `['tools', 'effect']`。DSH 是依赖注入架构，v1.1.0 在真机上 `ctx.tools` 为 undefined，26 个工具全部注册失败
- README 补充安装约束：**必须走 plugin_manager 正规安装**（`dsh plugin add`），它会自动注入 `@deepseek-ai/dsh-tools` SDK；手动 link 安装会报 `Cannot find package`（需自行补 SDK junction 链接）
- 业务逻辑（26 工具 + 数据层 + 归档 + 召回引擎）与 v1.1.0 完全一致，真机测试已验证：工具注册、memory_ping、碎片写/搜/统计、SQLite 归档全通过

## 安装步骤

### 1. 安装插件（git 源，一行，bundle 自动挂载）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.1.1
```

> 不钉版本可写 `github:owofile/starmemory-dsh`（默认分支 HEAD）；建议钉 tag。旧版本用对应 tag（`#vX.Y.Z`）。
> **必须走 plugin_manager**：手动 link 安装绕过 SDK 注入机制。

### 2. 验证

1. 启动 / 重启 dsh，启动日志无 `plugin tree failed to load` / `did not activate`
2. Plugins 页能看到 StarMemory（图标、标题、描述正常）
3. `~/.starmemory/` 目录创建，内有 `archive.db`（激活即建库）
4. 调 `memory_ping` → `{ status: 'ok', version: '1.1.1' }`
5. 全链路真调：`memory_fragment_add` → `memory_fragment_search` → `memory_fragment_deep_search`
6. 负控：查不存在内容返回空结果（status ok），删不存在 id 返回 status error

### 3. 数据迁移（从 OpenCode 版）

`node scripts/migrate.mjs` 先看 dry-run 报告，确认后加 `--apply`；或 OpenCode 版 `memory_export` 导出 → DSH 版 `memory_import` 导入。迁移是复制不是剪切，旧数据保留。

## 卸载

```sh
dsh plugin --profile web remove starmemory-dsh
```

用户数据在 `~/.starmemory/`，卸载插件不影响数据。

## 故障排查

| 现象 | 处理 |
|------|------|
| `ctx.tools` undefined / 工具一个没注册但 archive.db 建了 | inject 声明问题，v1.1.1 已修；确认装的是 v1.1.1（ping 看 version） |
| `Cannot find package '@deepseek-ai/dsh-tools'` | 手动安装绕过 SDK 注入；改用 plugin_manager 装，或手动 junction SDK |
| 启动日志 `did not activate` | 确认 profile 依赖闭包含 `@deepseek-ai/dsh-tools` |
| Node < 22（无 node:sqlite） | 升级 Node |
| 数据未迁移 | `node scripts/migrate.mjs --apply`，报告检查 5 个文件 valid=true |
