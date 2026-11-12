# v1.2.2 测试机验收步骤（照做即可）

> 注意：这是 v1.2.2 的历史验收文档，槽位/目录后续已演进（召回 UI 现为 composer 右下角 `conversation.input.right`、目录已重设计），仅作历史参考；当前状态看 README 与 `StarMemory-DSH项目经验总结-v1.2.19.md`。

> 目标：验证 StarMemory DSH v1.2.2（tag `v1.2.2`）的设置面板 + 聊天区召回滑块 + 配置同步 + 维护日志。
> 详细设计见 `docs/v1.2.0-settings-panel.md`。全程 F12 Console 保持打开（client 报错只 console.warn，白屏红线）。
> 数据根 `~/.starmemory/`；配置 `~/.starmemory/plugin.log`。

## 0. 前置

```sh
# 正规安装（自动注入 SDK），bundle 自动挂载
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.2
# 启动 web（若未在跑），确认 127.0.0.1:3080 可访问
```

## A. Node 侧（无浏览器）

| # | 命令 | 期望 |
|---|------|------|
| A1 | `dsh --profile web --dump-config-schema \| grep -A3 '"id": "starmemory-dsh"'` | `status: "schema"`（非 absent） |
| A2 | 调 `memory_ping` | `{status:"ok", version:"1.2.2"}` |
| A3 | `type %USERPROFILE%\.starmemory\plugin.log` | 有 `apply start` / `archive opened` / `tools registered` / `recall config sync` 记录 |

## B. 浏览器侧（127.0.0.1:3080）

| # | 步骤 | 期望 |
|---|------|------|
| B1 | 打开 Plugins 页，找 StarMemory 卡片 | 出现；summary 一行（「召回已关闭」/「召回已开启 · N 档」） |
| B2 | 点进详情页 | 渲染 Switch「自动召回」+ 档位按钮行（OFF/极轻/轻/中/较强/强/最强）+ 占位子面板「统计 / 诊断等只读展示：即将支持」 |
| B3 | 面板打开「自动召回」→ 点「中 3 档」 | 即写生效；`profiles/web/cordis.patch.yml` 条目 config 落 `recallEnabled: true`、`recallEffort: 3`、`recallPanelConfigured: true`；`~/.starmemory/recall-runtime.json` 跟着变；`memory_recall_status` 读数一致 |
| B4 | 看聊天区右上角 | 滑块浮层出现：深空星野（星点 + 划痕动画）+ 彩虹滑头/填充/文字；fixed 定位，不随滚动 |
| B5 | 拖滑块到 1-6 档 | 档位标签即时变（彩虹文字）；recall-runtime.json 跟着变；Plugins 页卡片档位同步（无刷新） |
| B6 | 拖滑块到 0 档 | 一次提交关闭；滑块短暂过渡后消失；recall-runtime.json 关闭；召回停止（Agent 调 search 不再召回） |
| B7 | 面板关「自动召回」 | 滑块消失、召回停止；再开 → 滑块回来（全程无页面刷新、无重挂载） |
| B8 | 明暗主题切换 | 卡片 token 正常（主/次/三级文字、边框、强调色）；滑块星野+彩虹在两种主题都醒目 |
| B9 | Console 观察 | 全程无未捕获异常、无 React #185（无限重渲报错） |
| B10 | 老用户路径：先用 `memory_recall_set` 改档位、**不碰面板/滑块**，重启 dsh | recall-runtime.json 档位保留（`recallPanelConfigured` 未置 true） |

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
| `shell.overlay` 坐标 | 滑块遮挡右上角其他控件 | 调 `client/index.js` 里 `.sm-recall-slider` 的 `top/right` |
| `@deepseek-ai/schemastery` 解析失败 | 插件加载失败 / schema absent | 确认正规安装（自动注入）；手动装需补链接 |
| `dsh.client.external` 形状 | client 不加载 / 白屏 | 对照 nekowhale `package.json` 的 `dsh.client` 字段调整 |

## E. 结论记录

- 通过项 / 未通过项（编号 + 现象 + 是否已修）
- 未通过项按 D 表排查；改代码后重跑本清单对应项
