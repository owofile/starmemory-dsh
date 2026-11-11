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
// 结构：__ModuleLoader__.load 包裹 → factory(require) → inject ['slots','configForms']
//   → 注册两个 slot（各自独立 try/catch，白屏红线）：
//     - shell.overlay  聊天区召回滑块（fixed 右上角；recallEnabled=false → 消失）
//     - plugins.item   Plugins 页设置卡片（Switch + 0-6 档位按钮 + 占位子面板）
//   数据源：configForms.get('starmemory-dsh') scope —— 单一事实源（Config volatile 叶）。

window.__ModuleLoader__.load({ id: 'starmemory-dsh', factory: function (require) {
  'use strict'

  var React = require('react')
  var h = React.createElement
  var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
  var Switch = primitives.Switch

  var NS = 'starmemory-dsh'
  var PKG = 'starmemory-dsh'
  var EFFORT_LABELS = ['OFF', '极轻', '轻', '中', '较强', '强', '最强']

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
      var snap = scope.getSnapshot()
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
      if (typeof scope.subscribe === 'function') {
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
  function makeCommit(scope) {
    return function commit(ops) {
      var all = ops.slice()
      var hasFlag = all.some(function (o) { return o.key === 'recallPanelConfigured' })
      if (!hasFlag) all.push({ key: 'recallPanelConfigured', value: true })
      if (all.length > 1 && typeof scope.mutate === 'function') {
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
      if (typeof scope.set !== 'function') {
        var msg = 'scope.set unavailable'
        console.warn('[starmemory] ' + msg)
        return msg
      }
      for (var i = 0; i < all.length; i++) {
        try { scope.set(all[i].key, all[i].value) }
        catch (e) { console.warn('[starmemory] set failed:', e); return '写入失败' }
      }
      return null
    }
  }

  // ================= 聊天区召回滑块（shell.overlay）：工业命令栏 + 彩虹流星 =================
  function createSlider(bridge, commit) {
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
          h('span', { className: 'sm-zh' }, '召回'),
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
  function createCard(bridge, commit) {
    return function RecallCard(props) {
      var view = props && props.view
      var state = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
      var err = React.useState('')
      var errValue = err[0], setErr = err[1]

      if (view === 'summary') {
        return h('span', { className: 'sm-ef sm-ef-eyebrow' },
          h('span', { className: 'sm-en' }, '// RECALL'),
          h('span', { className: 'sm-zh' }, state.enabled ? '召回已开启 · ' + EFFORT_LABELS[state.effort] : '召回已关闭'),
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
        EFFORT_LABELS.map(function (label, i) {
          var active = state.enabled && state.effort === i
          return h('button', {
            key: i,
            className: 'sm-btn' + (active ? ' is-on' : ''),
            onClick: function () { onLevel(i) },
            disabled: disabled,
          },
            h('span', { className: 'sm-n' }, pad(i)),
            label)
        }))

      return h('div', { className: 'sm-ef sm-ef-card', style: {
        display: 'flex', flexDirection: 'column', gap: 0, padding: '4px 0', maxWidth: 560,
      } },
        h('div', { className: 'sm-section' },
          h('div', { className: 'sm-eyebrow' },
            h('span', { className: 'sm-en' }, '// RECALL'),
            h('span', { className: 'sm-zh' }, '召回控制'),
          ),
          h('div', { className: 'sm-row' },
            Switch({ checked: state.enabled, onChange: onToggle, label: '自动召回', disabled: disabled }),
            h('span', { className: 'sm-ctl-label' }, '自动召回'),
          ),
          h('div', null,
            h('div', { className: 'sm-note', style: { marginBottom: '8px' } }, '召回档位（0 = 关闭，档位越高注入越强）'),
            btnRow,
          ),
        ),
        h('div', { className: 'sm-section' },
          h('div', { className: 'sm-eyebrow' },
            h('span', { className: 'sm-en' }, '// OBSERVE'),
            h('span', { className: 'sm-zh' }, '观察面板'),
          ),
          h('div', { className: 'sm-placeholder' },
            '统计、归档状态与诊断摘要将在这里以只读形式展示。'),
        ),
        errValue ? h('div', { className: 'sm-section' }, h('span', { className: 'sm-err' }, errValue)) : null,
        !disabled && state.status === 'ready'
          ? h('div', { className: 'sm-section' }, h('div', { className: 'sm-note' }, '保存即生效；面板配置后档位以此为准'))
          : null,
      )
    }
  }

  // ================= apply：注册两个 slot（各自独立 try/catch） =================
  var module = { exports: {} }
  module.exports.name = 'starmemory-dsh-client'
  module.exports.inject = ['slots', 'configForms']
  module.exports.apply = function apply(ctx) {
    try {
      ensureStyle('sm-ef-style', EF_CSS)
      var scope = ctx.configForms.get(NS)
      if (!scope || typeof scope.getSnapshot !== 'function') {
        console.warn('[starmemory] configForms scope unavailable; client UI disabled')
        return
      }
      var bridge = createScopeBridge(scope)
      var commit = makeCommit(scope)

      try {
        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register(
            { name: 'shell.overlay', id: 'starmemory-recall-slider', order: 100, label: '召回滑块' },
            createSlider(bridge, commit),
          )
        })
      } catch (e) {
        console.warn('[starmemory] slider disabled:', e)
      }

      try {
        ctx.configForms.whileServed([NS], function () {
          ctx.slots.inject('plugins.item', function () {
            return ctx.slots.register(
              { name: 'plugins.item', id: PKG, order: 50, label: function () { return 'StarMemory' } },
              createCard(bridge, commit),
            )
          })
        })
      } catch (e) {
        console.warn('[starmemory] settings card disabled:', e)
      }
    } catch (e) {
      console.warn('[starmemory] client apply failed:', e)
    }
  }
  return module.exports
}})
