# StarMemory DSH Plugin - 说明书

## 概述

这是一个分层记忆管理系统，融合了长期记忆（结构化）和碎片记忆（自由格式），并通过 SQLite 归档实现数据循环。本插件从 OpenCode 版移植到 DSH（DeepSeek Harness），核心机制不变，接入方式按 DSH 契约重做。

**与 OpenCode 版的核心差异**：DSH 版不做钩子自动注入（DSH 请求深冻结，无消息改写钩子），改为 Agent 主动调用记忆工具完成召回与记录；召回习惯由 Agent 的 preset 人设指令约定（见下文「召回约定」）。

## 插件规范（DSH / Cordis）

| 项目 | 值 |
|------|-----|
| SDK | `@deepseek-ai/dsh-tools`（由 profile 依赖闭包注入，包内依赖三字段留空） |
| 插件 ID | `starmemory-dsh` |
| 形态 | 纯 cordis 插件包（无 `dsh.bundle.patch`，无 client half） |
| 入口 | `index.mjs` 命名导出 `name` / `inject` / `apply` |
| 数据根 | `~/.starmemory/`（可用环境变量 `STARMEMORY_DATA_DIR` 覆盖） |
| SQLite | `node:sqlite`（Node 内置，无需外部依赖） |

### 安装

```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#path:/v1.0.0/plugins/starmemory-dsh
```

然后在 profile 的 `cordis.patch.yml` 写一行 insert：

```yaml
- insert:
    - id: starmemory-dsh
      name: 'starmemory-dsh'
```

> `name` 必须加引号（YAML 保留字符）。安装后重开新会话，Agent 即可调用 memory 工具集合。

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│                    StarMemory DSH 系统                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │  长期记忆    │     │  碎片记忆    │     │   SQLite    │   │
│  │ memory.json │     │ fragments.json│    │  归档存储   │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│         │                   │                   │           │
│         └───────────────────┼───────────────────┘           │
│                             │                               │
│              ┌──────────────┴──────────────┐                │
│              │      memory 工具集合         │                │
│              │   (查看/添加/更新/删除/搜索) │                │
│              └─────────────────────────────┘                │
│                                                              │
│  碎片整理循环：                                               │
│  碎片记忆 → compact(整理) → SQLite归档                        │
│      ↑                                    ↓                   │
│      └──── deep_search(深度查询) ←──────┘                   │
│                                                              │
│  召回方式（DSH 版）：                                          │
│  Agent 主动调用 memory_fragment_search / deep_search          │
│  （OpenCode 版的 context 钩子自动注入在此不适用）               │
└──────────────────────────────────────────────────────────────┘
```

## 文件结构

```
starmemory-dsh/                      # 仓库根（与 OpenCode 版仓库架构一致）
├── v1.0.0/                          # DSH 第一个版本（后续新版本都是版本号文件夹）
│   ├── VERSION.txt                  # 版本号
│   ├── INSTALL.md                   # 安装指南
│   └── plugins/starmemory-dsh/      # npm 包根
│       ├── package.json             # 依赖三字段留空（由 profile 闭包注入）
│       ├── index.mjs                # Cordis entry（命名导出 name/inject/apply）
│       ├── icon.svg                 # 插件图标（顶层 icon 字段）
│       ├── locale/                  # en.json / zh.json（meta.title / meta.description）
│       ├── manual.json              # 说明书数据（memory_manual 工具消费）
│       ├── lib/
│       │   ├── store.js             # 三份 JSON 数据文件读写（原子写）
│       │   ├── archive.js           # node:sqlite 归档层
│       │   ├── recall.js            # 召回引擎（四道闸门 + Token 预算 + 同义词扩展）
│       │   └── tools/               # 每工具一个定义模块（纯数据+逻辑，不 import SDK）
│       ├── scripts/                 # 本机开发门禁脚本（不进 files 白名单）
│       └── test/                    # node --test 单测（不进 files 白名单）
├── docs/                            # 设计文档
├── png/                             # 图片资源
├── bugs/                            # bug 记录（按版本）
└── README.md
```

## 数据文件

| 文件 | 位置 | 说明 |
|------|------|------|
| `memory.json` | `~/.starmemory/` | 长期记忆（用户偏好、规则、项目等） |
| `fragments.json` | `~/.starmemory/` | 碎片记忆（热数据，JSON格式） |
| `associations_map.json` | `~/.starmemory/` | 同义词映射表 |
| `recall-runtime.json` | `~/.starmemory/` | 召回运行时档位 |
| `archive.db` | `~/.starmemory/` | SQLite 数据库（冷数据归档） |

> 用户数据不进插件安装目录（npm 重装即丢数据）；重装/升级插件不影响 `~/.starmemory/` 里的数据。

## 工具列表

全部工具的参数与用法说明可随时调用 `memory_manual` 获取（内置说明书数据）。

### 系统配置工具 (memory)

`memory action=view|add|update|delete|search` + `category` / `key` / `value` / `extra`。

管理 memory.json 系统配置（用户偏好、安全规则、项目）。

```
memory action=view
memory action=add category=user.preferences key=响应风格 value=简洁直接
memory action=delete category=user.preferences key=响应风格
```

### 碎片记忆工具 (memory_fragment_*)

| 工具 | 用途 |
|------|------|
| `memory_fragment_add` | 添加记忆碎片（associations 自动从 content 提取，自动同步同义词映射） |
| `memory_fragment_search` | 搜索碎片（带温度随机性和同义词扩展） |
| `memory_fragment_deep_search` | 深度查询（JSON + SQLite 归档双查，命中自动恢复） |
| `memory_fragment_view` | 查看碎片列表（按分类/层筛选） |
| `memory_fragment_update` | 更新碎片字段 |
| `memory_fragment_delete` | 删除碎片 |
| `memory_fragment_stats` | 碎片统计 |
| `memory_fragment_compact` | 整理碎片（冷数据归档到 SQLite） |
| `memory_fragment_dream` | 梦想家（巩固流转 + 温度重算 + 类型分化，只标记不归档） |
| `memory_fragment_archive_status` | 归档状态 |
| `memory_fragment_restore` | 从 SQLite 归档恢复碎片 |
| `memory_fragment_diagnosis` | 记忆状态诊断（配置/统计/AI建议） |

### 召回运行时 (memory_recall_*)

| 工具 | 用途 |
|------|------|
| `memory_recall_set` | 设置召回档位（0-6，0=OFF；写 recall-runtime.json） |
| `memory_recall_enable` | 启用/关闭自动召回 |
| `memory_recall_status` | 查看召回开关与档位 |
| `memory_recall_preview` | 预览自动召回候选（四道闸门 + Token 预算，不写库） |

> OpenCode 版的召回滑块 UI 在 DSH 版不适用，档位改为工具读写。

### 同义词映射 (synonym_map_*)

`synonym_map_view` / `synonym_map_add` / `synonym_map_delete` / `synonym_map_update`。

管理中英文同义词映射（碎片记忆的关键词扩展用）。

### 数据迁移 (memory_export / memory_import)

`memory_export`（导出到备份 JSON）/ `memory_import`（merge 按 id 去重合并 / replace 整体替换）。

### 说明书工具 (memory_manual)

`memory_manual` + 可选 `keyword`。查询插件使用说明、工具用法、架构逻辑；查询不到时自动搜索源码 README 补充。

### 测试工具 (memory_sqlite)

`memory_sqlite action=set|get|delete|list`。SQLite key-value 测试工具。

## 召回约定（给 preset 的人设模板）

OpenCode 版由 context 钩子在每次请求前自动注入 `[LONG-TERM MEMORY]`；DSH 版改为 Agent 主动调用。在 Agent preset 的人设指令里加一段：

> 本 Agent 配有分层记忆（StarMemory 插件）。会话开始或遇到用户偏好/项目背景类问题时，先调 `memory_fragment_search`（查不到再 `memory_fragment_deep_search` 深查归档）；记录用户新偏好/习惯/项目背景时调 `memory_fragment_add`；管理规则请调 `memory_manual`。

## 与 OpenCode 版的差异

| 项 | OpenCode 版 | DSH 版 |
|------|------|------|
| 自动注入 | context/prompt 钩子自动注入 | 无钩子；Agent 主动调工具 + preset 人设约定 |
| 召回 UI | TUI 滑块（/memory 召回 Tab） | 无 UI；档位为工具（memory_recall_*） |
| 数据位置 | `~/.config/opencode/` | `~/.starmemory/`（不进插件目录） |
| SQLite | sql.js（纯 JS） | node:sqlite（Node 内置） |
| 工具契约 | `ctx.tool.transform` + input schema + `{content}` 返回 | `defineTool` + 强类型 schema + 单一 canonical 返回值 |
| 安装 | 目录自动发现 | `dsh plugin add` git 源 + profile insert 行 |

## 兼容性

| DSH 基线 | 状态 |
|------|------|
| 0.2.x（安装版实测为准） | 目标基线；schema 子集规则以安装版运行时为准 |

> 契约冲突时以安装的 dsh 运行时为准；服务名跨 rc 可能改名，升级基线时重核。
