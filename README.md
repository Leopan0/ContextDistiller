# ContextDistiller · 上下文压缩

[English](#english) | [中文](#中文)

---

## English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
runs **context compaction with a dedicated model**, separate from the
conversation model. Point the summarization step at a cheaper or faster model
while your chat model stays untouched — all configurable from the Plugin
Manager.

Requires DSH **0.1.7-rc.2 or later** (the Desktop app and `dsh web` both work).

### Features

- **Dedicated-model router** — Intercepts `purpose: 'compaction'` LLM calls and
  reroutes them to a provider/model of your choice. Zero impact on conversation
  calls.
- **Native config form** — Configuration lives in the DSH Plugin Manager:
  every config section is declared volatile, so the management page renders an
  editable form whose changes apply to the running plugin without a reload and
  persist through the active profile's patch (survive restarts). A
  `cordis.patch.yml` config block works identically.
- **Flagged-answer filter** — When enabled, the whole conversation turn
  containing an answer you thumbs-down (`feedback/message-put`, negative
  rating) is dropped from the compaction input, so a bad exchange never enters
  the checkpoint summary. Works with the stock compaction backend and is
  independent of the dedicated-model toggle.
- **Bilingual** — UI text follows the DSH interface locale (Chinese / English).
- **Optional explicit-prompt engine** — A `BasicCompactionEngine` subclass with
  a structured checkpoint prompt. Requires `@dsh-plugin/dsh-loader`.

### How it works

When the toggle is **off**, compaction uses the session model (default
behavior). When **on** with a provider/model selected, the router intercepts
compaction calls and reroutes them. Re-entry is guarded so the rerouted call
never loops.

```
Session model ──────────────────────────────────────────► normal calls
                     │
           purpose:'compaction'
                     │
          ┌──────────▼──────────┐
          │  compact-router     │
          │  (enabled + route)  │
          └──────────┬──────────┘
                     │
              dedicated model
```

### Install

**Desktop app**: open the Plugins page → install from GitHub with
`github:Leopan0/ContextDistiller`.

**Web (`dsh web`)**:

```bash
# From local directory (development)
dsh plugin --profile web add file:/path/to/context-distiller

# From GitHub
dsh plugin --profile web add "github:Leopan0/ContextDistiller#main"
```

Restart `dsh web` after installing.

### Configure

Open the DSH Plugin Manager (插件 page) → find "Context Distiller" (or
"上下文压缩") → open its configuration → toggle the dedicated model on, fill in
`provider` / `model`, set `filter` / `threshold` / `engine` as needed. Volatile
fields apply to the running plugin immediately and persist through the active
profile's patch.

Or via YAML in `cordis.patch.yml`:

```yaml
config:
  compact:
    enabled: true
    provider: deepseek-official
    model: deepseek-chat
  filter:
    flaggedTurns: true
  engine:
    enabled: false
```

### Configuration reference

#### `compact` — dedicated summarizer route

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Turn the rerouting on/off. |
| `provider` | string | `""` | Registered provider route. |
| `model` | string | `""` | Model id under that provider. |

#### `filter` — compaction input filtering

| Field | Type | Default | Meaning |
|---|---|---|---|
| `flaggedTurns` | boolean | `false` | Drop the whole conversation turn containing an answer the user thumbs-downed (`feedback/message-put` with a negative rating) from compaction summaries. |

#### `threshold` — absolute compaction trigger

| Field | Type | Default | Meaning |
|---|---|---|---|
| `wan` | number | `0` | Compact once the measured context reaches this many 10k-token units (1-100 = 10k-1M tokens). `0` keeps the backend's default ratio policy. Clamped to the model window when larger. The backend additionally caps pressure below its reserved output budget plus `headroomTokens`, so the effective trigger can land earlier than this value. |

#### `engine` — optional explicit-prompt backend

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Install the explicit-prompt engine. |
| `thresholdRatio` | number | `0.8` | Compact at this context-window pressure. |
| `retainRatio` | number | `0.16` | Headroom kept free after compaction. |
| `headroomTokens` | number | `65536` | Additional pressure headroom (tokens) reserved beyond the routed output reservation; the backend caps the pressure threshold below window minus this budget. |

### Verify

```bash
curl http://localhost:<port>/context-distiller/health
# {"status":"ok","compact":{"enabled":true,...}}
```

### Develop

```bash
pnpm install
pnpm run build      # Node half + client half + types
pnpm run gates      # consistency checks
```

### License

AGPL-3.0-or-later. Commercial licenses available on request.

---

## 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，
用**独立模型做上下文压缩**，与会话模型完全分离。把摘要/压缩步骤指向更
便宜或更快的模型，聊天模型不受影响——所有配置在插件管理页完成。

要求 DSH **0.1.7-rc.2 或更高版本**（桌面版与 `dsh web` 均可）。

### 功能

- **专用模型路由** — 拦截 `purpose: 'compaction'` 的 LLM 调用，改道到你配置
  的 provider/model。对会话调用零影响。
- **原生配置表单** — 配置入口在 DSH 插件管理页：所有配置节均声明为
  volatile，管理页会渲染出可编辑表单，修改即时对运行中的插件生效，并随
  当前 Profile 的 patch 持久保存（重启不丢）。`cordis.patch.yml` 的 config
  块写法完全等效。
- **点踩回答过滤** — 开启后，你点踩（差评，`feedback/message-put` 负面
  评分）的那条回答所在的整轮对话，会在压缩时从摘要输入中剔除，错误回答
  不会进入 checkpoint 摘要。对 stock 压缩后端同样生效，与独立模型开关
  互不影响。
- **中英双语** — UI 文案跟随 DSH 界面语言自动切换。
- **可选显式 prompt 压缩引擎** — `BasicCompactionEngine` 子类，使用结构化
  checkpoint prompt。需要 `@dsh-plugin/dsh-loader`。

### 工作原理

开关**关闭**时，压缩使用会话模型（默认行为）。**开启**并选择 provider/model
后，路由器拦截压缩调用并改道。内置防循环守卫。

```
会话模型 ────────────────────────────────────────────────► 正常调用
                     │
           purpose:'compaction'
                     │
          ┌──────────▼──────────┐
          │  compact-router     │
          │  （已开启 + 已配置）  │
          └──────────┬──────────┘
                     │
               专用模型
```

### 安装

**桌面版**：打开插件管理页 → 从 GitHub 安装 `github:Leopan0/ContextDistiller`。

**Web（`dsh web`）**：

```bash
# 本地目录（开发）
dsh plugin --profile web add file:/path/to/context-distiller

# 从 GitHub
dsh plugin --profile web add "github:Leopan0/ContextDistiller#main"
```

安装后重启 `dsh web`。

### 配置

打开 DSH 插件管理页（插件页）→ 找到"上下文压缩"（Context Distiller）→
打开它的配置 → 开启独立模型路由，填写 `provider` / `model`，按需设置
`filter` / `threshold` / `engine`。volatile 字段的修改即时对运行中的插件
生效，并随当前 Profile 的 patch 持久保存。

或通过 YAML 配置 `cordis.patch.yml`：

```yaml
config:
  compact:
    enabled: true
    provider: deepseek-official
    model: deepseek-chat
  filter:
    flaggedTurns: true
  engine:
    enabled: false
```

### 配置项

#### `compact` — 专用压缩路由

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `false` | 是否开启改道。 |
| `provider` | string | `""` | 已注册的提供商路由。 |
| `model` | string | `""` | 该提供商下的模型 id。 |

#### `filter` — 压缩输入过滤

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `flaggedTurns` | boolean | `false` | 压缩摘要时剔除整轮包含被点踩回答（`feedback/message-put` 负面评分）的对话。 |

#### `threshold` — 绝对压缩触发阈值

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `wan` | number | `0` | 上下文达到该 10k-token 单位数即触发压缩（1-100 = 1万-100万 token）。`0` 跟随后端默认比例策略，超出模型窗口时自动钳制。后端还会把压力封顶在"窗口 − 输出预算预留 − headroomTokens"以下，因此实际触发点可能早于该值。 |

#### `engine` — 可选显式 prompt 后端

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `false` | 是否安装显式 prompt 引擎。 |
| `thresholdRatio` | number | `0.8` | 上下文窗口压力达到此比例时触发压缩。 |
| `retainRatio` | number | `0.16` | 压缩后保留的余量比例。 |
| `headroomTokens` | number | `65536` | 在输出预算预留之外额外保留的压力余量（token）；后端把压力阈值封顶在窗口减去该预算以下。 |

### 验证

```bash
curl http://localhost:<port>/context-distiller/health
# {"status":"ok","compact":{"enabled":true,...}}
```

### 开发

```bash
pnpm install
pnpm run build      # Node half + client half + types
pnpm run gates      # 一致性检查
```

### 许可证

AGPL-3.0-or-later。可联系作者获取商业许可。
