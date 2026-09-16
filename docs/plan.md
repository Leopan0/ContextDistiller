# context-distiller 设计决策

## 形态

`bundle-client`：后端路由 + 浏览器设置面板。配置走 UI 或 YAML，保存即时生效。

## 核心能力

1. **专用模型路由**：`llm/stream` waterfall 拦截 `purpose:'compaction'` 改道到用户选定的 provider/model。开关关闭时透传用会话模型。
2. **设置面板**：`ctx.slots.inject('settings.section', ...)` 注册，provider/model 下拉来自 `ctx.llm.listProviders/listModels`，中英双语跟随 DSH locale。
3. **可选显式 prompt 引擎**：`BasicCompactionEngine` 子类，需 `@dsh-plugin/dsh-loader`，与 stock `dsh-compaction-basic` 互斥。

## 依赖边界

- 运行时唯一外部依赖：`schemastery`
- 所有 `@deepseek-ai/*` 仅 `import type`（编译期擦除）
- `dshLoader` 用 `ctx.get()` 惰性探测，不在 `inject` 里
- `inject = ['llm', 'webServer']`（Node half）/ `['slots', 'locale']`（client half）

## HTTP 路由

| 路由 | 方法 | 用途 |
|---|---|---|
| `/context-distiller/health` | GET | 冒烟：router/engine 状态 |
| `/context-distiller/config` | GET/POST | 读/写运行时配置（UI 保存走 POST） |
| `/context-distiller/models` | GET | 列举 ctx.llm 的 provider/model 目录 |

## 许可证

AGPL-3.0-or-later，商业许可另议。
