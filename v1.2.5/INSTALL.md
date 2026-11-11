# StarMemory DSH Plugin v1.2.5 安装指南

## 版本说明

v1.2.5 为设置卡片与聊天滑块加**国际化（i18n）**：文案搬进客户端字典（`ctx.locale.register`，08-i18n 契约），DSH 界面切英文时跟随切换；locale 服务缺席/缺键时回退内联中文（界面不会变键名）。新增 `check:i18n` 门禁（字典之外不允许硬编码中文文案字面量）。

### 与 v1.2.4 的差异
- `inject` 加 `'locale'`（07 §3 官方 client 注入面）；`apply` 里 `ctx.locale.register(NS, DICTS)` 注册 `zh`/`en` 两套字典。
- 键点分小写 ≥2 段、zh/en 键集一致、`{占位符}` 两侧一致（`card.summaryOn` 的 `{level}`）。
- 组件文案全走 `t()`（`makeTranslator`：locale 服务可用时 `bind(NS)` 现取、语言切换即时生效；缺键/抛错回退中文）。
- slot 注册项的 `label` 改 thunk（`() => t('slider.title')`）。
- 门禁 `check:i18n`（`scripts/check-i18n.mjs`）：剔除 DICTS 块后扫描剩余字符串字面量，含 CJK 即报错。
- 结构、数据通道、权威规则、26 工具、视觉设计全部不变。

## 安装步骤

### 1. 安装插件（git 源，一行，bundle 自动挂载）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.5
```

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（验收点不变；另测中英切换）。
