# ContextDistiller · 上下文压缩

[English](#english) | [中文](#中文)

---

## English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
runs **context compaction with a dedicated model**, separate from the
conversation model. Point the summarization step at a cheaper or faster model
while your chat model stays untouched — all configurable from the web UI.

### Features

- **Dedicated-model router** — Intercepts `purpose: 'compaction'` LLM calls and
  reroutes them to a provider/model of your choice. Zero impact on conversation
  calls.
- **Settings panel** — A browser-side UI in DSH web settings. Toggle the
  dedicated model on/off, pick provider & model from dropdowns populated by
  `ctx.llm`. Changes take effect immediately, no restart needed.
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

```bash
# From local directory (development)
dsh plugin --profile web add file:/path/to/context-distiller

# From GitHub
dsh plugin --profile web add "github:Leopan0/context-distiller#main"
```

Restart `dsh web` after installing.

### Configure

Open the DSH web settings page → find "Context Distiller" (or "上下文压缩") →
toggle on → select provider and model → Save.

Or via YAML in `cordis.patch.yml`:

```yaml
config:
  compact:
    enabled: true
    provider: deepseek-official
    model: deepseek-chat
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

#### `engine` — optional explicit-prompt backend

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Install the explicit-prompt engine. |
| `thresholdRatio` | number | `0.8` | Compact at this context-window pressure. |
| `retainRatio` | number | `0.16` | Headroom kept free after compaction. |

### Verify

```bash
curl http://localhost:<port>/context-distiller/health
# {"status":"ok","router":{"enabled":true,...}}

curl http://localhost:<port>/context-distiller/models
# [{"provider":"deepseek-official","models":[...]}, ...]
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
便宜或更快的模型，聊天模型不受影响——所有配置在网页 UI 完成。

### 功能

- **专用模型路由** — 拦截 `purpose: 'compaction'` 的 LLM 调用，改道到你配置
  的 provider/model。对会话调用零影响。
- **设置面板** — 在 DSH 网页设置中提供浏览器端 UI。开关切换、下拉选择
  provider 和 model（列表来自 `ctx.llm`）。保存即时生效，无需重启。
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

```bash
# 本地目录（开发）
dsh plugin --profile web add file:/path/to/context-distiller

# 从 GitHub
dsh plugin --profile web add "github:Leopan0/context-distiller#main"
```

安装后重启 `dsh web`。

### 配置

打开 DSH 网页设置 → 找到"上下文压缩" → 开启 → 选择提供商和模型 → 保存。

或通过 YAML 配置 `cordis.patch.yml`：

```yaml
config:
  compact:
    enabled: true
    provider: deepseek-official
    model: deepseek-chat
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

#### `engine` — 可选显式 prompt 后端

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `false` | 是否安装显式 prompt 引擎。 |
| `thresholdRatio` | number | `0.8` | 上下文窗口压力达到此比例时触发压缩。 |
| `retainRatio` | number | `0.16` | 压缩后保留的余量比例。 |

### 验证

```bash
curl http://localhost:<port>/context-distiller/health
# {"status":"ok","router":{"enabled":true,...}}

curl http://localhost:<port>/context-distiller/models
# [{"provider":"deepseek-official","models":[...]}, ...]
```

### 开发

```bash
pnpm install
pnpm run build      # Node half + client half + types
pnpm run gates      # 一致性检查
```

### 许可证

AGPL-3.0-or-later。可联系作者获取商业许可。
