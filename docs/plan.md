# context-distiller 插件计划

> 由 DSH 插件开发助手（dsh-plugin-studio）生成。
> 每阶段决策确定后勾选对应项，未通过不得进入下一阶段。

## 阶段 ①：需求捕获

- [x] 插件名：`context-distiller`
- [x] 一句话目标：用独立配置的专用模型（与会话模型分离）执行上下文压缩，可选启用显式压缩 prompt 的压缩引擎。
- [x] 能力面清单：
  - 事件订阅：`llm/stream` waterfall 拦截 `purpose: 'compaction'` → 重路由到专用 provider/model（核心）
  - 服务提供（可选）：`engine.enabled` 时替换 `ctx.compaction`，自定义 `BasicCompactionEngine`
  - HTTP 冒烟：`GET /context-distiller/health`
- [x] 目标 profile：web

## 阶段 ②：形态与分发决策

- [x] 形态：`bundle`（纯后端，带 `cordis.patch.yml`，无 client；配置走 cordis config / patch）
- [ ] 分发方式：git 源（默认，`lib/` 需入库）/ 本地目录 / npm
- [ ] 包管理器：pnpm（默认）/ npm

决策理由：核心价值是后端请求重路由，无浏览器 UI 需求，bundle 纯后端最轻；
`compact-router` 仅需 `ctx.llm`，故 `@dsh-plugin/dsh-loader` 设为 optional peer，
仅 `engine.enabled` 时经 `ctx.get('dshLoader')` 按需取用。

## 阶段 ③：配方装配

- [x] `src/config.ts`：schemastery schema（compact + engine）、resolve/校验、冻结快照
- [x] `src/dsh.ts`：`ctx.dshLoader` 门面（BasicCompactionEngine / BlockAssembler / createUserMessage），含本地 deepFreeze 兜底
- [x] `src/compact-router.ts`：`llm/stream` waterfall 重路由（含重入守卫）
- [x] `src/compress-engine.ts`：惰性构建的 `BasicCompactionEngine` 子类
- [x] `src/index.ts`：apply 装配（router + 可选 engine + health 路由 + last-good 配置缓存）
- [x] 无 client half（纯后端形态）
- [x] `inject` 已覆盖实际 ctx 服务：`['llm', 'webServer']`；`dshLoader`/`compaction` 用 `ctx.get` 探测
- [x] 冒烟功能就绪：`GET /context-distiller/health`
- [x] 事件/路由注册均收集 disposer 并在 `ctx.effect` cleanup 释放
- [x] 名称一致：package name == patch id/name == 路由前缀 == `context-distiller`

## 阶段 ④：本地验证

- [ ] `pnpm install` 通过（用户手动）
- [ ] `pnpm run bundle` 通过（用户手动；esbuild 产出 `lib/index.js`，tsc 产出 `.d.ts`）
- [ ] `pnpm run gates` 通过（用户手动；零依赖一致性检查）
- [ ] `pnpm run typecheck` 通过（用户手动）

## 阶段 ⑤：安装与浏览器冒烟

- [ ] 安装成功（`dsh plugin --profile web add file:...` 或 `github:<owner>/...`）
- [ ] 重启 web 后启动日志无 `plugin tree failed to load`，出现 `context-distiller loaded`
- [ ] `curl .../context-distiller/health` 返回 200 且 router 状态正确
- [ ] 长会话或 `/compact` 时压缩由专用模型执行

## 阶段 ⑥：发布

- [ ] git 仓库与真实 remote 就绪（替换 README/package.json 中的 `<owner>`）
- [ ] 构建产物 `lib/` 已入库（git 安装不跑构建脚本）
- [ ] 从目标 ref 重装 + 重启 web 验证通过

## 备注

- 降级说明：本次采用「代码优先交付」——agent 直接写入全部源码与构建脚本，
  依据用户偏好未代为执行 install / build / gates / 安装等可执行验证；这些步骤留待用户手动完成。
- API 依据：路由与引擎实现对照参考插件 `@dsh-plugin/dsh-auxiliary`
  （`compact-router.ts` / `compress-engine.ts` / `config.ts` / `dsh.ts`）忠实精简，
  类型以 `import type` 引用 `@deepseek-ai/*`（编译期擦除，运行时零导入）。
- 互斥关系：仅用 router 时保留 stock `dsh-compaction-basic`；仅当启用本插件
  `engine` 时才从 profile 移除它（二者都提供 `ctx.compaction`）。
