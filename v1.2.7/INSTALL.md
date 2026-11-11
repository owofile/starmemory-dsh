# StarMemory DSH Plugin v1.2.7 安装指南

## 版本说明

v1.2.7 修复**首次安装无配置时设置面板整个不出现**的问题（v1.2.6 实测确诊，测试机主人给出完整证据链）。

### 根因
首次安装没有 `settings.yaml` → configForms 命名空间未暴露 → `configForms.get()` 返回的 scope 存在，但 **snapshot.status === 'unavailable'**（不是返回 null）。而 client apply 的旧逻辑：
```js
var scope = ctx.configForms.get(NS)
if (!scope || typeof scope.getSnapshot !== 'function') {
  return   // 把整个 client UI（含设置卡片）都挡掉了
}
```
把 `unavailable` 态误当「拿不到 scope」处理 → 设置卡片根本没注册 → 面板空白。此外卡片注册还被 `ctx.configForms.whileServed([NS], ...)` 门控（namespace 未 served 时不触发），双重挡住。

### 修复（v1.2.7）
1. **移除早期 return**：scope 不可用只 warn，不 return。
2. **卡片无条件注册**：`plugins.item` slot 不再 gate 在 `whileServed`（首次配置时 namespace 未 served，gate 会挡掉注册）。
3. **bridge/commit 容忍 null/不可用 scope**：`createScopeBridge` 的 `getSnapshot`/`subscribe` 加 `scope &&` 守卫 + try/catch（null scope → status 'unavailable'）；`makeCommit` 的 `mutate`/`set` 加 `scope &&` 守卫。
4. **组件内已具备降级**（无需改）：滑块 `status==='unavailable'` → `return null`（不误显示）；卡片 `disabled = state.status !== 'ready'` → 显示禁用/占位态，用户至少能看到面板存在。

### 与 v1.2.6 的差异
- client apply 不再因 configForms 可用性整体 return；卡片/滑块无条件注册。
- bridge/commit 容错 null/不可用 scope。
- 结构、数据通道、权威规则、26 工具、视觉、i18n、打包配置（files/inject）全部不变。

## 安装步骤（必须正规安装）

### 1. 安装插件（git 源，一行，bundle 自动挂载，profile 闭包自动注入 SDK）
```sh
dsh plugin --profile web add github:owofile/starmemory-dsh#v1.2.7
```

> 不要用本地 link / 手动拷目录安装：会绕过 plugin_manager，依赖三字段留空导致 `schemastery` 找不到（v1.2.6 已确认走正规装）。

### 2. 验证安装
```sh
dsh --profile web --dump-config-schema | grep -A3 '"id": "starmemory-dsh"'
# 期望 status: "schema"（设置命名空间存在）
```

### 3. 数据位置
用户数据在 `~/.starmemory/`（不进插件安装目录，重装/升级不影响）。

详细设计说明与验收清单见 `docs/v1.2.0-settings-panel.md`（§7 视觉、§9 已知取舍）与 `docs/verify-v1.2.3.md`（v1.2.5 版，验收点不变；另测 i18n B3）。
