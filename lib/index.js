// src/config.ts
import z from "schemastery";
var PLUGIN_NAME = "context-distiller";
var DEFAULT_ENGINE_MAX_TOKENS = 8192;
var DEFAULT_COMPRESS_PROMPT = [
  "You are a context-compression engine for an AI coding assistant. Condense the conversation above into a structured checkpoint that lets another model resume the work with no loss of essential context.",
  "",
  "Output EXACTLY the Markdown structure below, keeping every section in order with terse bullets:",
  "- ## Primary Request and Intent (quote verbatim where wording matters)",
  "- ## Key Technical Concepts",
  "- ## Files and Code (exact paths, key changes or snippets)",
  "- ## Errors and Fixes",
  "- ## Pending Jobs",
  "- ## Current Work",
  "- ## Next Step (the single next action, or (none))",
  "- ## Critical Context (decisions, constraints, user preferences, open questions)",
  "",
  "Rules: preserve exact paths, commands, identifiers, numbers, and syntax fragments; capture user corrections faithfully; do not mention this compression request; output only the checkpoint text."
].join("\n");
var Config = z.object({
  compact: z.object({
    enabled: z.boolean().default(false).description(
      'Route context-compaction summary calls (GenerateOptions.purpose = "compaction") to a dedicated provider/model pair, leaving the conversation model untouched.'
    ),
    provider: z.string().description("An already-configured provider route used for compaction summaries."),
    model: z.string().description("The provider-owned model id used for compaction summaries.")
  }),
  filter: z.object({
    flaggedTurns: z.boolean().default(false).description(
      'During compaction, drop every message of conversation turns the user flagged with feedback/record (the web "report a problem" / /feedback action) so flagged exchanges never enter the checkpoint summary. Independent of the dedicated-model router.'
    )
  }),
  engine: z.object({
    enabled: z.boolean().default(false).description(
      "Replace the stock dsh-compaction-basic backend with an explicit context-compression prompt engine. Mutually exclusive with dsh-compaction-basic (both provide ctx.compaction)."
    ),
    thresholdRatio: z.number().step(0.01).min(0.01).max(0.99).default(0.8).description("Compact when context pressure reaches this fraction of the window."),
    retainRatio: z.number().step(0.01).min(0.01).max(0.99).default(0.16).description("Fraction of the window guaranteed to remain headroom after compaction."),
    maxTokens: z.number().step(1).min(1).default(DEFAULT_ENGINE_MAX_TOKENS).description("Maximum tokens for one compression completion."),
    compactionRetries: z.number().step(1).min(0).default(1),
    maxOverflowRetries: z.number().step(1).min(0).default(1),
    auto: z.boolean().default(true).description("Compact automatically on pressure, not only on manual /compact."),
    compressPrompt: z.string().default(DEFAULT_COMPRESS_PROMPT).description("The explicit instruction appended to the compression call.")
  })
});
function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}
function resolvePluginConfig(config) {
  const compact = config?.compact ?? {};
  const filter = config?.filter ?? {};
  const engine = config?.engine ?? {};
  const compactProvider = typeof compact.provider === "string" ? compact.provider : "";
  const compactModel = typeof compact.model === "string" ? compact.model : "";
  if (Boolean(compactProvider) !== Boolean(compactModel)) {
    throw new Error("context-distiller: compact.provider and compact.model must be set together");
  }
  const thresholdRatio = engine.thresholdRatio ?? 0.8;
  const retainRatio = engine.retainRatio ?? 0.16;
  if (retainRatio >= thresholdRatio) {
    throw new Error("context-distiller: engine.retainRatio must be less than engine.thresholdRatio");
  }
  const compressPrompt = typeof engine.compressPrompt === "string" && engine.compressPrompt.length > 0 ? engine.compressPrompt : DEFAULT_COMPRESS_PROMPT;
  return deepFreeze({
    compact: {
      enabled: compact.enabled ?? false,
      provider: compactProvider,
      model: compactModel
    },
    filter: {
      flaggedTurns: filter.flaggedTurns ?? false
    },
    engine: {
      enabled: engine.enabled ?? false,
      thresholdRatio,
      retainRatio,
      maxTokens: engine.maxTokens ?? DEFAULT_ENGINE_MAX_TOKENS,
      compactionRetries: engine.compactionRetries ?? 1,
      maxOverflowRetries: engine.maxOverflowRetries ?? 1,
      auto: engine.auto ?? true,
      compressPrompt
    }
  });
}

// src/dsh.ts
var facade;
function setDshFacade(value) {
  facade = value;
}
function clearDshFacade() {
  facade = void 0;
}
function dsh() {
  if (facade === void 0) {
    throw new Error("context-distiller: ctx.dshLoader facade is not injected; dsh() is only valid after apply");
  }
  return facade.dsh;
}
function llm() {
  if (facade === void 0) {
    throw new Error("context-distiller: ctx.dshLoader facade is not injected; llm() is only valid after apply");
  }
  return facade.llm;
}
function localDeepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    localDeepFreeze(value[key]);
  }
  return value;
}
function deepFreeze2(value) {
  if (facade !== void 0) return facade.llm.deepFreeze(value);
  return localDeepFreeze(value);
}

// src/flagged-filter.ts
var SURFACE_EVENT_TYPES = /* @__PURE__ */ new Set(["user/message", "assistant/message", "tool/result"]);
function turnOf(event) {
  const data = event.data;
  return typeof data?.turn === "number" ? data.turn : void 0;
}
function collectFlaggedTurns(events) {
  const flagged = /* @__PURE__ */ new Set();
  let openTurn;
  let lastClosedTurn;
  for (const event of events) {
    if (event.type === "turn/start") {
      openTurn = turnOf(event);
    } else if (event.type === "turn/end") {
      const ended = turnOf(event) ?? openTurn;
      if (ended !== void 0) lastClosedTurn = ended;
      openTurn = void 0;
    } else if (event.type === "feedback/record") {
      const target = openTurn ?? lastClosedTurn;
      if (target !== void 0) flagged.add(target);
    }
  }
  return flagged;
}
function collectFlaggedMessages(session) {
  const flaggedTurns = collectFlaggedTurns(session.events);
  if (flaggedTurns.size === 0) return /* @__PURE__ */ new Set();
  const flaggedMessages = /* @__PURE__ */ new Set();
  let openTurn;
  for (const event of session.events) {
    if (event.type === "turn/start") {
      openTurn = turnOf(event);
      continue;
    }
    if (event.type === "turn/end") {
      openTurn = void 0;
      continue;
    }
    if (openTurn === void 0 || !flaggedTurns.has(openTurn)) continue;
    if (!SURFACE_EVENT_TYPES.has(event.type)) continue;
    const message = session.deriveEventMessage(event);
    if (message !== null && message !== void 0) {
      flaggedMessages.add(message);
    }
  }
  return flaggedMessages;
}
function filterFlaggedMessages(messages, flagged) {
  if (flagged.size === 0) return { messages: [...messages], removed: 0 };
  const kept = messages.filter((message) => !flagged.has(message));
  return { messages: kept, removed: messages.length - kept.length };
}

// src/compact-router.ts
var REENTRY_MARKER = Symbol.for("context-distiller.compaction-reentry");
function compactRoute(get) {
  const compact = get().compact;
  if (!compact.enabled || compact.provider.length === 0 || compact.model.length === 0) {
    return void 0;
  }
  return { provider: compact.provider, model: compact.model };
}
function applyFlaggedFilter(ctx, options) {
  if (typeof options.sessionId !== "string" || !Array.isArray(options.messages)) return options;
  const sessions = ctx.sessions;
  if (sessions === void 0) return options;
  let session;
  try {
    session = sessions.get(options.sessionId);
  } catch (error) {
    ctx.logger.warn("context-distiller: session lookup for flagged-turn filtering failed");
    ctx.logger.warn(error);
    return options;
  }
  if (session === void 0) return options;
  try {
    const flagged = collectFlaggedMessages(session);
    if (flagged.size === 0) return options;
    const { messages, removed } = filterFlaggedMessages(
      options.messages,
      flagged
    );
    if (removed === 0) return options;
    ctx.logger.info(
      `context-distiller: filtered ${removed} flagged message(s) out of the compaction input`
    );
    return { ...options, messages };
  } catch (error) {
    ctx.logger.warn("context-distiller: flagged-turn filtering failed; compaction proceeds unfiltered");
    ctx.logger.warn(error);
    return options;
  }
}
function installCompactRouter(ctx, get) {
  return ctx.on(
    "llm/stream",
    (rawOptions, next) => {
      const options = rawOptions;
      if (options[REENTRY_MARKER] === true) return next();
      if (options.purpose !== "compaction") return next();
      let adjusted;
      if (get().filter.flaggedTurns) {
        const filtered = applyFlaggedFilter(ctx, options);
        if (filtered !== options) adjusted = filtered;
      }
      const route = compactRoute(get);
      if (route !== void 0) {
        const target = adjusted ?? options;
        if (target.provider !== route.provider || target.model !== route.model) {
          adjusted = { ...target, provider: route.provider, model: route.model };
        }
      }
      if (adjusted === void 0) return next();
      const rerouted = deepFreeze2({ ...adjusted, [REENTRY_MARKER]: true });
      return ctx.llm.stream(rerouted);
    }
  );
}

// src/compress-engine.ts
function finishError(finish) {
  switch (finish.kind) {
    case "stop":
      return void 0;
    case "error":
    case "aborted": {
      const error = new Error(finish.failure?.message ?? "compression call failed");
      error.code = finish.failure?.code;
      return error;
    }
    case "max-tokens":
      return new Error("context-distiller: compression output reached maxTokens");
    case "tool-calls":
      return new Error("context-distiller: compression model unexpectedly requested a tool");
    default:
      return new Error(`context-distiller: unsupported finish reason "${String(finish.kind)}"`);
  }
}
var CompressEngineClass;
function compressEngineClass() {
  if (CompressEngineClass !== void 0) return CompressEngineClass;
  const Base = dsh().compaction.BasicCompactionEngine;
  class CompressEngineImpl extends Base {
    compressPrompt;
    auxRoute;
    getEngineConfig;
    constructor(ctx, config, compressPrompt, auxRoute, getEngineConfig) {
      super(ctx, config);
      this.compressPrompt = compressPrompt;
      this.auxRoute = auxRoute;
      this.getEngineConfig = getEngineConfig;
    }
    /**
     * Refresh the pressure policy right before a check so config edits to the
     * threshold apply without rebuilding the engine.
     */
    syncEngineConfig() {
      const engine = this.getEngineConfig();
      const next = {
        thresholdRatio: engine.thresholdRatio,
        retainRatio: engine.retainRatio,
        maxTokens: engine.maxTokens,
        compactionRetries: engine.compactionRetries,
        maxOverflowRetries: engine.maxOverflowRetries,
        summarizationProvider: "",
        summarizationModel: "",
        modelPolicies: [],
        auto: engine.auto
      };
      this.config = next;
    }
    compactIfNeeded(agent, trigger, signal) {
      this.syncEngineConfig();
      return super.compactIfNeeded(agent, trigger, signal);
    }
    async summarize(input, agent, signal) {
      const route = this.auxRoute();
      if (route === void 0) {
        return super.summarize(input, agent, signal);
      }
      const messages = [
        ...input.messages,
        llm().createUserMessage({
          content: [{ type: "text", text: this.compressPrompt }],
          source: { kind: "plugin", plugin: PLUGIN_NAME }
        })
      ];
      const assembler = new (dsh()).llm.BlockAssembler();
      for await (const chunk of this.ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        messages,
        ...input.system !== void 0 ? { system: input.system } : {},
        ...input.tools !== void 0 ? { tools: [...input.tools] } : {},
        maxTokens: this.config.maxTokens,
        sessionId: agent.session.id,
        purpose: "compaction",
        ...signal !== void 0 ? { signal } : {}
      })) {
        assembler.push(chunk);
      }
      const terminalError = finishError(assembler.finish);
      if (terminalError !== void 0) throw terminalError;
      const rawOutput = assembler.blocks();
      const summary = rawOutput.filter(
        (block) => block.type === "text"
      );
      if (!summary.some((block) => block.text.trim().length > 0)) {
        throw new Error("context-distiller: compression produced no text summary content");
      }
      return {
        summary,
        rawOutput,
        llmStreamCall: true,
        provider: route.provider,
        model: route.model,
        maxTokens: this.config.maxTokens,
        ...assembler.usage !== void 0 ? { usage: assembler.usage } : {}
      };
    }
  }
  CompressEngineClass = CompressEngineImpl;
  return CompressEngineClass;
}
function installCompressionEngine(ctx, get) {
  if (ctx.get("compaction") !== void 0) {
    ctx.logger.warn(
      "context-distiller: compression engine skipped \u2014 ctx.compaction is already provided (likely by dsh-compaction-basic). The dedicated-model router still works; remove the stock compaction plugin only if you want this explicit-prompt engine to own compaction."
    );
    return void 0;
  }
  const engine = get().engine;
  return new (compressEngineClass())(
    ctx,
    {
      thresholdRatio: engine.thresholdRatio,
      retainRatio: engine.retainRatio,
      maxTokens: engine.maxTokens,
      compactionRetries: engine.compactionRetries,
      maxOverflowRetries: engine.maxOverflowRetries,
      auto: engine.auto
    },
    engine.compressPrompt,
    () => compactRoute(get),
    () => get().engine
  );
}

// src/index.ts
var name = PLUGIN_NAME;
var inject = ["llm", "webServer", "sessions"];
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      if (chunk) data += chunk.toString();
    });
    req.on("end", () => resolve(data));
  });
}
function apply(ctx, config) {
  let runtimeOverride;
  let lastRaw;
  let lastGood;
  const resolved = () => {
    const raw = {
      ...config,
      ...runtimeOverride,
      compact: { ...config.compact, ...runtimeOverride?.compact },
      filter: { ...config.filter, ...runtimeOverride?.filter },
      engine: { ...config.engine, ...runtimeOverride?.engine }
    };
    if (raw === lastRaw && lastGood !== void 0) return lastGood;
    try {
      const next = resolvePluginConfig(raw);
      lastRaw = raw;
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === void 0) throw error;
      lastRaw = raw;
      ctx.logger.error(
        "context-distiller: keeping the last good configuration after an invalid config block"
      );
      ctx.logger.error(error);
      return lastGood;
    }
  };
  const disposeRouter = installCompactRouter(ctx, resolved);
  const disposeHealth = ctx.webServer.register({
    kind: "exact",
    path: `/${PLUGIN_NAME}/health`,
    handler: (_req, res) => {
      const r = resolved();
      const body = JSON.stringify({
        status: "ok",
        plugin: PLUGIN_NAME,
        router: {
          enabled: r.compact.enabled,
          configured: r.compact.provider.length > 0 && r.compact.model.length > 0,
          provider: r.compact.provider || null,
          model: r.compact.model || null
        },
        filter: {
          flaggedTurns: r.filter.flaggedTurns
        },
        engine: {
          enabled: r.engine.enabled,
          thresholdRatio: r.engine.thresholdRatio,
          retainRatio: r.engine.retainRatio
        },
        uptime: process.uptime()
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
    }
  });
  const disposeConfig = ctx.webServer.register({
    kind: "exact",
    path: `/${PLUGIN_NAME}/config`,
    handler: async (req, res) => {
      if (req.method === "GET") {
        const r = resolved();
        const body = JSON.stringify({
          compact: { enabled: r.compact.enabled, provider: r.compact.provider, model: r.compact.model },
          filter: { flaggedTurns: r.filter.flaggedTurns },
          engine: { enabled: r.engine.enabled, thresholdRatio: r.engine.thresholdRatio, retainRatio: r.engine.retainRatio }
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(body);
        return;
      }
      if (req.method === "POST") {
        try {
          const text = await readBody(req);
          const body = JSON.parse(text);
          const cur = resolved();
          runtimeOverride = {
            compact: {
              enabled: body.compact?.enabled ?? cur.compact.enabled,
              provider: body.compact?.provider ?? cur.compact.provider,
              model: body.compact?.model ?? cur.compact.model
            },
            filter: {
              flaggedTurns: body.filter?.flaggedTurns ?? cur.filter.flaggedTurns
            }
          };
          lastRaw = void 0;
          const r = resolved();
          ctx.logger.info(
            `context-distiller config updated (router: ${r.compact.enabled ? "on" : "off"}, provider: ${r.compact.provider}, model: ${r.compact.model}; flagged-turn filter: ${r.filter.flaggedTurns ? "on" : "off"})`
          );
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, compact: r.compact, filter: r.filter }));
        } catch (error) {
          ctx.logger.error("context-distiller: config update failed");
          ctx.logger.error(error);
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: error.message }));
        }
        return;
      }
      res.writeHead(405, { "content-type": "application/json" });
      res.end('{"error":"method not allowed"}');
    }
  });
  const disposeModels = ctx.webServer.register({
    kind: "exact",
    path: `/${PLUGIN_NAME}/models`,
    handler: async (_req, res) => {
      try {
        const providers = ctx.llm.listProviders();
        const result = [];
        for (const p of providers) {
          try {
            const models = await ctx.llm.listModels(p.id);
            result.push({
              provider: p.id,
              name: p.name,
              models: models.map((m) => ({ id: m.id, name: m.name }))
            });
          } catch {
            result.push({ provider: p.id, name: p.name, models: [] });
          }
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
    }
  });
  let compressionEngine;
  ctx.effect(
    () => () => {
      disposeRouter?.();
      disposeHealth?.();
      disposeConfig?.();
      disposeModels?.();
      compressionEngine = void 0;
      clearDshFacade();
    },
    "context-distiller: router, health/config/models routes, and engine lifecycle"
  );
  if (resolved().engine.enabled) {
    try {
      const loader = ctx.get("dshLoader");
      if (loader === void 0) {
        ctx.logger.warn(
          "context-distiller: engine.enabled is true but @dsh-plugin/dsh-loader is not available; the dedicated-model router remains active, but the explicit-prompt engine was not installed."
        );
      } else {
        setDshFacade(loader);
        compressionEngine = installCompressionEngine(ctx, resolved);
      }
    } catch (error) {
      ctx.logger.warn(
        "context-distiller: compression engine installation failed; the dedicated-model router remains active."
      );
      ctx.logger.warn(error);
    }
  }
  ctx.logger.info(
    `context-distiller loaded (router: ${resolved().compact.enabled ? "on" : "off"}, flagged-turn filter: ${resolved().filter.flaggedTurns ? "on" : "off"}, engine: ${resolved().engine.enabled ? "on" : "off"})`
  );
}
export {
  Config,
  PLUGIN_NAME,
  apply,
  compactRoute,
  inject,
  installCompactRouter,
  installCompressionEngine,
  name,
  resolvePluginConfig
};
//# sourceMappingURL=index.js.map
