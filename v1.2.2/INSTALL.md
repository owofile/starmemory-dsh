# StarMemory DSH Plugin v1.2.2 安装指南

## 版本说明

v1.2.2 在 v1.2.1 基础上把聊天滑块从纯蓝 accent 改为**彩虹渐变**（多主题自适应，明暗主题都醒目）：滑头、档位填充条、流星划痕、档位文字全走彩虹渐变，星空深空底保留；并加 `prefers-reduced-motion` 降级（关闭划痕动画）。

### 与 v1.2.1 的差异
- 滑块：`--sm-rainbow` 渐变（红→橙→绿→青→蓝→粉），滑头像素方块 + 向右彩虹像素拖尾；填充条三层结构（暗底像素分格 + 彩虹填充层 + 原生滑头），填充层按档位宽度裁剪
- 档位文字：彩虹渐变文字（`background-clip: text`）
- 降级：`prefers-reduced-motion: reduce` 时关闭流星划痕动画
- 结构、数据通道、权威规则、26 工具、设置卡片（DSH token）全部不变

## 安装步骤

### 1. 安装插件（git 源，一行，bundle 自动挂载）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.2
```

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`。
