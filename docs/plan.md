# context-distiller 设计决策

## 形态

`bundle-client`：后端路由 + 浏览器设置面板。配置走 UI 或 YAML，保存即时生效。

## 核心能力

1. **专用模型路由**：`llm/stream` waterfall 拦截 `purpose:'compaction'` 改道到用户选定的 provider/model。开关关闭时透传用会话模型。
2. **问题回答过滤（v0.1.1）**：独立开关 `filter.flaggedTurns`。开启后扫描会话日志中的 `feedback/record` 事件（网页反馈按钮 / `/feedback`，由 dsh-command-feedback 写入），按 turn 括号定位被反馈轮次（轮次进行中反馈→当前轮；轮次间反馈→最近关闭轮），将该轮全部 surface 消息（user/assistant/tool）以对象引用身份匹配，从压缩调用的 messages 中剔除。在 `llm/stream` 层实现，stock dsh-compaction-basic 与自有引擎均生效；与会话模型、专用模型均无关。
3. **设置面板**：`ctx.slots.inject('settings.section', ...)` 注册，provider/model 下拉来自 `ctx.llm.listProviders/listModels`，中英双语跟随 DSH locale。
4. **可选显式 prompt 引擎**：`BasicCompactionEngine` 子类，需 `@dsh-plugin/dsh-loader`，与 stock `dsh-compaction-basic` 互斥。

## 依赖边界

- 运行时唯一外部依赖：`schemastery`
- 所有 `@deepseek-ai/*` 仅 `import type`（编译期擦除）；会话访问通过结构类型（`events` + `deriveEventMessage`），不引入 dsh-session 类型依赖
- `dshLoader` 用 `ctx.get()` 惰性探测，不在 `inject` 里
- `inject = ['llm', 'webServer', 'sessions']`（Node half）/ `['slots', 'locale']`（client half）

## 关键实现约定

- 路由器对 options 的任何修改（过滤 / 改道）都以 `Symbol.for('context-distiller.compaction-reentry')` 标记后重新进入 `ctx.llm.stream`，自身监听器见到标记直接 `next()`，防止循环
- 过滤匹配靠消息**对象同一性**：`Session.deriveEventMessage` 返回的冻结消息对象即压缩调用 messages 中的同一引用，不做内容启发式匹配
- 过滤失败 fail-open（记 warn，压缩照常），不阻断压缩主流程

## HTTP 路由

| 路由 | 方法 | 用途 |
|---|---|---|
| `/context-distiller/health` | GET | 冒烟：router/engine 状态 |
| `/context-distiller/config` | GET/POST | 读/写运行时配置（UI 保存走 POST） |
| `/context-distiller/models` | GET | 列举 ctx.llm 的 provider/model 目录 |

## 许可证

AGPL-3.0-or-later，商业许可另议。
