// StarMemory DSH client half —— 手写 CJS 单文件，无需构建步骤。
//
// 落地偏差说明（相对整体设计文档 §7）：
// - 不用 esbuild 多文件打包：单文件 + 手写 CJS 直接入库，消除 seed/banner/外部
//   require 重写等接缝，最大化稳定性与可调试性（client 插件报错即白屏，接缝越少越好）。
// - 档位控件用自绘按钮行（h('button')），不用 SegmentedControl：其 onChange 不回传
//   已选值、需管理 tablist 语义；Switch 用 primitives 实测组件。
// - 美化（v1.2.1）：聊天滑块 = 迷你星空 + 像素流星滑头（注入 <style>，伪元素/滑块
//   thumb 内联样式做不了）；设置卡片 = DSH alias token 规范（06-ui-style §2）。
//
// 结构：__ModuleLoader__.load 包裹 → factory(require) → inject ['slots','configForms']
//   → 注册两个 slot（各自独立 try/catch，白屏红线）：
//     - shell.overlay  聊天区召回滑块（fixed 右上角；recallEnabled=false → 消失）
//     - plugins.item   Plugins 页设置卡片（Switch + 0-6 档位按钮行 + 占位子面板）
//   数据源：configForms.get('starmemory-dsh') scope —— 单一事实源（Config volatile 叶）。
//   滑块与卡片不直接通信，都是同一 scope 的两个视图（写后宿主发 volatile-update）。

window.__ModuleLoader__.load({ id: 'starmemory-dsh', factory: function (require) {
  'use strict'

  var React = require('react')
  var h = React.createElement
  var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
  var Switch = primitives.Switch

  var NS = 'starmemory-dsh'
  var PKG = 'starmemory-dsh'
  var EFFORT_LABELS = ['OFF', '极轻', '轻', '中', '较强', '强', '最强']

  // ================= 美化样式：一次注入（id 幂等） =================
  // 聊天滑块：迷你星空 + 像素流星。深空底不随主题（星空widget独立成立），
  // 强调色走 alias token（深色自动适配）。卡片走 DSH alias token。
  var ACCENT = 'var(--dsw-alias-state-business-primary, #1d9bf0)'
  var SLIDER_CSS = [
    '.sm-recall-slider{position:fixed;top:16px;right:16px;z-index:9999;display:flex;align-items:center;gap:9px;',
    'padding:8px 12px;background:linear-gradient(135deg,#0b1026,#141b3a);border:1px solid #2a3358;',
    'border-radius:6px;box-shadow:0 0 0 1px rgba(29,155,240,.10),0 4px 18px rgba(0,0,0,.45);',
    'font-family:"Courier New",monospace;overflow:hidden;}',
    '.sm-recall-slider .sm-stars{position:absolute;inset:0;pointer-events:none;z-index:0;}',
    '.sm-recall-slider .sm-stars::before{content:"";position:absolute;width:2px;height:2px;background:#fff;',
    'box-shadow:12px 9px 0 0 #fff,34px 22px 0 0 rgba(255,255,255,.8),55px 6px 0 0 rgba(255,255,255,.5),',
    '78px 26px 0 0 #fff,100px 12px 0 0 rgba(255,255,255,.7),122px 30px 0 0 rgba(255,255,255,.6),',
    '148px 8px 0 0 #fff,168px 24px 0 0 rgba(255,255,255,.45),190px 14px 0 0 rgba(255,255,255,.8),',
    '210px 30px 0 0 #fff,60px 34px 0 0 rgba(255,255,255,.4),135px 2px 0 0 rgba(255,255,255,.5),',
    '88px 2px 0 0 rgba(255,255,255,.35),180px 3px 0 0 rgba(255,255,255,.5),20px 30px 0 0 rgba(255,255,255,.35);}',
    '.sm-recall-slider .sm-streak{position:absolute;top:8px;left:0;width:46px;height:2px;z-index:0;',
    'background:linear-gradient(90deg,transparent,' + ACCENT + ',transparent);opacity:0;',
    'animation:sm-shoot 7s linear infinite;pointer-events:none;}',
    '@keyframes sm-shoot{0%{transform:translateX(-60px);opacity:0}5%{opacity:.9}45%{opacity:.7}',
    '60%{transform:translateX(240px);opacity:0}100%{transform:translateX(240px);opacity:0}}',
    '.sm-recall-slider .sm-meteor{position:relative;z-index:1;width:8px;height:8px;border-radius:1px;',
    'background:' + ACCENT + ';box-shadow:0 0 6px ' + ACCENT + ',',
    '-6px 0 0 -1px color-mix(in srgb,' + ACCENT + ' 60%,transparent),',
    '-12px 0 0 -2px color-mix(in srgb,' + ACCENT + ' 30%,transparent);}',
    '.sm-recall-slider .sm-label{position:relative;z-index:1;font-size:12px;letter-spacing:.5px;',
    'color:#dfe6ff;white-space:nowrap;}',
    '.sm-recall-slider .sm-label .sm-lv{color:' + ACCENT + ';}',
    '.sm-recall-slider .sm-range{-webkit-appearance:none;appearance:none;position:relative;z-index:1;',
    'width:132px;height:12px;background:transparent;outline:none;cursor:pointer;}',
    '.sm-recall-slider .sm-range::-webkit-slider-runnable-track{height:6px;border-radius:2px;',
    'background:repeating-linear-gradient(90deg,transparent 0 17px,rgba(0,0,0,.45) 17px 19px),',
    'linear-gradient(90deg,' + ACCENT + ' 0,' + ACCENT + ' var(--sm-fill,0%),#1b2246 var(--sm-fill,0%));}',
    '.sm-recall-slider .sm-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;',
    'width:10px;height:10px;margin-top:-2px;border-radius:1px;background:#fff;border:1px solid ' + ACCENT + ';',
    'box-shadow:0 0 8px ' + ACCENT + ',7px 0 0 -2px color-mix(in srgb,' + ACCENT + ' 65%,transparent),',
    '14px 0 0 -4px color-mix(in srgb,' + ACCENT + ' 35%,transparent),',
    '21px 0 0 -6px color-mix(in srgb,' + ACCENT + ' 18%,transparent);}',
    '.sm-recall-slider .sm-range::-moz-range-track{height:6px;border-radius:2px;background:#1b2246;}',
    '.sm-recall-slider .sm-range::-moz-range-progress{height:6px;border-radius:2px;background:' + ACCENT + ';}',
    '.sm-recall-slider .sm-range::-moz-range-thumb{width:10px;height:10px;border-radius:1px;background:#fff;',
    'border:1px solid ' + ACCENT + ';box-shadow:0 0 8px ' + ACCENT + ';}',
    '.sm-recall-slider .sm-err{position:relative;z-index:1;font-size:11px;color:#f4212e;}',
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
  // useSyncExternalStore 要求内容未变时 getSnapshot 返回同一对象；否则无限重渲（#185）。
  // 模式：按 scope.getSnapshot() 的对象身份缓存派生状态（宿主每次变更替换快照对象）。
  // 订阅：优先 scope.subscribe（有则推模式）；无则 500ms 低频轮询兜底（同快照不触发重渲）。
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
  // 任何 client 写入都同时置 recallPanelConfigured=true → Config 成为持久权威。
  function makeCommit(scope) {
    return function commit(ops) {
      var all = ops.slice()
      var hasFlag = all.some(function (o) { return o.key === 'recallPanelConfigured' })
      if (!hasFlag) all.push({ key: 'recallPanelConfigured', value: true })
      // 多字段一次提交（如拖到 0 = 关），避免两次写入竞态
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
        catch (e) { console.warn('[starmemory] set failed:', e); return '写入失败：' + String(e) }
      }
      return null
    }
  }

  // ================= 聊天区召回滑块（shell.overlay）：迷你星空 + 像素流星 =================
  function createSlider(bridge, commit) {
    return function RecallSlider() {
      var state = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
      var local = React.useState(null)      // 拖动中的本地值（未提交前显示）
      var err = React.useState('')
      var timer = React.useRef(null)
      var dragValue = local[0], setDrag = local[1]
      var errValue = err[0], setErr = err[1]

      React.useEffect(function () { ensureStyle('sm-recall-style', SLIDER_CSS) }, [])

      if (state.status === 'unavailable') return null
      if (!state.enabled) return null       // 关闭即消失（含拖到 0 档）

      function doCommit(v) {
        if (timer.current) { clearTimeout(timer.current); timer.current = null }
        var res
        if (v === 0) {
          // 0 = OFF：一次提交关闭 + 归零（Config 成为权威）
          res = commit([{ key: 'recallEffort', value: 0 }, { key: 'recallEnabled', value: false }])
        } else {
          res = commit([{ key: 'recallEffort', value: v }])
        }
        setErr(res || '')
      }
      function onChange(e) {
        var v = Number(e.target.value) || 0
        setDrag(v)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(function () { doCommit(v) }, 250)  // 拖动节流
      }

      var shown = dragValue === null ? state.effort : dragValue
      var pct = (shown / 6) * 100
      return h('div', { className: 'sm-recall-slider', style: { '--sm-fill': pct + '%' } },
        h('div', { className: 'sm-stars' }),
        h('div', { className: 'sm-streak' }),
        h('div', { className: 'sm-meteor' }),
        h('span', { className: 'sm-label' }, '召回 ',
          h('span', { className: 'sm-lv' }, EFFORT_LABELS[shown] || shown)),
        h('input', {
          className: 'sm-range', type: 'range', min: 0, max: 6, step: 1, value: shown,
          onChange: onChange,
        }),
        errValue ? h('span', { className: 'sm-err' }, errValue) : null,
      )
    }
  }

  // ================= 设置卡片（plugins.item）：DSH alias token 规范 =================
  function createCard(bridge, commit) {
    return function RecallCard(props) {
      var view = props && props.view
      var state = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
      var err = React.useState('')
      var errValue = err[0], setErr = err[1]
      // 钩子（useSyncExternalStore / useState）在视图分支之前：两种视图共用同一钩子序列

      if (view === 'summary') {
        return h('span', null, state.enabled ? '召回已开启 · ' + (EFFORT_LABELS[state.effort] || state.effort) + ' 档' : '召回已关闭')
      }

      function run(ops) { setErr(commit(ops) || '') }
      function onToggle(next) { run([{ key: 'recallEnabled', value: !!next }]) }
      function onLevel(v) {
        if (v === 0) run([{ key: 'recallEffort', value: 0 }, { key: 'recallEnabled', value: false }])
        else run([{ key: 'recallEffort', value: v }, { key: 'recallEnabled', value: true }])
      }

      var disabled = state.status !== 'ready' || !state.writable
      var token = {
        primary: 'var(--dsw-alias-label-primary, #0f1115)',
        secondary: 'var(--dsw-alias-label-secondary, #61666b)',
        tertiary: 'var(--dsw-alias-label-tertiary, #81858c)',
        border: 'var(--dsw-alias-border-l4, #d9d9de)',
        layer2: 'var(--dsw-alias-bg-layer-2, #f5f5f7)',
        layer3: 'var(--dsw-alias-bg-layer-3, #ececef)',
        accent: ACCENT,
        error: 'var(--dsw-alias-state-error-primary, #f4212e)',
        hover: 'var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06))',
      }
      var btnRow = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
        EFFORT_LABELS.map(function (label, i) {
          var active = state.enabled && state.effort === i
          return h('button', {
            key: i,
            onClick: function () { onLevel(i) },
            disabled: disabled,
            style: {
              padding: '4px 12px', fontSize: '13px', lineHeight: '20px', borderRadius: '6px',
              cursor: 'pointer', border: '1px solid ' + (active ? token.accent : token.border),
              background: active ? token.accent : 'transparent',
              color: active ? 'var(--dsw-alias-label-primary-foreground, #fff)' : token.secondary,
            },
          }, label)
        }))

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 0', maxWidth: '560px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          Switch({ checked: state.enabled, onChange: onToggle, label: '自动召回', disabled: disabled }),
          h('span', { style: { fontSize: '14px', color: token.primary } }, '自动召回'),
        ),
        h('div', null,
          h('div', { style: { marginBottom: '8px', color: token.secondary, fontSize: '13px' } }, '召回档位（0 = 关闭）'),
          btnRow,
        ),
        // 其他展示子面板：本版占位（数据通道 v1.3，见整体设计文档 §6.2）
        h('div', {
          style: {
            borderTop: '1px solid ' + token.border, paddingTop: '12px',
            color: token.tertiary, fontSize: '13px',
          },
        }, '统计 / 诊断等只读展示：即将支持'),
        errValue ? h('div', { style: { color: token.error, fontSize: '12px' } }, errValue) : null,
        !disabled && state.status === 'ready'
          ? h('div', { style: { color: token.tertiary, fontSize: '12px' } }, '保存即生效；面板配置后档位以此为准')
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
      ensureStyle('sm-recall-style', SLIDER_CSS)   // 尽早注入，避免首帧闪烁
      var scope = ctx.configForms.get(NS)
      if (!scope || typeof scope.getSnapshot !== 'function') {
        console.warn('[starmemory] configForms scope unavailable; client UI disabled')
        return
      }
      var bridge = createScopeBridge(scope)
      var commit = makeCommit(scope)

      // 聊天区滑块：挂了一个不拖累设置卡片（白屏红线：各自独立）
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

      // 设置卡片：whileServed 把注册挂到该命名空间被服务的时段
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
