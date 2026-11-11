// 本机静态 schema 门禁（本机无 dsh，把"注册即抛 JsonSchemaError"这类问题拦在本机）。
// 实现 PORT.md §4.3 三禁令 + §4.2 parameters 形状铁律 + 返回值键集合 ⊆ schema 键集合。
// 用法：node scripts/check-schema.mjs（扫描 lib/tools/*.js，有违规 exit 1）
//      也可 import { validateTool } 供 node --test 复用。

const OUTPUT_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null', 'object', 'array'])

function walk(node, path, errors, { allowJson }) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    errors.push(`${path}: schema 节点必须是对象，得到 ${Array.isArray(node) ? 'array' : typeof node}`)
    return
  }
  // 禁令 1：output 禁 {type:'json'}（parameters 允许）
  if (node.type === 'json') {
    if (!allowJson) errors.push(`${path}: 禁令 1 —— output.schema 禁 {type:'json'}（只允许 7 种）`)
  } else if (node.type !== undefined && !OUTPUT_TYPES.has(node.type) && node.enum === undefined && node.const === undefined && node.oneOf === undefined) {
    errors.push(`${path}: 非法 type '${node.type}'（允许 7 种或 enum/const/oneOf）`)
  }
  // 禁令 2：required 必须是布尔，不能是数组
  if ('required' in node) {
    if (Array.isArray(node.required)) errors.push(`${path}: 禁令 2 —— required 是数组形式（必须为布尔，写在字段 schema 里）`)
    else if (typeof node.required !== 'boolean') errors.push(`${path}: required 类型 ${typeof node.required}（必须为布尔）`)
  }
  // 禁令 3：required 与 oneOf 不能并列
  if ('required' in node && node.oneOf !== undefined) {
    errors.push(`${path}: 禁令 3 —— required 与 oneOf 并列`)
  }
  // 嵌套对象必须显式 additionalProperties
  if (node.type === 'object' && node.properties !== undefined && node.additionalProperties === undefined) {
    errors.push(`${path}: type:object 带 properties 但缺 additionalProperties（必须显式 true|false）`)
  }
  if (node.properties && typeof node.properties === 'object') {
    for (const [k, v] of Object.entries(node.properties)) walk(v, `${path}.properties.${k}`, errors, { allowJson })
  }
  if (node.items) walk(node.items, `${path}.items`, errors, { allowJson })
  if (node.oneOf) {
    if (!Array.isArray(node.oneOf)) errors.push(`${path}: oneOf 必须是数组`)
    else node.oneOf.forEach((b, i) => walk(b, `${path}.oneOf[${i}]`, errors, { allowJson }))
  }
}

export function validateTool(tool) {
  const errors = []
  if (!tool || typeof tool !== 'object') return [`tool: 描述符必须是对象`]
  if (typeof tool.name !== 'string' || !tool.name) errors.push(`name: 缺失或非字符串`)
  if (typeof tool.description !== 'string' || !tool.description) errors.push(`${tool.name}: description 缺失（发给模型的 Prompt 的一部分，必须写）`)
  if (typeof tool.execute !== 'function') errors.push(`${tool.name}: execute 缺失或非函数`)

  // parameters：属性名 → 值 schema 的普通对象（gotchas §14：传整体包装整个条目不激活）
  if (tool.parameters === undefined || tool.parameters === null) {
    errors.push(`${tool.name}: parameters 缺失（无参写 {}）`)
  } else if (typeof tool.parameters !== 'object' || Array.isArray(tool.parameters)) {
    errors.push(`${tool.name}: parameters 必须是普通对象（属性名 → 值 schema），得到 ${Array.isArray(tool.parameters) ? 'array' : typeof tool.parameters}`)
  } else {
    if (tool.parameters.type !== undefined || tool.parameters.properties !== undefined) {
      errors.push(`${tool.name}: parameters 形状可疑 —— 含 type/properties 顶层键，疑似整体包装（应为 {参数名: 值schema}）`)
    }
    for (const [k, v] of Object.entries(tool.parameters)) {
      walk(v, `parameters.${k}`, errors, { allowJson: true })
    }
  }

  // output.schema：三禁令严格版（allowJson=false）
  if (tool.output && typeof tool.output === 'object') {
    walk(tool.output.schema, 'output.schema', errors, { allowJson: false })
    if (typeof tool.output.render !== 'function') errors.push(`${tool.name}: output.render 缺失（展示层）`)

    // 返回值键集合 ⊆ schema 键集合（无参工具可真调一次）
    const props = tool.output.schema && tool.output.schema.properties
    if (props && tool.parameters && Object.keys(tool.parameters).length === 0 && typeof tool.execute === 'function') {
      try {
        const ret = tool.execute({}, {})
        const check = (r) => {
          if (r && typeof r.then === 'function') { r.then(check).catch(() => {}); return }
          if (r && typeof r === 'object') {
            for (const k of Object.keys(r)) {
              if (!(k in props)) errors.push(`${tool.name}: 返回值键 '${k}' 不在 output.schema.properties 中（返回漂移）`)
            }
          }
        }
        check(ret)
      } catch (e) {
        errors.push(`${tool.name}: 无参真调 execute 失败：${e.message}`)
      }
    }
  } else {
    errors.push(`${tool.name}: output 缺失（必须声明 schema + render）`)
  }
  return errors
}

// CLI 入口：扫描 lib/tools/*.js（导出为描述符对象或工厂函数两种都支持）
if (process.argv[1] && process.argv[1].endsWith('check-schema.mjs')) {
  const { readdirSync } = await import('node:fs')
  const path = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const toolsDir = path.join(path.dirname(process.argv[1]), '..', 'lib', 'tools')
  let bad = 0
  for (const f of readdirSync(toolsDir).filter((f) => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(path.join(toolsDir, f)).href)
    for (const [k, v] of Object.entries(mod)) {
      // 工厂函数：传空依赖拿描述符（仅校验 schema 形状，不真调）
      let tool = v
      try { if (typeof v === 'function') tool = v({ store: null, getArchive: () => null }) } catch (e) {
        console.error(`[FAIL] ${f} # ${k}: 工厂构造失败 ${e.message}`); bad++; continue
      }
      if (tool && typeof tool === 'object' && tool.name && tool.execute) {
        const errs = validateTool(tool)
        if (errs.length) { bad++; console.error(`[FAIL] ${f} # ${k}`); for (const e of errs) console.error(`  - ${e}`) }
        else console.log(`[OK]   ${f} # ${k} (${tool.name})`)
      }
    }
  }
  process.exit(bad ? 1 : 0)
}
