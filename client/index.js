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
//     - shell.overlay  聊天区召回滑块（fixed 右上角；unavailable/关闭 → 消失）
//     - plugins.item   Plugins 页设置卡片（Switch + 0-6 档位按钮 + 占位子面板）
//   数据源：configForms.get('starmemory-dsh') scope —— 单一事实源（Config volatile 叶）。
//   v1.2.7：两个 slot 均无条件注册（不 gate 在 configForms 可用性/whileServed）——
//   首次无配置时 snapshot.status === 'unavailable'，由组件内降级（卡片 disabled、滑块 return null）；
//   卡片是首次配置入口，被 gate 会整个面板不出现（测试机确诊）。
//   v1.2.10：client 侧服务访问改回调式（bug #6：inject 多服务整批失败，ctx 只挂 fiber）。
//   v1.2.11（bug #8 根因）：plugins.item 槽的声明者/消费者是 @deepseek-ai/dsh-client-ui-plugin-manager，
//   不在种子表 → 必须经 package.json 的 dsh.client.inject 注入，否则槽无消费者、注册了也不渲染
//   （测试机 0.2.2-rc.1：注册无报错但 sm-ef DOM 计数 0；对照 dsh-bili-scroll 实测能显示即因注入了槽声明者包）。
//   i18n（v1.2.5）：文案走客户端字典 DICTS（08-i18n §1），locale 服务缺席/缺键回退中文。

window.__ModuleLoader__.load({ id: 'starmemory-dsh', factory: function (require) {
  'use strict'

  var React = require('react')
  var h = React.createElement
  var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
  var Switch = primitives.Switch

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
    // ---- 滑块：深色命令栏（两主题都深）+ 保留彩虹/发光/循环流星 ----
    '.sm-ef-slider{--ef-ink:#EDEDED;--ef-ink2:#A3A3A3;--ef-rule:#353535;--ef-cut:10px;',
    '--sm-rainbow:' + RAINBOW + ';position:fixed;top:16px;right:16px;z-index:9999;display:flex;align-items:center;',
    'gap:12px;padding:10px 14px;background:#161616;border:1px solid var(--ef-rule);border-radius:0;',
    'clip-path:polygon(0 0,100% 0,100% calc(100% - var(--ef-cut)),calc(100% - var(--ef-cut)) 100%,0 100%);',
    'overflow:hidden;}',
    '.sm-ef-slider .sm-stars{position:absolute;inset:0;pointer-events:none;z-index:0;}',
    '.sm-ef-slider .sm-stars::before{content:"";position:absolute;width:2px;height:2px;background:#fff;',
    'box-shadow:12px 9px 0 0 rgba(255,255,255,.9),34px 22px 0 0 rgba(255,255,255,.6),55px 6px 0 0 rgba(255,255,255,.4),',
    '78px 26px 0 0 rgba(255,255,255,.8),100px 12px 0 0 rgba(255,255,255,.5),122px 30px 0 0 rgba(255,255,255,.45),',
    '148px 8px 0 0 rgba(255,255,255,.7),168px 24px 0 0 rgba(255,255,255,.3),190px 14px 0 0 rgba(255,255,255,.6),',
    '210px 30px 0 0 rgba(255,255,255,.8),60px 34px 0 0 rgba(255,255,255,.3),135px 2px 0 0 rgba(255,255,255,.4),',
    '88px 2px 0 0 rgba(255,255,255,.25),180px 3px 0 0 rgba(255,255,255,.4),20px 30px 0 0 rgba(255,255,255,.25);}',
    // 循环流星划痕（用户指定保留；终端地规则例外）
    '.sm-ef-slider .sm-streak{position:absolute;top:9px;left:0;width:46px;height:2px;z-index:0;',
    'background:linear-gradient(90deg,transparent,#ffc371,#36c5f0,transparent);opacity:0;',
    'animation:sm-shoot 7s linear infinite;pointer-events:none;}',
    '@keyframes sm-shoot{0%{transform:translateX(-60px);opacity:0}5%{opacity:.85}45%{opacity:.6}',
    '60%{transform:translateX(240px);opacity:0}100%{transform:translateX(240px);opacity:0}}',
    // 眉标 + 数字（真实档位）
    '.sm-ef-slider .sm-eyebrow{position:relative;z-index:1;display:flex;flex-direction:column;line-height:1.25;}',
    '.sm-ef-slider .sm-eyebrow .sm-en{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ef-ink2);}',
    '.sm-ef-slider .sm-eyebrow .sm-zh{font-size:14px;font-weight:700;color:var(--ef-ink);}',
    '.sm-ef-slider .sm-num{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-end;line-height:1.15;}',
    '.sm-ef-slider .sm-num .sm-n{font-size:19px;font-weight:700;color:var(--ef-ink);}',
    '.sm-ef-slider .sm-num .sm-c{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ef-ink2);}',
    // 轨道：暗底像素分格 + 彩虹填充层（保留）+ 原生滑头（彩虹发光，保留）
    '.sm-ef-slider .sm-sliderwrap{position:relative;z-index:1;width:132px;height:12px;}',
    '.sm-ef-slider .sm-track{position:absolute;left:0;right:0;top:3px;height:6px;border-radius:0;',
    'background:repeating-linear-gradient(90deg,#2E2E2E 0 17px,rgba(0,0,0,.5) 17px 19px);}',
    '.sm-ef-slider .sm-fill{position:absolute;left:0;top:3px;height:6px;border-radius:0;',
    'width:var(--sm-fill,0%);background:var(--sm-rainbow);opacity:.85;',
    'transition:width .22s cubic-bezier(.7,0,.2,1);}',
    '.sm-ef-slider .sm-range{-webkit-appearance:none;appearance:none;position:relative;z-index:2;',
    'width:132px;height:12px;margin:0;background:transparent;outline:none;cursor:pointer;}',
    '.sm-ef-slider .sm-range::-webkit-slider-runnable-track{height:12px;background:transparent;}',
    '.sm-ef-slider .sm-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;',
    'width:11px;height:11px;margin-top:-1px;border-radius:0;background:var(--sm-rainbow);',
    'border:1px solid rgba(255,255,255,.75);',
    'box-shadow:0 0 8px rgba(54,197,240,.9),7px 0 0 -2px rgba(255,95,109,.6),',
    '14px 0 0 -4px rgba(255,195,113,.4),21px 0 0 -6px rgba(54,197,240,.25);}',
    '.sm-ef-slider .sm-range::-moz-range-track{height:12px;background:transparent;}',
    '.sm-ef-slider .sm-range::-moz-range-thumb{width:11px;height:11px;border-radius:0;',
    'background:var(--sm-rainbow);border:1px solid rgba(255,255,255,.75);',
    'box-shadow:0 0 8px rgba(54,197,240,.9);}',
    '.sm-ef-slider .sm-err{position:relative;z-index:1;font-size:11px;font-weight:600;color:#FFFA00;}',
    '@media (prefers-reduced-motion: reduce){.sm-ef-slider .sm-streak{animation:none;opacity:0;}',
    '.sm-ef-slider .sm-fill{transition:none;}}',
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
            all.map(function (o) { return { type: 'set', path: [o.key], value: o.value } }),
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

  // ================= 聊天区召回滑块（shell.overlay）：工业命令栏 + 彩虹流星 =================
  function createSlider(bridge, commit, t) {
    return function RecallSlider() {
      var state = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
      var local = React.useState(null)
      var err = React.useState('')
      var timer = React.useRef(null)
      var dragValue = local[0], setDrag = local[1]
      var errValue = err[0], setErr = err[1]

      React.useEffect(function () { ensureStyle('sm-ef-style', EF_CSS) }, [])

      if (state.status === 'unavailable') return null
      if (!state.enabled) return null

      function doCommit(v) {
        if (timer.current) { clearTimeout(timer.current); timer.current = null }
        var res = v === 0
          ? commit([{ key: 'recallEffort', value: 0 }, { key: 'recallEnabled', value: false }])
          : commit([{ key: 'recallEffort', value: v }])
        setErr(res || '')
      }
      function onChange(e) {
        var v = Number(e.target.value) || 0
        setDrag(v)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(function () { doCommit(v) }, 250)
      }

      var shown = dragValue === null ? state.effort : dragValue
      var pct = (shown / 6) * 100
      var pad = function (n) { return (n < 10 ? '0' : '') + n }
      // 关键视觉内联（13-gotchas §4：宿主可能清理/覆盖注入 style，内联优先级最高）。
      // 定位/布局/配色/token 内联承载，style 被清时 UI 降级而非错位/消失；
      // 仅伪元素（星点/thumb/划痕动画）留 style 注入（伪元素无法内联）。
      return h('div', { className: 'sm-ef sm-ef-slider', style: {
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        background: '#161616', border: '1px solid #353535', borderRadius: 0,
        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)',
        overflow: 'hidden',
        '--ef-ink': '#EDEDED', '--ef-ink2': '#A3A3A3', '--ef-rule': '#353535', '--ef-cut': '10px',
        '--sm-rainbow': RAINBOW, '--sm-fill': pct + '%',
      } },
        h('div', { className: 'sm-stars' }),
        h('div', { className: 'sm-streak' }),
        h('div', { className: 'sm-eyebrow' },
          h('span', { className: 'sm-en' }, '// RECALL'),
          h('span', { className: 'sm-zh' }, t('slider.title')),
        ),
        h('div', { className: 'sm-num' },
          h('span', { className: 'sm-n' }, 'No.' + pad(shown)),
          h('span', { className: 'sm-c' }, '/ 06'),
        ),
        h('div', { className: 'sm-sliderwrap' },
          h('div', { className: 'sm-track' }),
          h('div', { className: 'sm-fill' }),
          h('input', {
            className: 'sm-range', type: 'range', min: 0, max: 6, step: 1, value: shown,
            onChange: onChange,
          }),
        ),
        errValue ? h('span', { className: 'sm-err' }, errValue) : null,
      )
    }
  }

  // ================= 设置卡片（plugins.item）：终末地工业风 =================
  function createCard(bridge, commit, t) {
    return function RecallCard(props) {
      // 诊断（bug #8 定位，交接文档步骤 1）：组件真被调用 = 槽有消费者 = 渲染链通。
      try { console.log('[starmemory] DEBUG RecallCard rendered, view:', props && props.view) } catch (e) {}
      var view = props && props.view
      var state = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
      var err = React.useState('')
      var errValue = err[0], setErr = err[1]

      if (view === 'summary') {
        return h('span', { className: 'sm-ef sm-ef-eyebrow' },
          h('span', { className: 'sm-en' }, '// RECALL'),
          h('span', { className: 'sm-zh' }, state.enabled
            ? t('card.summaryOn', { level: t('effort.' + state.effort) })
            : t('card.summaryOff')),
        )
      }

      function run(ops) { setErr(commit(ops) || '') }
      function onToggle(next) { run([{ key: 'recallEnabled', value: !!next }]) }
      function onLevel(v) {
        if (v === 0) run([{ key: 'recallEffort', value: 0 }, { key: 'recallEnabled', value: false }])
        else run([{ key: 'recallEffort', value: v }, { key: 'recallEnabled', value: true }])
      }

      var disabled = state.status !== 'ready' || !state.writable
      var pad = function (n) { return (n < 10 ? '0' : '') + n }
      var btnRow = h('div', { className: 'sm-btns' },
        [0, 1, 2, 3, 4, 5, 6].map(function (i) {
          var active = state.enabled && state.effort === i
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
        display: 'flex', flexDirection: 'column', gap: 0, padding: '4px 0', maxWidth: 560,
      } },
        h('div', { className: 'sm-section' },
          h('div', { className: 'sm-eyebrow' },
            h('span', { className: 'sm-en' }, '// RECALL'),
            h('span', { className: 'sm-zh' }, t('card.controlTitle')),
          ),
          h('div', { className: 'sm-row' },
            Switch({ checked: state.enabled, onChange: onToggle, label: t('card.autoRecall'), disabled: disabled }),
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
          var scope = (sctx && sctx.configForms) ? sctx.configForms.get(NS) : null
          // v1.2.7：首次无配置时 namespace 未暴露 → scope 存在但 snapshot.status === 'unavailable'。
          // 卡片是首次配置的入口，必须无条件注册（unavailable 由组件内降级：卡片 disabled、滑块 return null）。
          if (!scope || typeof scope.getSnapshot !== 'function') {
            console.warn('[starmemory] configForms scope unavailable; card/slider show degraded state')
          }
          var bridge = createScopeBridge(scope)
          var commit = makeCommit(scope, t)

          try {
            ctx.slots.inject('shell.overlay', function () {
              return ctx.slots.register(
                { name: 'shell.overlay', id: 'starmemory-recall-slider', order: 100, label: function () { return t('slider.title') } },
                createSlider(bridge, commit, t),
              )
            })
            try { console.log('[starmemory] DEBUG registered slot shell.overlay') } catch (e) {}
          } catch (e) {
            console.warn('[starmemory] slider disabled:', e)
          }

          // 卡片无条件注册（不 gate 在 whileServed：首次配置时 namespace 未 served，gate 会挡掉注册）。
          try {
            ctx.slots.inject('plugins.item', function () {
              return ctx.slots.register(
                { name: 'plugins.item', id: PKG, order: 50, label: function () { return 'StarMemory' } },
                createCard(bridge, commit, t),
              )
            })
            try { console.log('[starmemory] DEBUG registered slot plugins.item') } catch (e) {}
          } catch (e) {
            console.warn('[starmemory] settings card disabled:', e)
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
