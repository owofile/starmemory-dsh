# StarMemory DSH Plugin v1.2.4 安装指南

## 版本说明

v1.2.4 是 v1.2.3 的**稳健性修正**（无功能/视觉改动）：按 DSH 客户端规范 13-gotchas §4「宿主可能清理/覆盖注入的 `<style>`，关键样式用 JS 内联（内联优先级最高）」——把**非伪元素的关键视觉内联**到 React style（滑块定位/布局/配色/token、卡片布局），只留伪元素（星点/滑头/划痕动画）在注入的 style。即使宿主清理/覆盖 style，UI 降级而非错位/消失。

### 与 v1.2.3 的差异
- 滑块根：`position: fixed; top/right: 16px; z-index: 9999` + 布局/配色/token 内联（`--ef-*`、`--sm-rainbow`、`--sm-fill`、切角 clip-path 内联）；伪元素装饰留 style 注入。
- 卡片根：`display: flex; flex-direction: column; gap: 0; padding: 4px 0; max-width: 560px` 内联；endfield token 变量（`--ef-*`）留 class（主题切换需 `body[data-ds-dark-theme]` 覆写，无法内联）。
- 结构、数据通道、权威规则、26 工具、视觉设计全部不变。

## 安装步骤

### 1. 安装插件（git 源，一行，bundle 自动挂载）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.4
```

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（验收点不变）。
