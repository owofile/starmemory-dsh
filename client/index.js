// StarMemory DSH client half —— 手写 CJS 单文件，无需构建步骤。
//
// 落地偏差说明（相对整体设计文档 §7）：
// - 不用 esbuild 多文件打包：单文件 + 手写 CJS 直接入库，消除 seed/banner/外部
//   require 重写等接缝，最大化稳定性与可调试性（client 插件报错即白屏，接缝越少越好）。
// - 档位控件用自绘按钮行（h('button')），不用 SegmentedControl；Switch 用 primitives 实测组件。
// - 美化（v1.2.3）：整体走「终末地工业风」（endfield-ui skill），固定规则——唯一强调色
//   只做填充、切角=可点击、细线分区、宽体大写英文 + 粗体中文、真实数字、机械动效、radius 0；
//   滑块保留彩虹/发光/循环流星（用户指定例外），按工业风外壳融合。
//   Saira 字体需自托管（DSH 静态资源服务未验证），本版不打包字体，用宽字距+大写+字重模拟。
//
// 结构：__ModuleLoader__.load 包裹 → factory(require) → inject ['slots']（client 侧实测：多服务整批失败，
//  只 inject 确定能用的 slots；configForms 经 ctx.inject 回调拿，locale 单独回调最佳努力）
//   → 注册两个 slot（各自独立 try/catch，白屏红线）：
//     - conversation.input.right  聊天输入框右下角召回触发器（「召回」文字 + 点击向上弹出滑块小模块；
//       照 ui-model-selection ModelSelect 姿势：trigger + createPortal(MenuSurface) + CSS anchor 向上定位；
//       unavailable → 控件禁用；弹出带 Menu 原语淡入/淡出动效）
//     - settings.section  主设置页独立分区（召回 Switch + 0-6 档位按钮；id=包名；bili-scroll「刷B站」姿势）
//   数据源：configForms.get('starmemory-dsh') scope —— 单一事实源（Config volatile 叶）。
//   v1.2.7：两个 slot 均无条件注册（不 gate 在 configForms 可用性/whileServed）——
//   首次无配置时 snapshot.status === 'unavailable'，由组件内降级（面板控件 disabled、滑块 return null）；
//   面板是首次配置入口，被 gate 会整个面板不出现（测试机确诊）。
//   v1.2.10：client 侧服务访问改回调式（bug #6：inject 多服务整批失败，ctx 只挂 fiber）。
//   v1.2.11（bug #8 根因）：插件配置槽的声明者/消费者是 @deepseek-ai/dsh-client-ui-plugin-manager，
//   不在种子表 → 必须经 package.json 的 dsh.client.inject 注入，否则槽无消费者、注册了也不渲染。
//   v1.2.12（照抄 nekowhale 整套姿势，bug #8 收尾）：详情页卡片在 0.2.2-rc.1 能显示（plugins.bundle.config），
//   但那是设计错位——主人要的是主设置页独立分区，不是插件详情页小卡片。
//   v1.2.13（本版）：移除插件详情页卡片（plugins.bundle.config + createCard），改注册 settings.section
//   主设置页面板（createSection，Switch + 0-6 档位），数据仍走 configForms scope，与聊天区滑块同源。
//   v1.2.14（本版）：首次配置死锁修复——host 未 served namespace 时 status==='unavailable'、控件 disabled、
//   无法写入（死锁）。createSection 加 useEffect：unavailable 时用 scope.mutate（op:'set' 框架形状）写默认值
//   {recallEnabled:false, recallEffort:0}（commit 会补 recallPanelConfigured:true），host served → status ready
//   → 解锁。同时修 makeCommit 的 ops 形状 type:'set' → op:'set'（与 nekowhale 一致，否则写入失败）。
//   v1.2.15（本版）：聊天区滑块（shell.overlay fixed 右上角）改为聊天输入框右下角召回触发器（composer 子槽
//   conversation.input.right），照 ModelSelect 姿势（trigger「召回」+ createPortal(MenuSurface) + CSS anchor
//   向上弹出），Menu 原语淡入/淡出动效；数据仍走 configForms scope，与 settings.section 面板同源。
//   v1.2.16（本版）：滑块弹出模块统一「星空流星雨」主题——覆盖 MenuSurface 材质变量为深空渐变背景，
//   内容层加静态星点（多层 radial-gradient + 微闪）与两条错峰流星（斜向尾迹 + shoot keyframes），
//   保留彩虹轨道/发光滑头（用户指定例外）作星云点缀；DSH 原生 Switch（灰白块）换自定义星空 toggle
//   （细轨 + 彩虹圆点），整卡不再风格混杂。reduced-motion 时关星点/流星动效。
//   v1.2.17（本版）：弹窗定位弃 CSS anchor positioning（Chrome 125+ 新特性、行为不稳：视口/composer
//   高度变化时跑偏、弹窗「突然出现在上面」），改用 DSH 自带 useAnchoredPosition hook（ModelSelect 同款，
//   自动算位 + 视口不够自动翻转）：trigger ref=triggerRef、pop ref=menuRef + style=menuPos（未测量时
//   MEASURE_STYLE 隐藏首帧防跳动），side:'top' align:'end' gap:8 margin:12 layoutKey。删 CSS anchor-name /
//   position-anchor 那套。
//   v1.2.18（本版）：图层修复（StarMemory-弹窗布局与动效结构.md §三）——星点/流星 z-index:-1 → 0
//   （原被 MenuSurface 不透明深空背景 .material 盖住，动效在跑但看不见）；内容元素（head/num/track/err）
//   加 position:relative; z-index:1（确保在星点/流星之上）。动画本就在，图层顺序对即可见。
//   v1.2.22（本版）：滑块回弹竞态修复（race condition）——onSlide 停 250ms commit 时立即清 localRef，
//   displayValue 回落到未更新的旧 store 值 → 弹回旧值。修法：commit 时**不清 localRef**，改
//   useEffect([shown]) 等 store 值真正追上本地值才清（与设置面板同模式）；另修复拖动时流星/星星/
//   扫光被 is-sliding 暂停的问题（用户要求背景动效滑动时继续），只保留填充宽度无过渡跟手。
//   v1.2.21（本版）：召回滑块 1:1 复刻 Codex reasoning slider（bakabaicai/DSH-Codex-
//   reasoning-effort-slider）——几何/尺寸全照抄（轨道高 26px 圆角 16px、填充左圆角右直角宽
//   calc((100%-30px)*pos+15px)、手柄 30px 圆、刻度点 4px、弹窗 272px），配色改星空（深空轨道 +
//   青蓝→紫尾迹 + 星空光晕手柄）；加 Codex canvas 粒子（20 种子点 rAF 漂移 + 最高档流动）与进
//   最高档（6）紫色爆开，最高档尾迹发光（blur 渐变）+ 扫光。交互仍走透明 range（本地回显 /
//   is-sliding 暂停粒子 / prefers-reduced-motion 保留）。
//   v1.2.20（本版）：点击延迟优化（流畅优先）——① 设置面板（settings.section）开关/档位
//   按钮点击走 configForms commit 往返才更新 UI（无本地回显 → 点击后高亮延迟）。修法：本地回显
//   （localRef 存乐观值 {enabled,effort}，点击立即 setLocal 切换 UI，commit 后台写；state 追上后清
//   localRef 回落 state 无闪回，commit 失败保持乐观值）；② 滑块改版：召回滑块改照 DSH-Codex-
//   reasoning-effort-slider 结构 + 星空流星风（深空细轨 + 青蓝→紫流星尾迹填充 + 档位小星星 + 白色
//   发光流星头 sm-recall-thumb，最高档加扫光拖尾；交互仍走透明 range 零改动）。
//   v1.2.19（本版）：滑块卡顿修复（拖动掉帧）——① 滑块受控 + 每 250ms 停顿走完整 commit 往返 +
//   重渲染时星空动画/大 box-shadow 重新合成。修法：拖动用本地 state 即时回显（value=displayValue，
//   localRef 存拖动值，stop 250ms 才 commit，commit 后回落 store）；② 拖动加 .is-sliding class 暂停
//   星点/流星动画（animation-play-state:paused，省合成）；③ 拖动减淡填充 box-shadow。close 清 localRef
//   防残留档位。
//   i18n（v1.2.5）：文案走客户端字典 DICTS（08-i18n §1），locale 服务缺席/缺键回退中文。

window.__ModuleLoader__.load({ id: 'starmemory-dsh', factory: function (require) {
  'use strict'

  var React = require('react')
  var ReactDOM = require('react-dom')
  var h = React.createElement
  var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
  var Switch = primitives.Switch
  var MenuSurface = primitives.MenuSurface
  // useAnchoredPosition：ModelSelect 同款定位 hook（自动算位 + 视口不够自动翻转）。
  // 0.2.2-rc.1 bundle 用这个，弃用 CSS anchor positioning（Chrome 125+ 新特性、行为不稳）。
  var useAnchoredPosition = primitives.useAnchoredPosition

  var NS = 'starmemory-dsh'
  var PKG = 'starmemory-dsh'

  // ================= i18n（v1.2.5）：客户端字典（08-i18n §1 手写单文件变体） =================
  // 键点分小写、≥2 段；zh/en 键集一致；同一键两侧 {占位符} 集一致。
  // locale 服务缺席/缺键时回退内联中文（界面不会变键名，08 §7 autofork 模式）。
  var DICTS = {
    zh: {
      'slider.title': '召回',
      'card.controlTitle': '召回控制',
      'card.autoRecall': '自动召回',
      'card.effortNote': '召回档位（0 = 关闭，档位越高注入越强）',
      'card.observeTitle': '观察面板',
      'card.observePlaceholder': '统计、归档状态与诊断摘要将在这里以只读形式展示。',
      'card.saveNote': '保存即生效；面板配置后档位以此为准',
      'card.summaryOn': '召回已开启 · {level} 档',
      'card.summaryOff': '召回已关闭',
      'error.writeFailed': '写入失败',
      'effort.0': 'OFF', 'effort.1': '极轻', 'effort.2': '轻', 'effort.3': '中',
      'effort.4': '较强', 'effort.5': '强', 'effort.6': '最强',
    },
    en: {
      'slider.title': 'Recall',
      'card.controlTitle': 'Recall Control',
      'card.autoRecall': 'Auto Recall',
      'card.effortNote': 'Recall level (0 = off, higher = stronger)',
      'card.observeTitle': 'Observe',
      'card.observePlaceholder': 'Stats, archive status and diagnosis summary will show here read-only.',
      'card.saveNote': 'Takes effect immediately; panel config is authoritative once set',
      'card.summaryOn': 'Recall on · {level}',
      'card.summaryOff': 'Recall off',
      'error.writeFailed': 'Write failed',
      'effort.0': 'OFF', 'effort.1': 'Minimal', 'effort.2': 'Light', 'effort.3': 'Medium',
      'effort.4': 'Strong', 'effort.5': 'Heavy', 'effort.6': 'Max',
    },
  }

  // makeTranslator：locale 服务可用时 bind(NS) 现取（语言切换即时生效，无需重挂载）；
  // 否则回退中文。tr(key, params)：缺 key / 抛错 → 内联中文兜底；params 替换 {占位符}。
  // v1.2.10：locale 服务经 ctx.inject 回调异步注入 → 用 tr.setLocale() 升级 bind（闭包共享，
  // 组件持同一 tr 引用，语言切换仍即时生效）；setLocale 前默认中文。
  function makeTranslator() {
    var bind = null
    function setLocale(localeService) {
      bind = null
      if (localeService && typeof localeService.bind === 'function') {
        try { bind = localeService.bind(NS) } catch (e) { bind = null }
      }
    }
    function tr(key, params) {
      var raw
      if (bind && typeof bind === 'function') {
        try { raw = bind(key) } catch (e) { raw = undefined }
      }
      if (raw == null || raw === key) raw = DICTS.zh[key] != null ? DICTS.zh[key] : key
      if (params) {
        Object.keys(params).forEach(function (k) {
          raw = String(raw).split('{' + k + '}').join(String(params[k]))
        })
      }
      return raw
    }
    tr.setLocale = setLocale
    return tr
  }

  // ================= 美化样式：终末地工业风（一次注入，id 幂等） =================
  // 固定规则：唯一强调色只做填充 / 切角=可点击 / 细线分区 / 宽体大写英+粗体中 /
  // 真实数字(tabular) / 机械动效 / radius 0 / 红只给删除（错误用黄块）。
  // 滑块：深色命令栏（两主题都深），保留彩虹/发光/循环流星（用户指定例外）。
  var RAINBOW = 'linear-gradient(90deg,#ff5f6d,#ffc371,#47e891,#36c5f0,#7c6cff,#ff5f9e)'
  var EF_CSS = [
    // 字体：宽体几何拉丁（Saira 未打包，用近似栈 + 宽字距模拟）；中文黑体
    '.sm-ef{font-family:"Saira","Exo 2","Chakra Petch","Rajdhani","Arial Narrow","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;font-variant-numeric:tabular-nums;}',
    // ---- 卡片 token（嵌在 DSH 设置面，随 data-ds-dark-theme 切深浅）----
    '.sm-ef-card{--ef-paper:#F4F4F2;--ef-panel:#FFFFFF;--ef-ink:#161616;--ef-ink2:#5C5C5C;',
    '--ef-rule:#D9D9D6;--ef-chip:#E4E4E0;--ef-signal:#FFFA00;--ef-onSignal:#161616;--ef-cut:8px;}',
    'body[data-ds-dark-theme] .sm-ef-card{--ef-paper:#191919;--ef-panel:#222222;--ef-ink:#EDEDED;',
    '--ef-ink2:#A3A3A3;--ef-rule:#353535;--ef-chip:#2E2E2E;--ef-signal:#FFFA00;--ef-onSignal:#161616;}',
    // 眉标：宽体大写英文在上、粗体中文在下
    // summary 视图嵌在 DSH 插件列表（随宿主主题），颜色走 DSH alias token 自动适配；
    // 卡片 page 视图用 .sm-ef-card .sm-eyebrow（endfield ink token，见下）。
    '.sm-ef-eyebrow{display:flex;flex-direction:column;line-height:1.25;}',
    '.sm-ef-eyebrow .sm-en{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-label-secondary, #5C5C5C);}',
    '.sm-ef-eyebrow .sm-zh{font-size:15px;font-weight:700;color:var(--dsw-alias-label-primary, #161616);}',
    // 卡片 page 眉标（endfield ink token，随 .sm-ef-card 切深浅）
    '.sm-ef-card .sm-eyebrow{display:flex;flex-direction:column;line-height:1.25;}',
    '.sm-ef-card .sm-eyebrow .sm-en{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ef-ink2);}',
    '.sm-ef-card .sm-eyebrow .sm-zh{font-size:15px;font-weight:700;color:var(--ef-ink);}',
    // 卡片 page 容器
    '.sm-ef-card{display:flex;flex-direction:column;gap:0;padding:4px 0;max-width:560px;color:var(--ef-ink);}',
    '.sm-ef-card .sm-section{border-top:1px solid var(--ef-rule);padding:14px 0;display:flex;flex-direction:column;gap:10px;}',
    '.sm-ef-card .sm-section:first-child{border-top:0;padding-top:4px;}',
    '.sm-ef-card .sm-row{display:flex;align-items:center;gap:10px;}',
    '.sm-ef-card .sm-ctl-label{font-size:15px;font-weight:700;color:var(--ef-ink);}',
    '.sm-ef-card .sm-note{font-size:13px;color:var(--ef-ink2);line-height:1.6;}',
    // 档位按钮 = 筛选块（切角块，选中=黄填充）
    '.sm-ef-card .sm-btns{display:flex;flex-wrap:wrap;gap:6px;}',
    '.sm-ef-card .sm-btn{--fill:var(--ef-chip);display:inline-flex;align-items:baseline;gap:5px;',
    'padding:6px 12px 6px 12px;border:0;border-radius:0;cursor:pointer;font:inherit;font-size:13px;font-weight:600;',
    'color:var(--ef-ink2);background:linear-gradient(-45deg,transparent calc(var(--ef-cut) - .5px),var(--fill) var(--ef-cut));}',
    '.sm-ef-card .sm-btn .sm-n{font-size:11px;letter-spacing:.08em;color:var(--ef-ink2);}',
    '.sm-ef-card .sm-btn.is-on{--fill:var(--ef-signal);color:var(--ef-onSignal);}',
    '.sm-ef-card .sm-btn.is-on .sm-n{color:var(--ef-onSignal);}',
    '.sm-ef-card .sm-btn:disabled{opacity:.45;cursor:default;}',
    // 占位子面板 = 空状态：斜线纹 + 完整句子
    '.sm-ef-card .sm-placeholder{padding:16px 14px;color:var(--ef-ink2);font-size:13px;line-height:1.7;',
    'background:repeating-linear-gradient(-45deg,transparent 0 5px,rgba(22,22,22,.22) 5px 6.5px);}',
    'body[data-ds-dark-theme] .sm-ef-card .sm-placeholder{background:repeating-linear-gradient(-45deg,transparent 0 5px,rgba(237,237,237,.22) 5px 6.5px);}',
    // 出错 = 黄块提示（终末地：错误不用红，红只给删除）
    '.sm-ef-card .sm-err{display:inline-block;padding:4px 8px;font-size:12px;font-weight:600;',
    'color:var(--ef-onSignal);background:var(--ef-signal);}',
    // ---- 召回触发器（composer 右下角，照 ui-model-selection ModelSelect trigger）----
    '.sm-recall{position:relative;min-width:0;}',
    '.sm-recall-trigger{display:flex;align-items:center;gap:4px;',
    'height:28px;padding:0 8px;border:0;border-radius:8px;outline:none;background:transparent;',
    'color:var(--dsw-alias-label-secondary,#5C5C5C);font-size:13px;line-height:20px;font-weight:400;cursor:pointer;}',
    '.sm-recall-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));}',
    '.sm-recall-trigger:disabled{color:var(--dsw-alias-label-dimmed,#8A8A8A);cursor:default;}',
    // 下拉箭头（纯 CSS，点击翻转 120ms，照 ModelSelect .chevronOpen rotate 180）
    '.sm-recall-caret{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;',
    'border-top:5px solid var(--dsw-alias-label-caption,#8A8A8A);transition:transform 120ms ease;}',
    '.sm-recall-caret.is-open{transform:rotate(180deg);}',
    // ---- 弹出菜单（定位由 useAnchoredPosition style 驱动：position:fixed + top/left 等；MenuSurface 材质背景被覆盖为深空渐变，星点/流星为内容层）----
    '.sm-recall-pop{position:fixed;margin:0;z-index:1100;',
    'display:flex;flex-direction:column;gap:10px;width:272px;height:fit-content;',
    'max-width:calc(100vw - 24px);padding:12px 14px;box-sizing:border-box;',
    'overflow:hidden;border:0;',
    // 深空主题：覆盖 MenuSurface 材质变量 + 浅色文字 token（星云/流星雨配色）
    '--dsw-menu-surface-fill:radial-gradient(ellipse at 50% 130%,#1c2340 0%,#0a0d1a 68%);',
    '--dsw-alias-label-primary:#EDEDED;--dsw-alias-label-secondary:#C6CDE0;',
    '--dsw-alias-label-caption:#8A93A6;--dsw-alias-label-dimmed:#6B7280;',
    '--dsw-elevation-stroke-color:rgba(120,150,255,.28);box-shadow:0 10px 34px rgba(0,0,0,.55);}',
    // 静态星点（多层 radial-gradient 星 + 微闪脉动；z-index:0 = 在深空背景之上、内容之下，可见）
    '.sm-recall-pop .sm-recall-stars{position:absolute;inset:0;z-index:0;pointer-events:none;',
    'background-image:radial-gradient(1.6px 1.6px at 18% 26%,rgba(255,255,255,.95),transparent),',
    'radial-gradient(1px 1px at 62% 16%,rgba(190,215,255,.8),transparent),',
    'radial-gradient(1.4px 1.4px at 84% 52%,rgba(255,255,255,.7),transparent),',
    'radial-gradient(1px 1px at 38% 68%,rgba(170,200,255,.6),transparent),',
    'radial-gradient(1.6px 1.6px at 8% 78%,rgba(255,255,255,.85),transparent),',
    'radial-gradient(1px 1px at 74% 84%,rgba(255,255,255,.5),transparent),',
    'radial-gradient(1px 1px at 48% 42%,rgba(255,255,255,.45),transparent);',
    'animation:sm-twinkle 4.5s ease-in-out infinite alternate;}',
    '@keyframes sm-twinkle{0%{opacity:.55}50%{opacity:1}100%{opacity:.7}}',
    // 流星：斜向尾迹（头白/尾透明），错峰划过（照 effect-labs shooting-star；z-index:0 = 背景之上、内容之下，可见）
    '.sm-recall-pop .sm-recall-meteor{position:absolute;z-index:0;pointer-events:none;',
    'width:64px;height:2px;border-radius:2px;',
    'background:linear-gradient(90deg,rgba(255,255,255,.95),rgba(154,208,255,.5),transparent);',
    'animation:sm-shoot 6s linear infinite;opacity:0;}',
    '.sm-recall-pop .sm-recall-meteor.m1{top:16%;left:78%;animation-delay:0s;}',
    '.sm-recall-pop .sm-recall-meteor.m2{top:44%;left:30%;width:46px;animation-delay:2.8s;}',
    '@keyframes sm-shoot{0%{transform:translate(0,0) rotate(-45deg);opacity:0;}',
    '4%{opacity:.9;}28%{transform:translate(-150px,150px) rotate(-45deg);opacity:0;}',
    '100%{transform:translate(-150px,150px) rotate(-45deg);opacity:0;}}',
    // 头部眉标 / 数字（z-index:1 = 在星点/流星 z-index:0 之上）；弹窗不再有召回开关（开关在设置面板）
    '.sm-recall-pop .sm-recall-head{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.sm-recall-pop .sm-recall-en{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;',
    'color:var(--dsw-alias-label-caption,#8A93A6);}',
    '.sm-recall-pop .sm-recall-num{position:relative;z-index:1;display:flex;align-items:baseline;gap:4px;}',
    '.sm-recall-pop .sm-recall-num .sm-n{font-size:19px;font-weight:700;color:var(--dsw-alias-label-primary,#EDEDED);}',
    '.sm-recall-pop .sm-recall-num .sm-c{font-size:10px;letter-spacing:.1em;text-transform:uppercase;',
    'color:var(--dsw-alias-label-caption,#8A93A6);}',
    // 轨道：1:1 复刻 Codex reasoning slider（rail/fill/dot/knob/particles/burst 结构 + 尺寸），配色改星空。
    // 轨道底：高 26px 圆角 16px（照 Codex .rail），星空下用浅白轨道
    '.sm-recall-pop .sm-recall-track{position:relative;z-index:1;width:248px;height:26px;border-radius:16px;',
    'background:rgba(255,255,255,.10);}',
    // 填充：左圆角 16px 右直角，宽 calc((100%-30px)*pos+15px)（照 Codex .fill，30=knob 宽），青蓝→紫星空尾迹
    '.sm-recall-pop .sm-recall-fill{position:absolute;inset:0 auto 0 0;',
    'width:calc((100% - 30px)*var(--sm-pos,0) + 15px);border-radius:16px 0 0 16px;overflow:hidden;pointer-events:none;',
    'background:linear-gradient(90deg,#6EB6FF,#9C4CE3);',
    'transition:width .18s cubic-bezier(.2,.8,.2,1);}',
    // 最高档（6）：尾迹紫色发光 glow（照 Codex .fill:after，紫色渐变 + blur + mask）+ 扫光 shimmer
    '.sm-recall-pop .sm-recall-fill::after{content:"";position:absolute;inset:-12px -24px;border-radius:28px;',
    'background:linear-gradient(95deg,#3065de 0%,#7757ee 32%,#b052f1 53%,#7d42e7 76%,#5631d0 100%);',
    'filter:blur(5px);opacity:0;',
    'mask-image:linear-gradient(90deg,transparent 0%,#000 22%,#000 78%,transparent 100%);',
    '-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 22%,#000 78%,transparent 100%);',
    'transform:translateX(42%);transition:transform 1.8s cubic-bezier(.16,1,.3,1),opacity 1.25s ease;}',
    '.sm-recall-pop .sm-recall-track.maxed .sm-recall-fill::after{opacity:.9;transform:translateX(0);}',
    '.sm-recall-pop .sm-recall-track.maxed .sm-recall-fill::before{content:"";position:absolute;inset:-10px -40px;',
    'background:linear-gradient(100deg,transparent 18%,rgba(255,255,255,.03) 35%,rgba(255,255,255,.19) 48%,',
    'rgba(255,255,255,.04) 66%,transparent 84%);',
    'animation:sm-meteor-shimmer 4.5s ease-in-out infinite alternate;z-index:1;}',
    '@keyframes sm-meteor-shimmer{from{transform:translateX(-45%)}to{transform:translateX(45%)}}',
    // 档位刻度点（0-6 共 7 个；passed=已点亮）：4px 圆，top 11px，left calc((100%-30px)*tick+15px)（照 Codex .dot）
    '.sm-recall-pop .sm-recall-dot{position:absolute;top:11px;left:calc((100% - 30px)*var(--sm-tick,0) + 15px);',
    'width:4px;height:4px;margin-left:-2px;border-radius:50%;background:rgba(255,255,255,.32);pointer-events:none;',
    'transition:opacity .18s ease .22s,transform .14s ease;}',
    '.sm-recall-pop .sm-recall-dot.passed{background:rgba(255,255,255,.75);}',
    // 手柄：30px 圆（照 Codex .knob），星空配色=深空底 + 青蓝紫光晕 + 细边框
    '.sm-recall-pop .sm-recall-thumb{position:absolute;z-index:2;left:calc((100% - 30px)*var(--sm-pos,0));top:-2px;',
    'width:30px;height:30px;border-radius:50%;pointer-events:none;background:#0a0d1a;',
    'border:.5px solid rgba(255,255,255,.35);',
    'box-shadow:0 0 12px rgba(156,200,255,.85),0 0 5px rgba(156,76,227,.55);',
    'transition:left .18s cubic-bezier(.2,.8,.2,1);}',
    // 粒子 canvas（照 Codex .sparks）：248×26，铺在填充上
    '.sm-recall-pop .sm-recall-sparks{display:block;width:248px;height:26px;}',
    // 爆开 canvas（照 Codex .burst）：52×52，位于 knob 右上
    '.sm-recall-pop .sm-recall-burst{position:absolute;left:calc(100% - 41px);top:-13px;width:52px;height:52px;',
    'pointer-events:none;z-index:4;}',
    // 交互层：透明 range 覆盖（保留拖动/键盘/无障碍），视觉在下
    '.sm-recall-pop .sm-recall-range{-webkit-appearance:none;appearance:none;position:absolute;inset:0;z-index:3;',
    'width:248px;height:26px;margin:0;background:transparent;outline:none;cursor:pointer;opacity:0;}',
    '.sm-recall-pop .sm-recall-range::-webkit-slider-runnable-track{height:26px;background:transparent;}',
    '.sm-recall-pop .sm-recall-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;',
    'width:26px;height:26px;background:transparent;border:0;}',
    '.sm-recall-pop .sm-recall-range::-moz-range-track{height:26px;background:transparent;}',
    '.sm-recall-pop .sm-recall-range::-moz-range-thumb{width:26px;height:26px;background:transparent;border:0;}',
    '.sm-recall-pop .sm-recall-err{position:relative;z-index:1;font-size:11px;font-weight:600;color:#FFFA00;}',
    // ② 拖动中：只禁填充宽度过渡（更跟手），**不暂停流星/星星/扫光**（用户要求背景动效滑动时继续）；
    // 粒子流动在 JS 里已暂停（sliding）保性能。
    '.sm-recall-pop.is-sliding .sm-recall-fill{transition:none;}',
    '@media (prefers-reduced-motion: reduce){.sm-recall-pop .sm-recall-stars{animation:none;}',
    '.sm-recall-pop .sm-recall-meteor{animation:none;opacity:0;}',
    '.sm-recall-pop .sm-recall-fill{transition:none;}',
    '.sm-recall-pop .sm-recall-fill::before{animation:none;}',
    '.sm-recall-pop .sm-recall-fill::after{transition:none;}}',
  ].join('')

  function ensureStyle(id, css) {
    try {
      if (typeof document === 'undefined') return
      if (document.getElementById(id)) return
      var el = document.createElement('style')
      el.id = id
      el.textContent = css
      document.head.appendChild(el)
    } catch (e) {
      console.warn('[starmemory] style inject failed:', e)
    }
  }

  // ================= 数据桥：scope → 派生快照（React #185 防线） =================
  function createScopeBridge(scope) {
    var cache
    var listeners = []
    var pollTimer = null

    function derive(snap) {
      var v = (snap && snap.value) || {}
      return {
        status: snap ? snap.status : 'unavailable',
        writable: !!(snap && snap.writable),
        enabled: v.recallEnabled === true,
        effort: Number(v.recallEffort) || 0,
      }
    }
    function getSnapshot() {
      var snap = null
      if (scope && typeof scope.getSnapshot === 'function') {
        try { snap = scope.getSnapshot() } catch (e) { console.warn('[starmemory] getSnapshot failed:', e); snap = null }
      }
      if (cache !== undefined && cache.snap === snap) return cache.state
      cache = { snap: snap, state: derive(snap) }
      return cache.state
    }
    function notify() {
      listeners.forEach(function (l) { try { l() } catch (e) { console.warn('[starmemory] listener failed:', e) } })
    }
    function subscribe(cb) {
      listeners.push(cb)
      var hostUnsub = null
      if (scope && typeof scope.subscribe === 'function') {
        try { hostUnsub = scope.subscribe(notify) } catch (e) { console.warn('[starmemory] scope.subscribe failed:', e) }
      }
      if (!hostUnsub && !pollTimer) {
        pollTimer = setInterval(function () {
          var before = cache
          getSnapshot()
          if (before !== cache) notify()
        }, 500)
      }
      return function () {
        var i = listeners.indexOf(cb)
        if (i >= 0) listeners.splice(i, 1)
        if (hostUnsub) { try { hostUnsub() } catch (e) {} }
        if (listeners.length === 0 && pollTimer) { clearInterval(pollTimer); pollTimer = null }
      }
    }
    return { getSnapshot: getSnapshot, subscribe: subscribe }
  }

  // ================= 写路径：直接写模式（优先 set，回退 mutate） =================
  function makeCommit(scope, t) {
    return function commit(ops) {
      var all = ops.slice()
      var hasFlag = all.some(function (o) { return o.key === 'recallPanelConfigured' })
      if (!hasFlag) all.push({ key: 'recallPanelConfigured', value: true })
      if (all.length > 1 && scope && typeof scope.mutate === 'function') {
        try {
          var snap = scope.getSnapshot()
          scope.mutate(
            all.map(function (o) { return { op: 'set', path: [o.key], value: o.value } }),
            snap && snap.revision,
          )
          return null
        } catch (e) {
          console.warn('[starmemory] mutate failed, fallback to set:', e)
        }
      }
      if (!scope || typeof scope.set !== 'function') {
        var msg = 'scope.set unavailable'
        console.warn('[starmemory] ' + msg)
        return msg
      }
      for (var i = 0; i < all.length; i++) {
        try { scope.set(all[i].key, all[i].value) }
        catch (e) { console.warn('[starmemory] set failed:', e); return t('error.writeFailed') }
      }
      return null
    }
  }

  // ================= 聊天输入框召回触发器（conversation.input.right）：照 ui-model-selection ModelSelect =================
  // 「召回」文字 trigger + 点击 createPortal(MenuSurface) 向上弹出滑块小模块。
  // 数据仍走 configForms scope（bridge/commit），与 settings.section 面板同源。
  // 动效：MenuSurface phase='enter'/'dismiss'（Menu 原语淡入/淡出，CSS 驱动）。
  // trigger 始终可点（首次 unavailable 时打开即写默认值解锁，见 onClick）。
  function createRecallTrigger(bridge, commit, t) {
    // 未测量首帧隐藏（useAnchoredPosition 尚未算出位置时防跳动/闪位）
    var MEASURE_STYLE = { opacity: 0, visibility: 'hidden' }
    // 复刻 Codex 滑块的粒子种子（20 个 [x,y]，基准宽 346）
    var PARTICLE_SEEDS = [[17, 15], [20, 12], [28, 18], [48, 21], [69, 23], [95, 15], [112, 20],
      [134, 15], [138, 24], [150, 9], [165, 20], [177, 10], [190, 22], [198, 26], [217, 15],
      [237, 18], [254, 12], [275, 24], [290, 14], [315, 20]]
    return function RecallComposerTrigger() {
      var state = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
      var openState = React.useState(false)
      var phaseState = React.useState(null)
      var errState = React.useState('')
      var timerRef = React.useRef(null)
      var rootRef = React.useRef(null)
      var menuRef = React.useRef(null)
      var triggerRef = React.useRef(null)
      // ① 拖动本地回显：localRef 存拖动中的值（即时跟手），localState 触发重渲染
      var localRef = React.useRef(null)
      var localState = React.useState(null)
      var open = openState[0], setOpen = openState[1]
      var phase = phaseState[0], setPhase = phaseState[1]
      var errValue = errState[0], setErr = errState[1]
      var local = localState[0], setLocal = localState[1]
      // v1.2.20+：复刻 Codex 滑块粒子/爆开（canvas rAF 动画）
      var sparksRef = React.useRef(null)
      var burstRef = React.useRef(null)
      var latestRef = React.useRef({ open: false, ultra: false, sliding: false })

      React.useEffect(function () { ensureStyle('sm-ef-style', EF_CSS) }, [])

      // 复刻 Codex 滑块粒子/爆开 canvas 动画（rAF）。拖动中（sliding）暂停流动省性能；
      // 进最高档（6）触发紫色爆开。open 时启动，close 清理。
      React.useEffect(function () {
        if (!open) return
        var sparks = sparksRef.current, burst = burstRef.current
        if (!sparks || !burst) return
        var sctx = sparks.getContext('2d'), bctx = burst.getContext('2d')
        var width = 248
        var frame = 0, last = 0, travel = 0, burstAt = 0, wasUltra = false
        function draw(time) {
          var cur = latestRef.current
          var delta = last ? Math.min(time - last, 50) / 1000 : 0
          last = time
          var ultra = cur.ultra && !cur.sliding
          var speed = ultra ? 1 : 0
          if (ultra && !wasUltra) burstAt = time
          wasUltra = ultra
          if (ultra) travel += delta
          sctx.clearRect(0, 0, width * 2, 52)
          bctx.clearRect(0, 0, 144, 144)
          if (cur.open) {
            var t = time / 1000
            for (var i = 0; i < PARTICLE_SEEDS.length; i++) {
              var px = PARTICLE_SEEDS[i][0], py = PARTICLE_SEEDS[i][1]
              var phase = i * 2.39
              var offset = ultra ? travel * (145 + i % 6 * 17) : 0
              var x = (((px / 346 * width - offset + Math.sin(t * 9 + phase) * .7 * (1 - speed)) % width) + width) % width
              var y = (py + Math.cos(t * 10 + phase) * .55 * (1 - speed) + Math.sin(t * 1.3 + phase) * .8 * speed) * 26 / 36
              var idle = .55 + .3 * (.5 + .5 * Math.sin(t * 1.1 + phase))
              var moving = .3 + .45 * (.5 + .5 * Math.sin(t * 2.4 + phase))
              var radius = (i % 7 === 0 ? 2.1 : i % 4 === 0 ? 1.55 : 1.1) * 26 / 36
              sctx.beginPath(); sctx.arc(x * 2, y * 2, radius * 2, 0, Math.PI * 2)
              sctx.fillStyle = 'rgba(255,255,255,' + (idle + (moving - idle) * speed) + ')'
              sctx.fill()
            }
            if (burstAt && time - burstAt < 520) {
              var age = (time - burstAt) / 1000
              for (var j = 0; j < 22; j++) {
                var angle = j * 2.399 + .18
                var bx = 72 + Math.cos(angle) * (43 + (48 + j % 5 * 12) * age * 2)
                var by = 72 + Math.sin(angle) * (43 + (48 + j % 4 * 10) * age * 2)
                bctx.beginPath(); bctx.arc(bx, by, (j % 6 === 0 ? 2.3 : 1.35) * 2 * (1 - age), 0, Math.PI * 2)
                bctx.fillStyle = 'rgba(156,76,227,' + (.7 * (1 - age / .52)) + ')'
                bctx.fill()
              }
            }
          }
          frame = requestAnimationFrame(draw)
        }
        frame = requestAnimationFrame(draw)
        return function () { cancelAnimationFrame(frame) }
      }, [open])

      function close() {
        setPhase('dismiss')
        if (timerRef.current) clearTimeout(timerRef.current)
        // 丢弃拖动中未提交的本地值（回落 store），避免重开时误显示残留档位
        localRef.current = null
        timerRef.current = setTimeout(function () { setOpen(false); setPhase(null) }, 80)
      }
      // 外部点击关闭（照 ModelSelect：portaled 卡片在 trigger 子树外，需查两者）
      React.useEffect(function () {
        if (!open) return
        function closeOutside(e) {
          if (rootRef.current && rootRef.current.contains(e.target)) return
          if (menuRef.current && menuRef.current.contains(e.target)) return
          close()
        }
        document.addEventListener('mousedown', closeOutside)
        return function () { document.removeEventListener('mousedown', closeOutside) }
      }, [open])

      function doCommit(v) { setErr(commit(v) || '') }
      function onToggle(next) { doCommit([{ key: 'recallEnabled', value: !!next }]) }
      function onLevel(v) {
        if (v === 0) doCommit([{ key: 'recallEffort', value: 0 }, { key: 'recallEnabled', value: false }])
        else doCommit([{ key: 'recallEffort', value: v }, { key: 'recallEnabled', value: true }])
      }
      function onSlide(e) {
        var v = Number(e.target.value) || 0
        // ① 本地即时回显：拖动中 value 用本地值（不等 store 往返），跟手不卡
        localRef.current = v
        setLocal(v)
        if (timerRef.current) clearTimeout(timerRef.current)
        // ② 停止 250ms 后 commit（完整往返）。**不清 localRef**：等 store 值（shown）追上本地值才清
        // （见下方 effect），否则 displayValue 回落到未更新的旧 store 值 → 回弹竞态。
        timerRef.current = setTimeout(function () { onLevel(v) }, 250)
      }

      var disabled = state.status !== 'ready' || !state.writable
      var shown = state.enabled ? state.effort : 0
      // ① 拖动中显示本地值（即时跟手），否则回落 store 值；localRef.current 可能为 0，用 !== null 判
      var displayValue = localRef.current !== null ? localRef.current : shown
      var pos = displayValue / 6
      latestRef.current = { open: open, ultra: displayValue === 6, sliding: localRef.current !== null }
      // ② 回弹治本（竞态）：commit 发出时不清 localRef（见 onSlide），等 store 值（shown）真正追上
      // 本地值才清——否则 displayValue 回落到未更新的旧 store 值 → 滑块弹回旧值。
      React.useEffect(function () {
        if (localRef.current !== null && shown === localRef.current) {
          localRef.current = null
          setLocal(null)
        }
      }, [shown])
      var pad = function (n) { return (n < 10 ? '0' : '') + n }
      // 定位：弃 CSS anchor positioning（Chrome 125+ 新特性、行为不稳），改用 DSH 自带 useAnchoredPosition
      // （ModelSelect 同款：自动算位 + 视口不够自动翻转）。side:'top' = 弹窗在触发器上方（输入框在窗口底部）。
      // layoutKey：layout 变化时触发重算（composer 高度/视口缩放）。
      var menuPos = useAnchoredPosition({
        open: open,
        anchorRef: triggerRef,
        panelRef: menuRef,
        side: 'top', align: 'end', gap: 8, margin: 12,
        layoutKey: 'sm-recall',
      })

      var pop = null
      if (open) {
        pop = ReactDOM.createPortal(
          h(MenuSurface, {
            ref: menuRef,
            // ② 拖动中加 is-sliding：暂停星空/流星动画（省合成，拖动更顺）
            className: 'sm-ef sm-recall-pop' + (localRef.current !== null ? ' is-sliding' : ''),
            // style = useAnchoredPosition 算出的绝对定位（position:fixed + top/left 等）；
            // 未测量（menuPos 为 null）时用 MEASURE_STYLE 隐藏首帧防跳动。
            // --sm-rainbow 提至 pop 根：toggle 圆点与轨道填充共用（星云点缀色）。
            style: Object.assign({}, menuPos || MEASURE_STYLE, { '--sm-rainbow': RAINBOW }),
            phase: phase, role: 'menu', 'aria-label': t('slider.title'),
          },
            // 星空层：静态星点（多层 radial-gradient + 微闪）+ 两条错峰流星（z-index:-1，在材质之上、内容之下）
            h('div', { className: 'sm-recall-stars' }),
            h('div', { className: 'sm-recall-meteor m1' }),
            h('div', { className: 'sm-recall-meteor m2' }),
            h('div', { className: 'sm-recall-head' },
              h('span', { className: 'sm-recall-en' }, '// RECALL'),
            ),
            h('div', { className: 'sm-recall-num' },
              h('span', { className: 'sm-n' }, t('effort.' + displayValue)),
              h('span', { className: 'sm-c' }, '/ 06'),
            ),
            h('div', {
              className: 'sm-recall-track' + (displayValue === 6 ? ' maxed' : ''),
              style: { '--sm-pos': pos },
            },
              // 1:1 复刻 Codex 滑块视觉层：轨道底 + 青蓝→紫尾迹填充（内嵌粒子 canvas）+ 档位刻度点 +
              // 30px 圆手柄 + 爆开 canvas。交互仍由下方透明 range 接收（拖动/键盘/无障碍零改动）。
              h('div', { className: 'sm-recall-fill' },
                h('canvas', { ref: sparksRef, className: 'sm-recall-sparks', width: 496, height: 52 }),
              ),
              Array.from({ length: 7 }, function (_, i) {
                return h('i', {
                  key: i,
                  className: 'sm-recall-dot' + (i <= displayValue ? ' passed' : ''),
                  style: { '--sm-tick': i / 6 },
                })
              }),
              h('div', { className: 'sm-recall-thumb' }),
              h('canvas', { ref: burstRef, className: 'sm-recall-burst', width: 144, height: 144 }),
              h('input', {
                className: 'sm-recall-range', type: 'range', min: 0, max: 6, step: 1,
                value: displayValue, disabled: disabled, onChange: onSlide,
              }),
            ),
            errValue ? h('span', { className: 'sm-recall-err' }, errValue) : null,
          ),
          document.body,
        )
      }

      // 召回是总功能：recallEnabled=false（设置面板关闭）时隐藏聊天区召回按钮（弹窗也随之不渲染）；
      // 开关只在设置面板，聊天区弹窗只留眉标 + 档位数字 + 滑块。
      if (!state.enabled) return null
      return h('div', { ref: rootRef, className: 'sm-ef sm-recall' },
        h('button', {
          ref: triggerRef,
          type: 'button', className: 'sm-recall-trigger',
          'aria-haspopup': 'menu', 'aria-expanded': open ? 'true' : 'false',
          onClick: function () {
            // 取消残留的 close/dismiss timer，避免「关闭动画中快速重开」被旧 timer 误关
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
            if (open) { close(); return }
            // 首次未配置（unavailable）打开即写默认值解锁（host served → status ready → 控件可点）
            if (state.status === 'unavailable') {
              try { commit([{ key: 'recallEnabled', value: false }, { key: 'recallEffort', value: 0 }]) } catch (e) {}
            }
            setOpen(true); setPhase('enter')
          },
        },
          h('span', { className: 'sm-recall-label' }, t('slider.title')),
          h('span', { className: 'sm-recall-caret' + (open ? ' is-open' : '') }),
        ),
        pop,
      )
    }
  }

  // ================= 设置页面板（settings.section）：主设置页独立分区 =================
  // 设计归属：召回开关 + 0-6 档位本就该在主设置页（像 bili-scroll「刷B站」），不是插件详情页卡片。
  // 组件经闭包拿 bridge/commit（configForms scope 单一事实源）；settings.section 是 keyed 槽，id=包名。
  function createSection(bridge, commit, t, scope) {
    return function StarMemorySection() {
      var state = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
      var err = React.useState('')
      var errValue = err[0], setErr = err[1]
      var unlockRef = React.useRef(false)
      // v1.2.20 点击延迟优化：设置面板本地回显（开关/档位点击立即切换 UI，不等 configForms 往返）。
      // localRef 存乐观值 {enabled,effort}；state 追上来后清（无闪回），commit 失败保持乐观值。
      var localRef = React.useRef(null)
      var localState = React.useState(null)
      var setLocal = localState[1]

      // v1.2.14 首次配置死锁解锁：host 未 served 本 namespace → snapshot.status === 'unavailable'
      // → Switch/按钮 disabled → 无法写入 → 死锁。写一次默认值，host 收到写入即 served
      // （mutate → mirror.acceptView 折回 view → derive → status ready），控件解锁。
      // 用 scope.mutate（框架形状 op:'set'，与 nekowhale line 568 一致）而非 commit（fire-and-forget，
      // 无法检测失败）；失败重置 ref，状态仍 unavailable 时后续可重试。
      React.useEffect(function () {
        if (state.status !== 'unavailable' || unlockRef.current) return
        if (!scope || typeof scope.mutate !== 'function') return
        unlockRef.current = true
        scope.mutate([
          { op: 'set', path: ['recallEnabled'], value: false },
          { op: 'set', path: ['recallEffort'], value: 0 },
          { op: 'set', path: ['recallPanelConfigured'], value: true },
        ]).then(function (ok) {
          if (ok === false) throw new Error('host rejected first-config write')
        }).catch(function (e) {
          console.warn('[starmemory] first-config unlock failed:', e)
          unlockRef.current = false
        })
      }, [state.status])

      // v1.2.20：state 追上本地回显时清 localRef（UI 回落 state，同值无闪变）；commit 失败则不追、保持乐观值。
      React.useEffect(function () {
        if (!localRef.current) return
        if (state.enabled === localRef.current.enabled && state.effort === localRef.current.effort) {
          localRef.current = null
        }
      }, [state])

      function run(ops) { setErr(commit(ops) || '') }
      function onToggle(next) {
        // 本地立即回显（开关点击秒切换），commit 后台写
        localRef.current = { enabled: !!next, effort: localRef.current ? localRef.current.effort : state.effort }
        setLocal(localRef.current)
        run([{ key: 'recallEnabled', value: !!next }])
      }
      function onLevel(v) {
        // 本地立即回显（档位点击秒高亮），commit 后台写
        localRef.current = { enabled: v !== 0, effort: v }
        setLocal(localRef.current)
        if (v === 0) run([{ key: 'recallEffort', value: 0 }, { key: 'recallEnabled', value: false }])
        else run([{ key: 'recallEffort', value: v }, { key: 'recallEnabled', value: true }])
      }

      var disabled = state.status !== 'ready' || !state.writable
      // 显示值：本地回显优先（点击立即切换），否则 state
      var shownEnabled = localRef.current ? localRef.current.enabled : state.enabled
      var shownEffort = localRef.current ? localRef.current.effort : state.effort
      var pad = function (n) { return (n < 10 ? '0' : '') + n }
      var btnRow = h('div', { className: 'sm-btns' },
        [0, 1, 2, 3, 4, 5, 6].map(function (i) {
          var active = shownEnabled && shownEffort === i
          return h('button', {
            key: i,
            className: 'sm-btn' + (active ? ' is-on' : ''),
            onClick: function () { onLevel(i) },
            disabled: disabled,
          },
            h('span', { className: 'sm-n' }, pad(i)),
            t('effort.' + i))
        }))

      return h('div', { className: 'sm-ef sm-ef-card', style: {
        display: 'flex', flexDirection: 'column', gap: 0, padding: '4px 0',
      } },
        h('div', { className: 'sm-section' },
          h('div', { className: 'sm-eyebrow' },
            h('span', { className: 'sm-en' }, '// RECALL'),
            h('span', { className: 'sm-zh' }, t('card.controlTitle')),
          ),
          h('div', { className: 'sm-row' },
            Switch({ checked: shownEnabled, onChange: onToggle, label: t('card.autoRecall'), disabled: disabled }),
            h('span', { className: 'sm-ctl-label' }, t('card.autoRecall')),
          ),
          h('div', null,
            h('div', { className: 'sm-note', style: { marginBottom: '8px' } }, t('card.effortNote')),
            btnRow,
          ),
        ),
        h('div', { className: 'sm-section' },
          h('div', { className: 'sm-eyebrow' },
            h('span', { className: 'sm-en' }, '// OBSERVE'),
            h('span', { className: 'sm-zh' }, t('card.observeTitle')),
          ),
          h('div', { className: 'sm-placeholder' },
            t('card.observePlaceholder')),
        ),
        errValue ? h('div', { className: 'sm-section' }, h('span', { className: 'sm-err' }, errValue)) : null,
        !disabled && state.status === 'ready'
          ? h('div', { className: 'sm-section' }, h('div', { className: 'sm-note' }, t('card.saveNote')))
          : null,
      )
    }
  }

  // ================= apply：注册两个 slot（各自独立 try/catch） =================
  var module = { exports: {} }
  module.exports.name = 'starmemory-dsh-client'
  // v1.2.10：client 侧 inject 只声明 slots（nekowhale 实测姿势）。之前 inject ['slots','locale','configForms']
  // 在 DSH 客户端整批失败（ctx 只挂 fiber，一个都没挂上，测试机 bug #6 铁证）——client 侧 DSH 对 inject
  // 要么整批成功要么整批失败，locale/configForms 某服务名不可解析会把整批带崩。故只 inject 确定能用的 slots；
  // configForms 经 ctx.inject 回调拿（nekowhale 姿势），locale 单独回调最佳努力（失败回退中文）。
  module.exports.inject = ['slots']
  module.exports.apply = function apply(ctx) {
    try {
      // 诊断（bug #8 定位）：确认 apply 被调用 + ctx 上挂了什么服务
      try { console.log('[starmemory] DEBUG apply called, ctx keys:', Object.keys(ctx).join(',')) } catch (e) {}
      ensureStyle('sm-ef-style', EF_CSS)
      var t = makeTranslator()

      // locale 最佳努力：单独 ctx.inject 回调拿（失败/服务名不可解析 → t 保持中文，不影响 configForms）
      if (ctx.inject && typeof ctx.inject === 'function') {
        try {
          ctx.inject(['locale'], function (sctx) {
            var localeService = sctx && sctx.locale
            if (localeService && typeof localeService.register === 'function') {
              try { localeService.register(NS, DICTS) } catch (e) { console.warn('[starmemory] locale register failed:', e) }
            }
            t.setLocale(localeService)
          })
        } catch (e) {
          console.warn('[starmemory] locale inject failed:', e)
        }
      }

      // configForms 经 ctx.inject 回调拿（nekowhale 验证姿势）：scope → bridge/commit → 注册两个 slot。
      if (ctx.inject && typeof ctx.inject === 'function') {
        ctx.inject(['configForms', 'settingsSchema'], function (sctx) {
          // 诊断（bug #8 定位）：确认 configForms 作用域里能拿到 scope + sctx 上有什么服务
          try { console.log('[starmemory] DEBUG configForms cb, sctx keys:', Object.keys(sctx || {}).join(',')) } catch (e) {}
          // v1.2.12（照抄 nekowhale 整套姿势）：用回调作用域 sctx.slots（非外层 ctx.slots）——
          // nekowhale 的 plugins.bundle.config 就是嵌在 ctx.inject 回调里用 sctx.slots 注册的（实测能显示）。
          var slots = (sctx && sctx.slots) ? sctx.slots : (ctx.slots || null)
          var scope = (sctx && sctx.configForms) ? sctx.configForms.get(NS) : null
          // v1.2.7：首次无配置时 namespace 未暴露 → scope 存在但 snapshot.status === 'unavailable'。
          // 面板是首次配置的入口，必须无条件注册（unavailable 由组件内降级：面板控件 disabled、滑块 return null）。
          if (!scope || typeof scope.getSnapshot !== 'function') {
            console.warn('[starmemory] configForms scope unavailable; panel/slider show degraded state')
          }
          // settings.section / conversation.input.right 组件都经闭包拿 bridge/commit（configForms scope 单一事实源），
          // 无需 inject:()=>face（那是 plugins.bundle.config 的宿主展开姿势，本版已移除详情页卡片）。
          var bridge = createScopeBridge(scope)
          var commit = makeCommit(scope, t)

          try {
            slots.inject('conversation.input.right', function () {
              return slots.register(
                { name: 'conversation.input.right', id: 'starmemory-recall-trigger', order: 10, label: function () { return t('slider.title') } },
                createRecallTrigger(bridge, commit, t),
              )
            })
            try { console.log('[starmemory] DEBUG registered slot conversation.input.right') } catch (e) {}
          } catch (e) {
            console.warn('[starmemory] recall trigger disabled:', e)
          }

          // 主设置页独立分区（settings.section）：召回 Switch + 0-6 档位（bili-scroll「刷B站」姿势）。
          // settings.section 是 keyed 槽，唯一键用 id=包名；label=左侧导航项；order=排序。
          // 无条件注册（首次无配置时 scope unavailable，由组件内降级：Switch/按钮 disabled）。
          try {
            slots.inject('settings.section', function () {
              return slots.register(
                { name: 'settings.section', id: PKG, order: 50, label: 'StarMemory' },
                createSection(bridge, commit, t, scope),
              )
            })
            try { console.log('[starmemory] DEBUG registered slot settings.section') } catch (e) {}
          } catch (e) {
            console.warn('[starmemory] settings section disabled:', e)
          }
        })
      } else {
        console.warn('[starmemory] ctx.inject unavailable; client UI disabled')
      }
    } catch (e) {
      console.warn('[starmemory] client apply failed:', e)
    }
  }
  return module.exports
}})
