# StarMemory → DSH 插件移植执行文档（Agent 执行版）

> 读者：执行移植的 agent。本文自包含——不读 StarMemory 源码也能照做，但源码就地取材（路径见 §1.0）。
> 契约真源优先级：① **安装的 dsh 运行时**（与文档冲突时以它为准）② `dsh-skills/skills/make-dsh-plugin/references/`（本仓库已 clone，见 §1.0）③ 本文第 4 节的契约翻译。
> 证据基线：references 核于 dsh 0.2.0-rc.2 / 0.2.1-rc.5。**服务名、槽名、schema 子集规则跨 rc 可能变**，动手前先按 §11 的方法对安装版重核一遍再开工。
> 开始前必读：`references/13-gotchas.md`（实测坑）+ `references/04-plugin-contract.md`（entry 契约）。

---

## 0. 移植范围与核心原则

| 源内容 | 处置 | 理由 |
|---|---|---|
| 24 个记忆工具（index.js） | **移植**，分四批（P0-P3，见 §1.1） | DSH 工具是一等公民，参数 schema 一对一平移 |
| SQLite 归档层（external/sqlite-manager.js + 3 份脚本） | **移植**：换 `node:sqlite`，脚本逻辑内联进 lib | 零依赖；旧 .db 是标准 SQLite 文件，node:sqlite 可直读 |
| 数据文件（memory.json / fragments.json / associations_map.json / recall-runtime.json / fragment_archive.db） | **迁移到数据根**（§6），写一次性导入 | 用户数据不进插件安装目录（产品边界，references/15 §1） |
| OpenCode 钩子注入（session context hook 推 `[LONG-TERM MEMORY]` + 自动召回） | **放弃钩子** → Agent 主动调召回工具 + preset 人设指令（§8） | DSH 请求深冻结、无消息改写钩子；工具召回更可控 |
| tui.tsx（召回滑块 / 设置对话框 / /memory 命令 / 流星特效） | **Phase 1-4 不移植**，降级为结构化工具输出；client half UI 后置 Phase 5 | UI 是独立大工程；本版目标是无 UI 纯 cordis 包 |
| OpenCode 版 7 个 md 文档 | 不移植正文；新写 DSH 版 README（使用者向，templates/README.md 模板） | make-dsh-plugin 纪律 10 |

**心智模型切换（最重要的一句）**：忘掉"钩子旁路自动注入"。StarMemory 在 DSH 的形态是
**Agent 主动调用 `memory_fragment_search` / `memory_fragment_deep_search` 召回、调
`memory_fragment_add` 记录**，由 preset 的 instructions 告诉模型召回习惯。
`agent/pre-step` 瀑布**只允许**放"数据健康自检"（失败打日志，不阻断），绝不塞召回内容。

---

## 1. 源清单（移植的输入物）

### 1.0 源码与参考仓库位置

```
源插件（OpenCode V2）：  C:\Users\Lain\.config\opencode\plugins\opencode-memory\
  index.js               24 个工具定义（ctx.tool.transform 注册）
  tui.tsx                TUI（本版不移植）
  external\              sqlite-manager.js + fragment-compactor.js / fragment-restorer.js / fragment-deep-search.js
  manual.json            memory_manual 工具的说明书数据
  fragment-config.json   碎片整理配置
  README.md / ARCHITECTURE.md   架构说明（供理解，不照抄）
数据（旧位置）：          C:\Users\Lain\.config\opencode\ 下的 memory.json / fragments.json /
                         associations_map.json / recall-runtime.json / external\fragment_archive.db
契约真源（已 clone）：    D:\Github_Project\starmemory-dsh-port\dsh-skills\skills\make-dsh-plugin\
```

### 1.1 工具清单（24 个 + 召回 preview，批次映射）

| # | 工具 | 参数要点 | 批次 |
|---|---|---|---|
| 1 | memory | action(view/add/update/delete/search) + category/key/value/extra | P0 |
| 2 | memory_fragment_add | content（必填）+ associations/category/layer/source/source_type/memory_type/confidence/ttl_policy/expires_at（全可选） | P0 |
| 3 | memory_fragment_search | query（必填）+ temperature/limit/layer/weight_threshold/source_type/memory_type/consolidation/exclude_expired/min_activation/sort | P0 |
| 4 | memory_fragment_deep_search | query + limit（JSON+SQLite 双查，命中自动恢复） | P0 |
| 5 | memory_fragment_view | category?/layer? | P0 |
| 6 | memory_fragment_update | id（必填）+ 约 15 个可选更新字段 | P0 |
| 7 | memory_fragment_delete | id（必填） | P0 |
| 8 | memory_fragment_stats | 无参 | P1 |
| 9 | memory_fragment_compact | mode(gentle/auto/aggressive)——**长耗时，透传 exec.signal** | P1 |
| 10 | memory_fragment_dream | 无参（只标记，物理归档归 compact） | P1 |
| 11 | memory_fragment_archive_status | 无参 | P1 |
| 12 | memory_fragment_restore | action(id/query/list) + param?/limit? | P1 |
| 13 | memory_fragment_diagnosis | 无参（诊断报告 → payload 字符串） | P1 |
| 14 | memory_export | path? | P2 |
| 15 | memory_import | path（必填）+ mode(merge/replace) | P2 |
| 16 | memory_manual | keyword?（读随包 manual.json；查不到搜源码 README 补充） | P2 |
| 17-20 | synonym_map_view/add/delete/update | 中文-英文同义词映射的增删改查 | P2 |
| 21 | memory_sqlite | action(set/get/delete/list)——测试工具，最后移或直接砍掉 | P2 |
| 22 | memory_recall_set | effort(0-6，0=OFF) + enabled? | P3 |
| 23 | memory_recall_enable | enabled | P3 |
| 24 | memory_recall_status | 无参 | P3 |
| 25 | memory_recall_preview | query?/limit?（四道闸门 + Token 预算，**不写库**，只读预览） | P3 |

**P3 语义变化**：DSH 没有滑块，召回档位降级为普通工具读写 `<dataRoot>/recall-runtime.json`，
由 `memory_recall_preview` 消费；"自动召回"由 preset instructions 驱动（§8）。
manual.json 与 fragment-config.json 作为**随包只读资产**放进包内（不是用户数据，允许进包），
`files` 白名单要包含它们。

---

## 2. 形态决策（make-dsh-plugin Step 0）

**选：bundle 插件包**（npm 包 + Cordis entry + `dsh.bundle.patch` 自带组合 patch），Phase 1-4 不带 client half UI。

- 决策依据（v1.0.0 期间定案）：市场索引按 `dsh.bundle` 发现（references/12 §B），bundle 安装
  自动进入 profile bundles 列表（真一行安装，无需用户手写 insert 行）；纯 cordis 形态
  商店不可发现且要多一步手写 patch。bundle 化代价极小（一个 cordis.patch.yml + package.json
  一个字段）。
- client half（设置页/面板）仍后置 Phase 5，形态不变（bundle 本就支持 client half）。
- 安装通道：`dsh plugin --profile web add github:owofile/starmemory-dsh#v1.0.0`（bundle 自动挂载）。
- **版本与发布结构**：**仓库根 = npm 包根 = 市场发现入口**（generator 只认根 package.json
  声明的 bundle）；`vX.Y.Z/` 目录是发布快照（人类归档，不参与发现）；版本由根 package.json
  `version` + git tag（`vX.Y.Z`）管理，两者必须严格对应；`private: false`、无 prepare
  构建脚本（产物入库，零 allowBuilds 放行）。

**硬约束（来自 references，违反即失败）**：

1. **依赖三字段全空**：`dependencies` / `peerDependencies` / `devDependencies` 不声明任何
   `@deepseek-ai/*` 与 `cordis`——官方包是整条 peer 闭包，单独装必然 ERESOLVE
   （gotchas §1）；由挂载环境（profile 的 pnpm 闭包）注入。`node:sqlite` 是 Node 内置，不占依赖。
2. **命名导出**：entry 必须命名导出 `name` / `inject` / `apply`（`unwrapExports` 不认
   default 导出，gotchas 有实测）。
3. **本地开发 link 前置**：本地目录安装（树外路径）会让官方包解析不到、**整个 profile 起不来**
   （gotchas §6）——本地自测必须先把 SDK link 进包自己的 node_modules（配方见 §9.1）。
   面向用户的安装说明**只给 git 源**，不写裸 `add .`。
4. `dsh.skills` 三版均无消费方——本插件不带 skill 文件树，不声明该字段（若日后要随包分发 skill，
   走文件系统发现根复制/链接，见 references/10「随包分发 skill」）。
5. MCP 非 manifest 字段——不移植 MCP 相关内容（源插件没有，别手滑加）。

---

## 3. 目标仓库布局

```
starmemory-dsh/                    # 仓库根 = npm 包根 = 市场发现入口
├── package.json                   # name/version/main/exports/files/icon + dsh.bundle.patch；依赖三字段留空
├── cordis.patch.yml               # bundle 组合 patch：insert 自身（name 必须加引号）
├── icon.svg                       # 36x36 透明画布（§7）
├── locale/en.json  locale/zh.json # meta.title / meta.description（§7）
├── index.mjs                      # Cordis entry：name / inject / apply
├── lib/
│   ├── store.js                   # memory.json / fragments.json / associations_map.json 原子读写
│   ├── archive.js                 # node:sqlite 归档层（替代 sqlite-manager.js + 3 份脚本）
│   ├── recall.js                  # 召回引擎（四道闸门 / Token 预算 / 同义词扩展）
│   ├── tools/                     # 每工具一个文件，defineTool 定义（index.mjs 汇总注册）
│   ├── manual.json                # 随包只读资产（源 manual.json 直拷）
│   └── migrate.js                 # 一次性旧数据导入（§6.2）
├── scripts/                       # 开发自测脚本（schema 门禁等），不进 files
├── test/                          # node --test 单测，不进 files
├── v1.0.0/                        # 发布快照（VERSION.txt + INSTALL.md + 插件包快照，不参与发现）
├── docs/  png/  bugs/             # 与 opencode 版仓库同架构
└── README.md                      # 使用者向（Phase 4 写，<200 行，无 emoji）
```

> 版本发布方式：更新根 package.json 的 version → 快照到 vX.Y.Z/ → 打 vX.Y.Z git tag（tag 与根包版本严格对应）。

entry 骨架：

```js
// index.mjs
export const name = 'starmemory'
export const inject = []   // 只用自有能力则空；用到 ctx 服务时逐个声明（严格注入，见 §11.2）

export async function apply(ctx) {
  // 数据根 + SQLite 连接（ctx.effect 生命周期，见 §5）
  // ctx.tools.register(defineTool({...})) x N —— 注册本身是 effect 式，卸载自动注销
}
```

---

## 4. defineTool 契约翻译规则（逐条照做）

### 4.0 三个自检问题（动手前对安装版运行时核实，方法见 §11.0）

- `defineTool` 来自 `@deepseek-ai/dsh-tools`，schema 子集校验函数（references 称
  `assertSupportedJsonSchema`）在本基线接受的类型集合是哪七种？
- `parameters` 的形状是否仍是「属性名 → 值 schema」的普通对象（gotchas §14）？
- `output.schema` 子集校验的具体规则（本基线是否仍禁 `{type:'json'}` / 数组 required / required+oneOf 并列）？

任何一条与本文不符 → **以安装版为准**，把差异写回本文再继续。

### 4.1 注册骨架

```js
import { defineTool } from '@deepseek-ai/dsh-tools'   // 或从 ctx 传入的 SDK 入口（按安装版实际导出核）

ctx.tools.register(defineTool({
  name: 'memory_fragment_add',
  description: '...（照抄 OpenCode 版 description，已打磨过触发语义）',
  parameters: { /* 属性名 → 值 schema 的普通对象，见 4.2 */ },
  output: { schema: { /* 见 4.3 */ }, render: (_args, value) => [...] },
  async execute(args, exec) { /* 见 4.4 */ },
}))
```

每个工具一个 `defineTool`，逐个注册、**注册完立刻验证再写下一个**（§4.5）。

### 4.2 `parameters`（模型入参）——从 OpenCode `input` schema 平移

**形状铁律（gotchas §14）**：`parameters` 是「属性名 → 值 schema」的**普通对象**，
不是 schemastery 对象、不是 `{ type:'object', properties:{...} }` 整体包装。
传错形状的症状：`JsonSchemaError: parameters must be an object of value schemas`，
**整个插件条目不激活**（boot 日志一行 did not activate）。

| OpenCode 写法（index.js 现状） | DSH 写法 | 注意 |
|---|---|---|
| `enumSchema(['a','b'])` | `{ type:'string', enum:['a','b'] }` | 枚举照抄 |
| `stringSchema()` 可选 | `{ type:'string' }` | `required: true` 是**布尔**，写在字段 schema 里 |
| `objectSchema(props, ['action'])` | 逐字段展开；必填字段加 `required: true` | **禁止**数组形式 `required:['a','b']` |
| 嵌套对象 | `{ type:'object', additionalProperties: true\|false, properties:{...} }` | **additionalProperties 必须显式写**，漏了注册即失败 |
| 灵活 metadata | `{ type:'json' }` | **parameters 里可用 json**（output 里禁用，见 4.3） |
| 联合类型 | `oneOf` | **不能与 `required` 并列**在同一节点 |
| 无参 | `{}` | 空对象即可 |

`description` 写给模型看（决定调用时机），照抄 OpenCode 版；参数的 description 同理补全。

### 4.3 `output.schema`（返回值契约）——最容易翻车，三条硬禁令

1. **禁 `{ type:'json' }`**：output 只允许 string / number / integer / boolean / null / object / array
   七种 → 用了就注册即抛 `JsonSchemaError`，**工具静默缺席**（boot 可能还不响亮，gotchas §5）。
2. **禁数组形式 `required`**（如 `required:['field']`）。
3. **禁 `required` 与 `oneOf` 并列**出现在同一 schema 节点。

正确姿势：**所有工具统一返回一个对象**，固定字段单独建列，不定结构的数据一律包成
`payload: string`（JSON.stringify 后的字符串，最稳，不会被子集校验拒绝）：

```js
output: {
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      status:  { type: 'string', required: true },   // 'ok' | 'empty' | ...
      count:   { type: 'integer' },                  // 固定字段才建列
      payload: { type: 'string' },                   // 不定结构的数据序列化放这
    },
  },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}
```

> 不要硬写深层 schema 去描述 memory.json 整棵树或诊断报告——子集校验会拒绝，且返回值漂移
> 一格就报错。记忆正文、统计树、碎片列表全走 `payload`。

### 4.4 `execute` 四条硬规则

| 规则 | StarMemory 适配 |
|---|---|
| 只返回一个 canonical 值（= output.schema 声明的那个 JSON 对象），**不返回内容块** | 现有 `textResult(JSON.stringify(...))` 全改结构化对象；展示交给 render |
| 抛异常 = isError | 基础设施故障（SQLite 打不开、JSON 解析失败）→ `throw`；业务性"非理想但成功"（召回结果为空）→ `{ status:'empty', ... }` |
| 遵守 `exec.signal` | compact / dream / deep_search / migrate 是长耗时步骤，把 signal 透传给文件操作与内部循环 |
| `args` 只读 | 注册表冻结 arguments；execute 内要改先浅拷贝，绝不原地改 |

### 4.5 注册后自检门禁（每工具立刻做，不攒批）

1. 注册前静态检查 output.schema：无 `{type:'json'}` / 无数组 required / 无 required+oneOf 并列 / 嵌套对象都带 additionalProperties。
2. 用一个测试调用验证「实际返回值的键集合 ⊆ schema 声明的键集合」（防止返回漂移）。
3. 注册后**立刻看实例日志**：无 `JsonSchemaError`、无 `did not activate`，且工具在会话里真调得到。
4. 任何一条不过 → 停下修，不继续写下一个工具。

---

## 5. 生命周期：SQLite 连接必须用 ctx.effect

```js
import { DatabaseSync } from 'node:sqlite'

export function apply(ctx) {
  const dataRoot = resolveDataRoot()   // §6.1
  ctx.effect(() => {
    const db = new DatabaseSync(path.join(dataRoot, 'archive.db'))
    db.exec(`CREATE TABLE IF NOT EXISTS ...`)   // 建表/索引全部幂等
    return () => { try { db.close() } catch {} }   // disposer：卸载自动调用，绝不手动调
  })
}
```

- 多个清理步骤要串行（如"先 flush 再 close"）→ 放进**同一个** effect 的闭包；多个 effect 的
  disposer **并发执行、顺序不保证**。
- 工具注册（`ctx.tools.register`）与事件监听（`ctx.on`）本身就是 effect 式，卸载自动撤销，不用包。
- **openCode 版三份脚本（fragment-compactor / fragment-restorer / fragment-deep-search）**
  是纯逻辑脚本，直译成 lib 模块**内联**，不再 spawn 子进程；DB 句柄从 archive.js 参数传入，
  全插件共用一个连接，不各自开。
- `node:sqlite` 需较新 Node（22+，experimental 阶段 API 名为 `DatabaseSync`）——开工前对
  目标运行时的 Node 版本核实一次；不行再议备选（如继续 sql.js 打包），**先问用户**。

---

## 6. 数据根与旧数据迁移

### 6.1 数据根规则（产品边界纪律：用户数据不进插件安装目录）

```
dataRoot = process.env.STARMEMORY_DATA_DIR
        ?? path.join(os.homedir(), '.starmemory')     // 缺省：家目录，跨 profile 持久
```

- **禁止**写在插件包目录（npm 重装即丢数据）——references/15 §1 的反面教材。
- 工具返回值只给**内容**（记忆正文/统计/id），**不给文件路径**；报错只说**下一步动作**
  （"记忆库为空，先调 memory_fragment_add 记录"），不点名文件（references/15 §2）。
- Phase 5 做设置页时把 dataRoot 升级为 Config 字段（volatile 叶引用）；本版先读环境变量。

### 6.2 一次性迁移（独立脚本 scripts/migrate.mjs，不进 files）

输入：旧位置三份 JSON + `external/fragment_archive.db`（sql.js 写的标准 SQLite，node:sqlite 可直读）。
步骤：

1. 读旧 JSON → 字段映射不变（schema 本来就是 JSON 自描述）。
2. 原子写到 `<dataRoot>/`（先写临时文件再 rename，防半写）。
3. 校验条数一致（逐文件对比源/目标条数，.db 对比归档表行数）。
4. 输出迁移报告（每文件条数、.db 行数、跳过项），**报告交用户确认**后才继续 Phase 2 后半。

在沙箱/隔离实例里跑一遍；**不删旧数据**（旧位置原样保留，OpenCode 那套继续可用）。

---

## 7. manifest / icon / locale（Step 2 / 2b / 4 摘要）

`package.json` 关键项：

```jsonc
{
  "name": "starmemory-dsh",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.mjs",
  "exports": { ".": "./index.mjs", "./package.json": "./package.json", "./locale/*.json": "./locale/*.json" },
  "files": [ "index.mjs", "lib", "icon.svg", "locale" ],
  "icon": "./icon.svg",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
  // dependencies / peerDependencies / devDependencies 三处全空（§2 硬约束 1）
}
```

- cordis.patch.yml（bundle 组合 patch，随包分发）：
  ```yaml
  - insert:
      - id: starmemory-dsh
        name: 'starmemory-dsh'   # name 必须加引号（YAML 保留字符）；文件不能为空，暂无其他行写 []
  ```

- **icon**：顶层 `icon` 字段（不是 `dsh.icon`）；36x36 透明画布、显式填色（不依赖宿主
  currentColor）、无字体字形/外链/脚本、≤256KiB、realpath 必须在包目录内。画完**实际查看
  渲染图**（Plugins 页真实尺寸 + 深/浅主题）才算完成；无浏览器时明确写"视觉验收未完成"，
  请用户看图确认（references/10）。
- **locale**：`en.json` / `zh.json` 各含 `meta.title` / `meta.description`；**新增键必须
  中英同时补**（缺键 `t()` 回落成键本身，gotchas §17）。
- `files` 白名单要含 icon / locale / lib（含 manual.json 资产）。
- bundle 形态已声明 `dsh.bundle.patch`（安装自动挂载）；patch 覆盖是**整行替换**不是深合并；
  `config.id` 发布后不改。

---

## 8. 召回策略（钩子 → 工具 + 人设）

| OpenCode 机制 | DSH 移植 |
|---|---|
| `ctx.session.hook("context")` 注入 `[LONG-TERM MEMORY]` 系统段 | **放弃**。改为 preset instructions 一段话（模板如下，给用户 patch 模板由用户贴进自己的 preset） |
| 自动召回（recall-runtime 档位 + 滑块） | 降级为 P3 工具：档位写 `<dataRoot>/recall-runtime.json`，由 `memory_recall_preview` 消费 |
| `agent/pre-step` 瀑布 | **仅**放"数据健康自检"（DB 可打开、fragments.json 可解析）；失败打日志**不阻断**；**必须调 next() 放行**；绝不塞召回内容、不改消息数组（请求深冻结） |

preset instructions 模板（给用户）：

> 本 Agent 配有分层记忆（StarMemory 插件）。会话开始或遇到用户偏好/项目背景类问题时，
> 先调 `memory_fragment_search`（查不到再 `memory_fragment_deep_search` 深查归档）；
> 记录用户新偏好/习惯/项目背景时调 `memory_fragment_add`；管理规则请调 `memory_manual`。

放置判据（references/02 §2.6）：工具注册表在 **Host 层**（profile patch 的 insert 行），
所有 Agent 可用；召回**习惯**属于 prompt 段，用户要固化就写进 preset 行的 persona config。
本插件不自带 preset 行（不自建"模式"），Phase 4 给出用户可选的 patch 模板即可。

---

## 9. 安装与验证纪律（references/10，硬规矩）

### 9.0 開工前对安装版重核（§4.0 的三个问题 + 服务名）

```sh
# 服务名/schema 规则以安装的 dsh 为准（gotchas §7/§9：跨 rc 会漂移，别照抄笔记）
grep -rn "defineTool" "$(dirname "$(readlink -f "$(command -v dsh)")")/../node_modules/@deepseek-ai"/*/lib/*.js | head
```

### 9.1 本地开发实例（标准动作）

```sh
# 1) 私有 home：建一次复用，绝不指向 ~/.dsh；脚本结构性拒绝 DSH_HOME==~/.dsh
export DSH_HOME="$HOME/.dsh-starmemory"; mkdir -p "$DSH_HOME"     # Windows 用对应路径

# 2) 装正在开发的包（本地目录走 link）——前置：SDK link 进包自己的 node_modules
DSH_PKG="$(dirname "$(dirname "$(readlink -f "$(command -v dsh)")")")"
mkdir -p node_modules
ln -sfn "$DSH_PKG/node_modules/@deepseek-ai" node_modules/@deepseek-ai
ln -sfn "$DSH_PKG/node_modules/@deepseek-ai/cordis" node_modules/cordis
dsh plugin --profile web add /abs/path/to/starmemory-dsh

# 3) bundle 形态自带组合 patch（cordis.patch.yml insert 自身），add 后自动进 bundles 列表，
#    无需手写 insert 行；本地目录安装仅用于开发自测（SDK link 前置，见上）

# 4) 端口：第一次挑（避开 3080），存进 $DSH_HOME/web-port，此后固定复用，被占不悄悄换
nohup dsh web --port "$PORT" > /tmp/dsh-dev-starmemory.log 2>&1 &
# URL 里的 token 每次启动重新生成——每次从日志取当次 URL 交用户
```

要点（每条都是实测纪律）：

- **进程独立 / home 持久私有 / 端口固定**三不变量；用户正在测时**不重启不换实例**。
- 本地 link 漏 SDK 的症状：实例照常起、URL 照常开、**插件功能全消失**，日志只有
  `Cannot find package 'cordis'` + `1 entry did not activate`。
- **Windows 注意**：`dsh plugin` 经 cmd.exe 转发，git 源语法里的 `&` 会被拆开——
  面向用户的安装说明写**不带 `&`** 的 `github:owner/repo#path:/<子目录>` 形式。

### 9.2 三条硬规矩（顺序照做）

1. **负控先行**：装一份故意弄坏的副本（output.schema 写 `{type:'json'}`，或删掉 inject），
   确认日志**响亮报错**；负控响过之后，"干净日志"才算证据。
2. **boot 干净 ≠ 功能可用**：依赖解析失败、inject 写错 boot 期看不见（惰性读取）——
   每个工具**真调一次**（写入 → 召回 → 归档全链路），不是只看首页。
3. **mock ctx 单测不能替代真实装载**：单测证明逻辑对，真实 profile 启动证明装得上、起得来——两者都要。

### 9.3 交接前自检

- 启动日志无 `failed to import` / `did not activate`；Plugins 页能看到本插件；
- 挂的是正在开发的这份源码（readlink 指向开发目录）；
- 真调过一次工具；端口和上次一样；
- 交用户时给全：URL（含 token）、**这是隔离实例**、要测的 3-5 个点、怎么停。

---

## 10. Phase 执行清单（顺序照做，每步过检查点再前进）

**Phase 0 预检**
- [ ] 确认目标机器 dsh 已装、`dsh --version` 记录基线
- [ ] §4.0 三个契约问题对安装版核实；§9.0 服务名重核；结论写回本文
- [ ] 确认 Node 版本 ≥ node:sqlite 要求（不行先停下问用户）

**Phase 1 最小可注册**
- [ ] 骨架：package.json（依赖三空）+ index.mjs（name/inject=[]/apply 命名导出）+ icon.svg + locale 两份
- [ ] 注册 `memory_ping`：parameters `{}`，output `{type:'object',additionalProperties:false,properties:{status:{type:'string',required:true}}}`
- [ ] dev 实例起（§9.1）→ Agent 真调 memory_ping 返回 OK
- [ ] 负控副本（schema 故意写坏）验证日志报错路径响亮

**Phase 2 数据层 + P0 工具**
- [ ] lib/store.js（三份 JSON 原子读写）+ lib/archive.js（node:sqlite，effect 包裹）
- [ ] §6.2 迁移跑通，报告交用户确认
- [ ] P0 七个工具（清单 §1.1 #1-7）**逐个**注册 + §4.5 门禁 + 真调
- [ ] 全链路真调：add → search → deep_search（跨归档自动恢复）→ update → delete

**Phase 3 P1/P2 工具**
- [ ] P1 六个（stats / compact（透传 exec.signal）/ dream / archive_status / restore / diagnosis）
- [ ] P2 六个（export / import / manual / synonym_map_view/add/delete/update；sqlite 测试工具放最后或砍）
- [ ] 每个注册后看日志 + 真调，不攒批

**Phase 4 召回 + 收尾**
- [ ] P3 四个召回工具（set / enable / status / preview）
- [ ] preset instructions 模板写入 README（§8），交用户自行贴入 preset
- [ ] README（使用者向：动机 / 安装（**只给 git 源写法**）/ 用起来 / 能力面表 / 已知限制 / 兼容性 / 插件管理，<200 行，无 emoji）
- [ ] make-dsh-plugin Step 5b 交付检查清单逐项过；图标视觉验收（§7）

**Phase 5（可选，后置，另行开工）**
- [ ] 升级 bundle：加 `dsh.bundle.patch`（cordis.patch.yml insert 自身），写 profile 层安装文档
- [ ] 设置页：fragment-config / recall 档位 → Config schema + volatile 叶引用
- [ ] client half 面板（记忆统计页；遵守 references/06，不自带主题、不重复造控件）
- [ ] TUI 语义映射：召回滑块 → 设置页档位；/memory 命令 → 面板页签或命令行 label

---

## 11. 排障表

| 症状 | 原因 | 处置 |
|---|---|---|
| 工具静默缺席，boot 无异常 | output.schema 用了 `{type:'json'}` / required 数组 / required+oneOf 并列 → 注册即抛 JsonSchemaError | 修 schema；注册处立刻看日志（gotchas §5） |
| 整个条目不激活，boot 一行 `JsonSchemaError: parameters must be an object of value schemas` | parameters 传成了 `{type:'object',properties:{...}}` 或 schemastery 对象 | parameters 改回「属性名 → 值 schema」普通对象（gotchas §14） |
| `cannot get property without inject` | 用了 ctx 服务没在 inject 声明（严格注入） | 补 inject；官方包依赖三字段留空与此无关（gotchas §5） |
| 条目永久 pending，boot 只有 `1 entry did not activate` | inject 服务名写错（跨 rc 会改名且不报错） | 对照**安装版** grep 服务名重核（gotchas §7/§8） |
| `plugin tree failed to load` | ① exports["."]/main 指错 ② inject 缺 ③ 依赖解析失败 ④ insert 行 name 没加引号 | 按 gotchas §3 顺序排查 |
| 整个 profile 起不来，`Cannot find package '@deepseek-ai/dsh-tools'` | 本地目录安装且包真实路径在 profile 树外 | 先把 SDK link 进包自己的 node_modules（§9.1）；面向用户只给 git 源（gotchas §6） |
| 改了源码不生效 | 该环境无源码 watcher；"重装同版本"不是热更新 | 重启 dev 实例兜底；先查 HMR 是否启用（gotchas §2） |
| Agent 调不到工具但宿主可见 | 工具没进该 preset 的工具范围 | 确认注册在 Host 行（profile patch insert）；preset 工具行问题按 references/02 §2 核 |
| SQLite 打不开 | Node 版本不支持 node:sqlite；或库文件被其他进程占用 | 核 Node 版本；effect disposer 确保 close；同库单连接 |
| schema 校验拒绝嵌套对象 | 缺 `additionalProperties` | 显式补 `true` 或 `false` |
| 覆盖配置后原键丢失 | patch 覆盖是整行替换不是深合并 | 覆盖别人的行必须重述它需要的每个键（gotchas §1b，Phase 5 相关） |

---

## 12. 给执行 agent 的三句话

1. **先核版本再动手**：契约冲突以安装的 dsh 运行时为准，把差异写回本文；服务名跨 rc 会漂移。
2. **每注册一个工具立刻验证一次**（schema 门禁 + 日志 + 真调），不攒批；负控先行，boot 干净不算数。
3. **数据不进包目录、返回值不给路径、报错只说下一步动作**——这是产品边界，不是风格偏好。
