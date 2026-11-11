<p align="center">
  <img src="png/banner.png" alt="StarMemory DSH" width="100%" />
</p>

# StarMemory DSH

**StarMemory** 的分层记忆系统移植到 DSH（DeepSeek Harness）的版本。长期记忆 + 碎片记忆 + SQLite 归档三合一，Agent 主动调用记忆工具完成召回与记录；v1.2.0 起带 Plugins 页设置面板与聊天区召回滑块。

> 记忆不是默认拥有的，是被挣来的。反复用到的记忆自动累积信任；久未用到的冷却归档，但永不消失——深度搜索随时找回。

## 关键特性

- **冷热循环**：活跃记忆在 `fragments.json`，久未用归档 SQLite，深度搜索自动恢复——什么都不静默丢失
- **信任累积**：`source_type` / `confidence` / `memory_type`，反复召回自动升级佐证
- **召回可调**：档位 0-6 控制注入强度；v1.2.0 起用聊天区滑块 + 设置面板即时调，不再依赖工具
- **可观测**：`plugin.log` JSON Lines 维护日志；`memory_manual` 内置说明书
- **安全设计**：导出/导入备份、分类归一、过期策略；数据外置 `~/.starmemory/`

## 快速了解

| 项 | 说明 |
|------|------|
| 是什么 | 分层记忆插件：长期记忆（`memory.json`）+ 碎片记忆（`fragments.json`）+ SQLite 冷归档 |
| 怎么用 | Agent 主动调 `memory_fragment_search` / `memory_fragment_add` 等 26 个工具（`memory_manual` 查用法） |
| 召回 UI | 聊天界面右上角滑块（`shell.overlay`）+ Plugins 页设置卡片（`plugins.item`），共用一份配置即时联动 |
| 数据位置 | `~/.starmemory/`（不进插件目录，重装/升级不丢） |
| 安装 | bundle 一行装，见下方「安装」 |
| 版本 | 本体 OpenCode 版在 [owofile/opencode-starmemory-plugins](https://github.com/owofile/opencode-starmemory-plugins) |

## 安装

```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.1
```

> 必须走 plugin_manager 正规安装：它会自动注入 `@deepseek-ai/dsh-tools` SDK；手动 link 会报 `Cannot find package`（需自行补链接）。
> bundle 形态自带组合 patch，安装即自动挂载。

## 详细说明

README 只做简要介绍；需要细节请看：

- `docs/v1.2.0-settings-panel.md` — v1.2.0 设置面板 + 聊天区滑块的设计与验收说明
- `docs/PORT.md` — OpenCode 版 → DSH 版移植契约说明
- 各版本快照 `vX.Y.Z/INSTALL.md` — 对应版本的安装指南与差异说明
- 工具参数与用法：运行时调 `memory_manual`（内置说明书）

## 与 OpenCode 版的差异

| 项 | OpenCode 版 | DSH 版 |
|------|------|------|
| 自动注入 | context/prompt 钩子自动注入 | 无钩子；Agent 主动调工具 + preset 人设约定 |
| 召回 UI | TUI 滑块（/memory 召回 Tab） | 聊天区滑块 + Plugins 页设置卡片 + 工具 |
| 数据位置 | `~/.config/opencode/` | `~/.starmemory/`（不进插件目录） |
| SQLite | sql.js（纯 JS） | node:sqlite（Node 内置） |
| 安装 | 目录自动发现 | bundle 一行安装（git 源 + tag，自动挂载） |

## 兼容性

| DSH 基线 | 状态 |
|------|------|
| 0.2.x（安装版实测为准） | 目标基线；契约冲突时以安装版 dsh 运行时为准 |

## License

MIT
