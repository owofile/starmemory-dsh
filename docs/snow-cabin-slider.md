# 雪夜山小屋滑块背景集成设计（v1.2.23 预研）

## 来源与协议
- 作品：雪の夜の山小屋（Snow Night Mountain Cabin），作者 @Lattice_Node，ludion.ai/p/toggle-snow-cabin
- 协议：MIT（可自由使用/修改，需保留作者署名在代码首行）
- 原作为独立 toggle 开关：轨道内是像素画雪屋世界，开=灯亮、吹雪渐停、云散月出、住人出门看月；关=暴雪暗夜
- 技术：WebGL2 着色器 + Canvas 2D 像素世界（24 色 RAMPS 调色） + OffscreenCanvas + 物理/光照模拟 + rAF

## 三件套（已从页面提取）
| 部件 | 内容 | 规模 |
|---|---|---|
| HTML | div[data-ld-part] 内 canvas.scene + button.hit + span.vh + span.probe | 333 字符 |
| CSS | --ld-* 变量（6 色板：bg/surface/fg/muted/accent/wood）+ 布局 + .scene/.hit/.vh/.probe | 2832 字符 |
| JS | mount(root) 函数声明，末尾自执行 mount(document.querySelector(...))，无 export | 89,805 字符 / 2623 行 |

## 布局（几何约束决定）
- 雪屋药丸比例约 1.64:1（宽:高），滑块轨道是 248x26（约 9.5:1）——**无法塞进 26px 轨道而不严重变形**
- 决定：**雪屋场景作为叙事预览放在滑块上方**，弹窗加高；滑块在下方照旧复刻 Codex（26px 轨道 + 30px 圆形档位头）
- 弹窗 272px 宽 → 雪屋容器 272x166（aspect-ratio 1.6439），滑块区 26px + 间距 → 弹窗总高约 210px（聊天区向上弹出，可容纳）

## 0-6 档 → 叙事映射（核心改造）
原作叙事时间轴：T_DARK=0（暴雪暗夜）→ T_LIT=1（灯亮，吹雪渐停）→ T_CLEAR=2（雪停、月出、住人出门看月）
- mount 内部：`x`(0-1) + `branch`(pm/am) + `nightClock`（右端停留 creep 到 T_CLEAR）
- `clockOf()`：branch=am → mix(T_DARK, amStart, x)；x>=1 → nightClock；否则 T_DARK+(T_LIT-T_DARK)*x
- 右端 creep 条件（tick L2375）：`x>=1 && !moving && !drag && nightClock<T_CLEAR`

映射（改造 mount 暴露 setProgress(v 0-6)）：
| 档位 | x | clock | 叙事 |
|---|---|---|---|
| 0 | 0 | T_DARK | 暴雪暗夜、灯灭 |
| 1-5 | v/6 | T_DARK+(T_LIT-T_DARK)*x | 灯渐亮、吹雪渐停 |
| 6 | 1 | nightClock（creep T_LIT→T_CLEAR） | 雪停、云散、月出（约 26 秒渐升，保留原味） |

setProgress 必须保持 branch='pm'（否则 clockOf 走 am 分支，月出失效）；非右端时复位 nightClock=T_LIT。

## 配色（"附带我们的" = 星空色板覆盖 --ld-*）
原色板：--ld-bg #e8effa(雪)、--ld-surface #2f6657(针叶树)、--ld-fg #171e45(夜)、--ld-muted #7088ba(雪阴)、--ld-accent #f4a640(火)、--ld-wood
星空覆盖（夜空更接近我们深空蓝、灯更暖、雪偏冷月白）：
- --ld-bg → #dfe8f8（冷月白）
- --ld-surface → #1f3a4a（深空蓝绿）
- --ld-fg → #10162e（星空深蓝，接近 #0a0d1a）
- --ld-muted → #5a6f9a（蓝灰雪阴）
- --ld-accent → #f6a94a（暖橙金灯火）
- --ld-wood 保留（原木色）

## 源码改造（mount）
1. 改名 `function mount(root)` → `function smSnowCabinMount(root)`（防命名冲突）
2. 删末尾自执行 `mount(document.querySelector(...));` 与 `</script>`
3. 在 return cleanup 前定义 `setProgress(v)`（如上映射），return 改为 `{ destroy: <原cleanup>, setProgress }`
4. 交互：保留原代码，但注入的 button.hit 设 `pointer-events:none;tabindex:-1`（CSS），滑块 range 独占交互；drag 恒 null，creep 条件恒满足
5. 门禁：check-i18n 只允许 DICTS 有中文，雪屋源码的日文/中文**字符串字面量**（phaseName 状态、aria-label、CSS 里的中文注释若有引号包裹）必须英文化；日文注释（无英文引号包裹）保留

## DSH 集成（client/index.js）
- 内联：雪屋源码作为 `function smSnowCabinMount(root){...}` 直接嵌入（单文件客户端，约 +2623 行）
- 弹窗渲染：滑块上方加 `.sm-snow-cabin` 容器（h() 创建 canvas.scene/button.hit/span.vh/span.probe），mount 后存 ref
- 驱动：displayValue 变化 → ref.setProgress(displayValue)；弹窗 close → destroy
- CSS：作品 CSS + 星空 --ld-* 覆盖 + 容器尺寸，注入 ensureStyle
- 生命周期：弹窗 open 时 mount，close 时 destroy（IntersectionObserver 内部自动暂停）

## 验证
- node --check client/index.js（语法）
- npm run gate（63/63，含 check-i18n 的 CJK 门禁）
- 人工看点：弹窗打开 → 雪屋场景渲染；拖 0-6 → 灯渐亮/雪渐停/6 档月出；关闭弹窗 → destroy 无泄漏

## 风险与注意
- WebGL2 在 DSH webview 兼容性（有 Canvas 2D 降级 fallback，原作自带 useCanvas2d）
- 90KB 内联使 client/index.js 增大到约 130KB（一次加载，可接受）
- 雪屋 canvas 全时 rAF（弹窗打开时），性能开销；IntersectionObserver 不可见时自动停
- 弹窗加高（210px）可能遮挡更多聊天区，需实测
