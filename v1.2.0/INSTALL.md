# StarMemory DSH Plugin v1.2.0 安装指南

## 版本说明

v1.2.0 在 v1.1.1 基础上新增**设置面板**与**聊天区召回滑块**，并加入维护/调试日志。

### 与 v1.1.1 的差异
- **设置面板**：召回开关 + 档位（0-6）进 Plugins 页卡片（`plugins.item` 槽），即写即生效
- **聊天区召回滑块**：常驻聊天界面（`127.0.0.1:3080`）右上角（`shell.overlay` 槽），与面板即时联动；关闭即滑块消失、召回停止
- **维护/调试日志**：`~/.starmemory/plugin.log`（JSON Lines，512KB 单代轮转）
- 26 个工具、数据位置、SQLite 归档、bundle 安装方式不变

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`。

## 安装步骤

### 1. 安装插件（git 源，一行，bundle 自动挂载）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.0
```

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。
