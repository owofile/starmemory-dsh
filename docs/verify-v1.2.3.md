# v1.2.5 测试机验收步骤（照做即可）

> 目标：验证 StarMemory DSH v1.2.5（tag `v1.2.5`）的**终末地工业风**设置面板 + 聊天区召回滑块 + **i18n** + 配置同步 + 维护日志。
> 覆盖 v1.2.3 工业风、v1.2.4 内联稳健性、v1.2.5 i18n（B3 专项）。
> 详细设计见 `docs/v1.2.0-settings-panel.md` §7（视觉）、§9（已知取舍）。全程 F12 Console 保持打开（client 报错只 console.warn，白屏红线）。
> 数据根 `~/.starmemory/`；配置 `~/.starmemory/plugin.log`。

## 0. 前置

```sh
# 正规安装（自动注入 SDK），bundle 自动挂载
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.5
# 启动 web（若未在跑），确认 127.0.0.1:3080 可访问
```

## A. Node 侧（无浏览器）

| # | 命令 | 期望 |
|---|------|------|
| A1 | `dsh --profile web --dump-config-schema \| grep -A3 '"id": "starmemory-dsh"'` | `status: "schema"`（非 absent） |
| A2 | 调 `memory_ping` | `{status:"ok", version:"1.2.5"}` |
| A3 | `type %USERPROFILE%\.starmemory\plugin.log` | 有 `apply start` / `archive opened` / `tools registered` / `recall config sync` 记录 |

## B. 浏览器侧（127.0.0.1:3080）

### B1 渲染与三方联动（先功能后视觉）
| # | 步骤 | 期望 |
|---|------|------|
| B1 | 打开 Plugins 页，找 StarMemory 卡片 | 出现；summary 为眉标两行（`// RECALL` 上、`召回已开启 · N 档`/`召回已关闭` 下） |
| B2 | 点进详情页 | 渲染 `// RECALL` 召回控制 section（Switch 自动召回 + 档位按钮行 `00 OFF`~`06 最强` + 说明）+ `// OBSERVE` 观察面板 section（斜线纹占位） |
| B3 | 面板打开「自动召回」→ 点「中 3 档」 | 即写生效；`profiles/web/cordis.patch.yml` 条目 config 落 `recallEnabled: true`、`recallEffort: 3`、`recallPanelConfigured: true`；`~/.starmemory/recall-runtime.json` 跟着变；`memory_recall_status` 读数一致 |
| B4 | 看聊天区右上角 | 滑块浮层出现：深色命令栏（`#161616` 底、发丝边框、右下切角）+ 深空星野 + 循环流星划痕 + 彩虹填充/发光滑头 + `// RECALL` 眉标 + `No.03 / 06` 真实档位；fixed 定位，不随滚动 |
| B5 | 拖滑块到 1-6 档 | 档位数字即时变（`No.01`~`No.06`）；recall-runtime.json 跟着变；Plugins 页卡片档位同步（无刷新） |
| B6 | 拖滑块到 0 档 | 一次提交关闭；滑块短暂过渡后消失；recall-runtime.json 关闭；召回停止（Agent 调 search 不再召回） |
| B7 | 面板关「自动召回」 | 滑块消失、召回停止；再开 → 滑块回来（全程无页面刷新、无重挂载） |
| B8 | 明暗主题切换 | 卡片 token 正常（纸/墨/墨2/线切深浅，黄填充选中块两主题醒目）；滑块深色命令栏两主题都成立；星野+彩虹在两种主题都醒目 |
| B9 | Console 观察 | 全程无未捕获异常、无 React #185（无限重渲报错） |
| B10 | 老用户路径：先用 `memory_recall_set` 改档位、**不碰面板/滑块**，重启 dsh | recall-runtime.json 档位保留（`recallPanelConfigured` 未置 true） |

### B2 工业风视觉专项（v1.2.3 新增）
| # | 步骤 | 期望 |
|---|------|------|
| B11 | 看档位按钮选中态 | 选中 = 信号黄 `#FFFA00` 填充 + 深字；未选 = chip 底 + 墨2 字；全部 `border-radius: 0` + 右下切角；按钮带两位编号（`03 中`） |
| B12 | 看滑块容器 | `border-radius: 0`；右下切角（clip-path）；发丝边框 `#353535`；无投影/光晕包裹（滑头发光为指定例外） |
| B13 | 看滑块眉标与数字 | `// RECALL` 小号大写宽字距英文在上、`召回` 粗体中文在下；`No.03` 粗体 + `/ 06` 小号；数字等宽（tabular） |
| B14 | 触发错误（可选：临时把 scope.set 改抛错） | 卡片显示黄块错误（黄底 `#FFFA00` + 深字），不是红字 |
| B15 | `prefers-reduced-motion` 降级 | 系统开启「减少动态效果」后，流星划痕不播放、填充条无过渡 |

### B3. i18n 专项（v1.2.5 新增）

| # | 步骤 | 期望 |
|---|------|------|
| B16 | 打开插件详情页（中文界面） | 文案中文：召回控制 / 自动召回 / 召回档位（0 = 关闭…）/ 观察面板 / 占位句 / 保存脚注 / summary |
| B17 | DSH 界面语言切英文（改设置或浏览器语言） | 卡片+滑块文案变英文（Recall Control / Auto Recall / Recall off / Observe / Recall）；**无刷新**；档位标签变英文（OFF / Minimal / Light / Medium / Strong / Heavy / Max） |
| B18 | 切回中文 | 文案回中文；语言切换即时生效、无重挂载 |
| B19 | 未显式选语言（浏览器语言回退） | 界面文案仍正常（跟随浏览器语言，不显裸键名如 `card.controlTitle`） |
| B20 | Console 观察（切语言全程） | 无未捕获异常、无 React #185；`[starmemory] locale register failed` 不出现（字典注册成功） |
| B21 | 负控（可选）：临时把 `makeTranslator` 的 `bind` 置空，重启 | 界面文案回退**中文**（不显键名）；改回 |

## C. 负控（白屏红线）

| # | 步骤 | 期望 |
|---|------|------|
| C1 | 手动把 `client/index.js` 里一个 slot 的槽名写错（如 `shell.overlay` → `shell.overlayX`），重启 | 仅 `console.warn('[starmemory] slider disabled: ...')`，页面**不白屏**；改回 |
| C2 | 面板改档位后手查 Console | 无报错；`plugin.log` 有 `recall config sync { reason: "volatile-update", synced: true }` |

## D. 风险接缝关注点（若某步异常按此排查）

| 接缝 | 异常表现 | 处理 |
|------|----------|------|
| scope 无 `set`/`mutate`/`subscribe` | 面板/滑块改不动，或只轮询不推 | 实现已做探测+回退（mutate→set 逐字段；subscribe→500ms 轮询）；改不动看 Console warn |
| primitives 的 `Switch` 不存在 | 卡片 page 崩 / 槽静默失效 + React #130 | 换自绘开关（同包 `RiskConfirmation` 自绘先例） |
| `loader/volatile-update` 事件名不符 | 面板改了滑块不跟、运行时不同步 | Node 侧降级为只 apply 一次；按安装版事件名改 index.mjs |
| `shell.overlay` 坐标 | 滑块遮挡右上角其他控件 | 调 `client/index.js` 里 `.sm-ef-slider` 的 `top/right` |
| `@deepseek-ai/schemastery` 解析失败 | 插件加载失败 / schema absent | 确认正规安装（自动注入）；手动装需补链接 |
| `dsh.client.external` 形状 | client 不加载 / 白屏 | 对照 nekowhale `package.json` 的 `dsh.client` 字段调整 |
| 明暗主题选择器 `body[data-ds-dark-theme]` 不符 | 卡片深浅不切（永远浅或永远深） | 查 DSH 实际主题属性名，改 CSS 选择器（见 06-ui-style token 真源） |
| 卡片/summary 眉标类名 | 眉标不换行/无大写/颜色不对 | 确认 `.sm-ef-card .sm-eyebrow`（page）与 `.sm-ef-eyebrow`（summary，DSH token）两条规则都在 |
| `inject` 加 `'locale'` 后 client 条目 pending | client 不加载（滑块/卡片都无），web 启动面板条目 pending | 安装版 locale 服务名不同（13-gotchas §7 注入不存在服务→pending）；回退：去掉 `'locale'` 走纯中文，或按安装版服务名改 |

## E. 结论记录

- 通过项 / 未通过项（编号 + 现象 + 是否已修）
- 未通过项按 D 表排查；改代码后重跑本清单对应项
