# StarMemory DSH Plugin v1.2.1 安装指南

## 版本说明

v1.2.1 在 v1.2.0 基础上做**界面美化**（视觉层，逻辑/契约不变）：聊天区召回滑块改为**迷你星空 + 像素流星**风格，设置卡片改为 DSH 主题 alias token 规范（自动适配明暗主题）。

### 与 v1.2.0 的差异
- 聊天滑块：深空渐变底 + 纯 CSS 星点 + 循环流星划痕动画；滑块滑头为像素方块（硬边 + 向右像素拖尾），档位填充条像素分格
- 设置卡片：配色改走 `--dsw-alias-*` token（主/次/三级文字、发丝线、强调色、错误色），档位按钮圆角与悬停对齐 DSH 规范
- 结构、数据通道、权威规则、26 工具全部不变

## 安装步骤

### 1. 安装插件（git 源，一行，bundle 自动挂载）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.1
```

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`。
