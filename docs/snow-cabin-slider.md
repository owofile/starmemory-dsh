# 雪夜山小屋滑块集成设计（v1.2.24 预研，重构版）

## 来源与协议
- 作品：雪の夜の山小屋（Snow Night Mountain Cabin），作者 @Lattice_Node，ludion.ai/p/toggle-snow-cabin
- 协议：MIT（可自由使用/修改，需保留作者署名在代码首行）
- 技术：WebGL2 着色器 + Canvas 2D 像素世界（24 色 RAMPS 调色）+ OffscreenCanvas + 物理/光照模拟 + rAF

## v1.2.23 的问题（用户反馈，本版重构）
- v1.2.23 把雪屋当"叙事预览"放滑块上方、下面另留普通 26px 轨道滑块 → 用户否定："雪屋不是滑块本身吗？怎么下面还有滑块？"
- 本版（未发布重构）：**雪屋本身就是滑块本体**，删掉普通轨道滑块；档位文字显示在雪屋**上方**；雪屋**长度可调**（设置面板加宽度项）。

## 关键技术结论：雪屋可当滑块 + 长度可调（用户问"能不能重复实现"）
- 雪屋是**纯程序化绘制**（JS 按坐标画 PEAKS/forestTrees/PINES/paintGround，非位图）→ 理论上可 tile 重复。
- 实测：世界内容覆盖 x∈[-70,272]（342 世界像素），弹窗内雪屋药丸世界宽仅约 150-200 像素 → **余量足够，当前尺寸无需 tile 就能随意拉宽**（仅 >600px 超宽才需 tile，留作将来备选）。
- 原作药丸强制 1:1.85（`pillW=pillH*1.85`，`pillH=H/1.32`）不支持宽度独立 → 本版**打破固定比例**：`shape.pillW=W`、`shape.pillH=H`（容器尺寸即药丸尺寸），`pickK` 仍由高度定（k 是整数像素格，宽度不参与），世界自动居中适配，不露白。

## 交互改造（雪屋 mount → 0-6 连续滑块）
原作是**二态 toggle**（`commit` 设 x=0/1，release 吸两端）。本版改造：
- `smSnowCabinMount(root, opts)` 签名加 `opts={onInput, onCommit}`。
- **release 吸附最近档**：`target = round(clamp(x + speed*0.09) * 6) / 6`（替代 `>=.5?1:0`）。
- **tick settle 回调**：吸到位后 `onCommit(round(target*6))`，并重置叙事状态（`branch='pm'`；`nightClock=T_LIT` 除非 6 档保留月出）。不再调原作二态 `commit`。
- **drag onInput**：拖动中 x 更新，档位变化时 `onInput(round(x*6))`（`lastInputLv` 防抖）。
- **键盘 STEP**：`0.04` → `1/6`（每键一档），settle 仍走 onCommit。
- **删 click toggle**：纯点击不翻转（0-6 滑块语义），拖动/键盘才是交互。
- `setProgress(v)`（外部驱动，open/设置面板同步）保留，但只跟随 store 值 `shown`，**不反向打断拖动**。

## 0-6 档 → 叙事映射
| 档位 | x | 叙事 |
|---|---|---|
| 0 | 0 | 暴雪暗夜、灯灭（clock=T_DARK） |
| 1-5 | v/6 | 灯渐亮、吹雪渐停（clock=T_DARK+(T_LIT-T_DARK)*v/6） |
| 6 | 1 | 右端停留 → 雪停、云散、月出（nightClock creep T_LIT→T_CLEAR，约 26 秒渐升） |

叙事状态重置规则（settle 时）：非 6 档 `branch='pm'` + `nightClock=T_LIT`；6 档 `branch='pm'` + `nightClock>=T_LIT`（creep 继续）。拖回时从月夜逆向回放（原作行为），松手后归位到灯亮档。

## 布局（雪屋 = 滑块本体）
- 弹窗：`width:fit-content;min-width:272px`（容纳雪屋最大 320px），星空背景层保留。
- 档位文字 `.sm-recall-effort`：雪屋**上方**，15px 粗体居中，颜色随档位 `sm-lv-0~6`（冷月→日蚀→太阳暖色）。
- 雪屋 `.sm-snow-cabin`：`width:var(--sm-cabin-w,250px)`，`height:calc(var(--sm-cabin-w,250px)/1.85)`，居中。
- 雪屋 `.hit`：覆盖整个药丸（`top:0;left:0;width:100%;height:100%`），`pointer-events:auto;cursor:grab`，`role="slider"` + `aria-valuenow`（原作 .hit 定位针对 1.32 倍容器，本版容器=药丸需覆盖）。
- 删除：旧普通滑块（track/fill/dot/thumb/burst/range + 粒子/爆开 canvas rAF 动画 + 相关 CSS）。

## 长度可调（设置面板）
- 设置面板新增"雪屋滑块长度"宽度选择：220/250/280/320 px（config key `recallSliderWidth`）。
- bridge `derive` 加 `width: Number(v.recallSliderWidth) || 250`；聊天区弹窗 `state.width` 驱动 `--sm-cabin-w`。
- 雪屋 mount 的 `ResizeObserver`（原作自带）自动 re-measure 适配新宽度。

## 生命周期与竞态
- 雪屋挂载：`useEffect([open, state.enabled])`，仅 `open && state.enabled` 时挂载；0 档（recallEnabled=false）组件 return null 但 open 不变 → **必须依赖 state.enabled** 才能在弹窗消失时销毁 WebGL 实例。
- `setProgress` 只依赖 `shown`（store 值）：拖动中雪屋自身驱动 x，不反向 setProgress 打断拖拽；外部（设置面板/初始化）改档才 setProgress。
- `onCommit` 同步 `localRef=最终档`：否则 onInput 末档 ≠ onCommit 档时，`useEffect([shown])` 清 localRef 条件不成立 → 显示值卡在拖动档（竞态修复）。

## 验证
- `node --check client/index.js`（语法）+ `npm run gate`（63/63，含 check-i18n 的 CJK 门禁——雪屋字面量已英文化、日文注释已删）。
- 人工看点：弹窗打开 → 档位文字在上、雪屋药丸在下；拖动雪屋 → 灯渐亮/雪渐停 + 文字实时跟随；松手 → 吸附最近档 + 提交；拖到 6 → 月出渐升；设置面板改宽度 → 雪屋长度变；拖到 0 → 关闭召回（弹窗消失，实例销毁）。

## 风险与注意
- WebGL2 在 DSH webview 兼容性（原作自带 Canvas 2D 降级 useCanvas2d）。
- 雪屋全时 rAF（弹窗打开时）；IntersectionObserver 不可见时自动停。
- 0 档拖到最左即关闭召回（弹窗消失），语义与 0=OFF 一致（可后续按需调）。
- 雪屋药丸比例固定 1.85（宽度可调、高度=宽度/1.85）；若用户要任意高宽比需另改世界渲染（横向 tile）。
