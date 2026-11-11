# StarMemory DSH Plugin v1.2.3 安装指南

## 版本说明

v1.2.3 把设置面板与聊天滑块整体换为**终末地工业风**（参考 `endfield-ui` skill 的设计系统，不搬用任何游戏素材），滑块保留彩虹/发光/循环流星（用户指定例外）。逻辑层零改动，纯视觉层。

### 与 v1.2.2 的差异
- 整体：唯一强调色信号黄 `#FFFA00` 只做填充；切角 = 可点击；细线分区；宽体大写英文（`// RECALL`、`// OBSERVE`）+ 粗体中文；真实数字（`No.03 / 06`、档位编号）；机械动效；`radius` 一律 0；红只给删除（错误用黄块）。
- 聊天滑块：深色命令栏（`#161616` 底 + 发丝边框 + 右下切角，两主题都深）；保留深空星野、循环流星划痕（`prefers-reduced-motion` 时关闭）、彩虹填充层 + 彩虹发光滑头；眉标 `// RECALL` + 真实档位 `No.03 / 06`。
- 设置卡片：endfield token 随 `body[data-ds-dark-theme]` 切深浅；档位按钮 = 筛选块（两位编号 + 中文，选中 = 黄填充）；观察面板 = 斜线纹空态；summary 眉标颜色走 DSH alias token。
- Saira 字体本版不打包（DSH 静态资源服务未验证），用近似栈 + 宽字距 + 字重模拟；结构、数据通道、权威规则、26 工具全部不变。

## 安装步骤

### 1. 安装插件（git 源，一行，bundle 自动挂载）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.3
```

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉）与 `docs/verify-v1.2.3.md`。
