# context-distiller 升级为 bundle-client：加设置面板 UI

## Context

当前插件是 `bundle` 纯后端形态，配置只能改 YAML，用户在 DSH Web 设置页看不到任何入口。
用户需要：在设置页有面板可配置压缩模型（provider/model/开关），在会话窗口能触发压缩。
本次升级把插件从 `bundle` → `bundle-client`，加浏览器设置面板 + 运行时配置读写路由。
同时需把 `@deepseek-ai/dsh-compaction-basic` 加入 profile bundles，让压缩后端真正工作。

## 涉及文件

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/client/index.ts` | **新建** | 浏览器端：设置面板 React 组件，经 `ctx.slots.inject('settings.section', ...)` 注册 |
| `src/index.ts` | **修改** | 加 `GET/POST /context-distiller/config` 路由；`resolved()` 支持运行时覆盖 |
| `scripts/build-client.mjs` | **新建** | esbuild 打包 client → CJS → ModuleLoader 包裹 |
| `scripts/build.mjs` | 修改 | 不变，只打 Node half |
| `package.json` | 修改 | 加 `exports["./client"]`、`dsh.client.platform`、client build 脚本、React devDeps |
| `tsconfig.json` | 修改 | 加 JSX 支持选项 |
| `cordis.patch.yml` | 不变 | bundle 结构不变 |

## 实现步骤

### 1. 新建 `src/client/index.ts`

参考 dsh-notify-me 和 @xmanrui/dsh-im 的真实模式：

```tsx
// client half 入口
export const inject = ['slots']

export function apply(ctx) {
  // 用 try/catch 保护，slots 不可用时只 warn 不崩
  ctx.slots.inject('settings.section', () => {
    return ctx.slots.register({
      name: 'settings.section',
      id: 'context-distiller',
      order: 50,
      label: () => 'Context Distiller',
    }, SettingsPanel);
  });
}
```

`SettingsPanel` 组件：
- 挂载时 `fetch('/context-distiller/config')` 拉当前配置
- UI：开关（compact.enabled）、Provider 输入框、Model 输入框、保存按钮
- 保存 → `POST /context-distiller/config`，显示成功/失败
- 全部内联样式（宿主 CSS 可能覆盖 class）

### 2. 修改 `src/index.ts`

**加运行时配置覆盖**：
```ts
let runtimeOverride: Partial<PluginConfig> | undefined;
const resolved = () => resolvePluginConfig({ ...config, ...runtimeOverride });
```

**加配置读写路由**（webServer.register 已有，追加两条）：
```ts
// GET /context-distiller/config → 返回当前 resolved 快照
// POST /context-distiller/config → 合并到 runtimeOverride，返回 ok
```

POST handler 解析 JSON body，更新 `runtimeOverride` 的 `compact.enabled/provider/model`。
路由用真实 API 形态：`ctx.webServer.register({ kind, path, handler })`，handler 操作 `req/res`（node:http 原生）。

### 3. 新建 `scripts/build-client.mjs`

esbuild 配置：
- `entryPoints: ['src/client/index.ts']`
- `bundle: true, format: 'cjs', platform: 'browser'`
- `external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']`
- `outfile: 'lib/client.js'`
- 输出后用 Node 脚本包裹一层 `window.__ModuleLoader__.load({ id: "context-distiller", factory: ... })`

### 4. 修改 `package.json`

```json
{
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": "./lib/client.js",           // 新增
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }           // 新增
  },
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "scripts": {
    "build:client": "node scripts/build-client.mjs",   // 新增
    "build": "npm run clean && npm run build:js && npm run build:types && npm run build:client"
  },
  "devDependencies": {
    // 新增 React 类型（仅编译期，运行时 external）
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

### 5. 修改 `tsconfig.json`

加 JSX 支持：
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    // 其余不变
  }
}
```

### 6. 加入 dsh-compaction-basic 到 profile

```bash
dsh plugin --profile web add @deepseek-ai/dsh-compaction-basic -w
```

这会把压缩后端注册为 `ctx.compaction` 服务，提供 `/compact` 命令和自动压缩触发。
我的路由器拦截它的 `purpose:'compaction'` LLM 调用，改道到配置的专用模型。

## 验证

1. `npm run build` 通过（Node half + client half + types）
2. `npm run gates` 通过
3. 重启 dsh web
4. 设置页出现 "Context Distiller" 面板
5. 面板里开关压缩、填 provider/model、保存
6. `GET /context-distiller/config` 返回更新后的配置
7. `GET /context-distiller/health` 的 router 状态反映 UI 修改
8. 会话中 `/compact` 触发压缩，由配置的专用模型执行
