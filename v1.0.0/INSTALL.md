# StarMemory DSH Plugin v1.0.0 安装指南

## 版本说明

v1.0.0 是 StarMemory 的 DSH（DeepSeek Harness）首个版本：从 OpenCode 版全量移植 24 个记忆工具（四批次 P0-P3），接入方式按 DSH 契约重做。

### v1.0.0 内容
- **全量工具移植**：memory（系统配置）+ memory_fragment_* 12 个（碎片记忆全链路）+ memory_recall_* 4 个（召回运行时）+ synonym_map_* 4 个（同义词映射）+ memory_export/import（数据迁移）+ memory_manual（说明书）+ memory_ping（连通自检）
- **纯 cordis 插件包**：npm 包 + Cordis entry（`index.mjs` 命名导出），无 bundle patch、无 client half
- **SQLite 改 node:sqlite**：Node 内置模块，去掉 sql.js 外部依赖；归档数据库可直接读写
- **数据根独立**：所有用户数据在 `~/.starmemory/`，不进插件安装目录（重装插件不丢数据）
- **召回方式变更**：无钩子自动注入（DSH 请求深冻结），Agent 主动调用 `memory_fragment_search` / `memory_fragment_deep_search` 召回，preset 人设约定召回习惯（模板见插件 README）
- **无新增依赖**：依赖三字段留空，`@deepseek-ai/dsh-tools` 由 profile 闭包注入；SQLite 用 Node 内置 `node:sqlite`

## 安装步骤

### 1. 安装插件（git 源，一行）

```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#path:/v1.0.0/plugins/starmemory-dsh
```

### 2. profile 组合层写 insert 行

编辑 profile 的 `cordis.patch.yml`（web profile 在 `$DSH_HOME/profiles/web/cordis.patch.yml`）：

```yaml
- insert:
    - id: starmemory-dsh
      name: 'starmemory-dsh'
```

> `name` 必须加引号（YAML 保留字符）；patch 文件不能是空文件，暂无其他行时写 `[]`。

### 3. 验证

1. 启动 / 重启 dsh，启动日志无 `plugin tree failed to load` / `did not activate`
2. Plugins 页能看到 StarMemory（图标、标题、描述正常）
3. 新开会话，让 Agent 调 `memory_ping` → 返回 `{ status: 'ok', version: '1.0.0' }`
4. 全链路真调：`memory_fragment_add` 写一条 → `memory_fragment_search` 能搜到 → `memory_fragment_deep_search` 深查归档

### 4. 数据迁移（从 OpenCode 版）

旧数据（OpenCode 版的 `memory.json` / `fragments.json` / `associations_map.json` / `fragment_archive.db`）用 `memory_import` 或随包迁移脚本导入 `~/.starmemory/`。迁移是拷贝不是剪切，旧数据原样保留，OpenCode 版可继续使用。

## 卸载

```sh
dsh plugin --profile web remove starmemory-dsh
```

并删除 profile patch 里的 insert 行。`~/.starmemory/` 数据不受影响，手动清理另行决定。
