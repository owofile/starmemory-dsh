# StarMemory DSH Plugin v1.1.0 安装指南

## 版本说明

v1.1.0 是 StarMemory 的 DSH（DeepSeek Harness）完整移植版本：从 OpenCode 版全量移植 26 个记忆工具（四批次 P0-P3），接入方式按 DSH 契约重做。

### v1.1.0 内容
- **全量工具移植**：memory（系统配置）+ memory_fragment_* 12 个（碎片记忆全链路）+ memory_recall_* 4 个（召回运行时）+ synonym_map_* 4 个（同义词映射）+ memory_export/import（数据迁移）+ memory_manual（说明书）+ memory_sqlite（kv 测试）+ memory_ping（连通自检），共 26 个
- **召回引擎**：四道闸门（巩固/时效/温度/相关性）+ 冷记忆特判 + 佐证信任加权 + 近重复去重（Jaccard 3-gram）+ Token 预算截断
- **bundle 插件包**：npm 包 + `dsh.bundle.patch` 自带组合 patch，一行安装即自动挂载
- **SQLite 改 node:sqlite**：Node 内置模块，去掉 sql.js 外部依赖；归档库 24 列无损 schema（兼容旧 fragment_archive.db，自动 ALTER 补列）
- **数据根独立**：所有用户数据在 `~/.starmemory/`，不进插件安装目录（重装插件不丢数据）
- **统一输出契约**：全部工具返回 `{ status, id?, count?, payload }` 单一 canonical 结构
- **召回方式变更**：无钩子自动注入（DSH 请求深冻结），Agent 主动调用 `memory_fragment_search` / `memory_fragment_deep_search` 召回，preset 人设约定召回习惯
- **无新增依赖**：依赖三字段留空，`@deepseek-ai/dsh-tools` 由 profile 闭包注入；SQLite 用 Node 内置 `node:sqlite`
- **迁移演练脚本**：`scripts/migrate.mjs`（dry-run 默认，只复制不删除；从 OpenCode 版数据目录迁到 `~/.starmemory/`）

### 与 v1.0.0 的差异
v1.0.0 为脚手架版本（仅 memory_ping + 门禁）；v1.1.0 为完整功能版（26 工具 + 数据层 + 归档 + 迁移脚本）。

## 安装步骤

### 1. 安装插件（git 源，一行，bundle 自动挂载）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.1.0
```

> bundle 自带组合 patch（`cordis.patch.yml` insert 自身），安装即自动进入 profile bundles 列表，**不需要手写 insert 行**。
> 不钉版本可写 `github:owofile/starmemory-dsh`（默认分支 HEAD）；建议钉 tag。旧版本用对应 tag（`#vX.Y.Z`）。

### 2. 验证

1. 启动 / 重启 dsh，启动日志无 `plugin tree failed to load` / `did not activate`
2. Plugins 页能看到 StarMemory（图标、标题、描述正常）
3. 新开会话，让 Agent 调 `memory_ping` → 返回 `{ status: 'ok', version: '1.1.0' }`
4. 全链路真调：`memory_fragment_add` 写一条 → `memory_fragment_search` 能搜到 → `memory_fragment_deep_search` 深查归档
5. 负控：调 `memory_fragment_search` 查不存在的内容 → 返回空结果不报错

### 3. 数据迁移（从 OpenCode 版）

两种方式：
- **随包脚本**（推荐）：`node scripts/migrate.mjs` 先看 dry-run 报告，确认后加 `--apply`；默认从 `~/.config/opencode/` 复制 memory.json / fragments.json / associations_map.json / recall-runtime.json / fragment_archive.db 到 `~/.starmemory/`
- **工具导入**：`memory_export`（OpenCode 版）导出备份 JSON → `memory_import` 导入（merge 按 id 去重）

迁移是复制不是剪切，旧数据原样保留，OpenCode 版可继续使用。

## 卸载

```sh
dsh plugin --profile web remove starmemory-dsh
```

用户数据在 `~/.starmemory/`，卸载插件不影响数据；如需彻底清理请手动删除该目录。

## 故障排查

| 现象 | 处理 |
|------|------|
| 启动日志 `did not activate` | 确认 profile 依赖闭包含 `@deepseek-ai/dsh-tools`（依赖三字段由 profile 注入） |
| Node < 22（无 node:sqlite） | 升级 Node；node:sqlite 需 Node 22+ |
| 数据未迁移 | 跑 `node scripts/migrate.mjs --apply`，报告里检查 5 个文件 valid=true |
| 工具返回 status=error | 看 payload 里的 error 字段；基础设施故障才会 throw |
