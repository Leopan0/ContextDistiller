// src/config.ts
import z from "schemastery";

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
function deepFreeze(value) {
  if (facade !== void 0) return facade.llm.deepFreeze(value);
  return localDeepFreeze(value);
}

// src/config.ts
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
  threshold: z.object({
    wan: z.number().step(1).min(0).max(100).default(0).description(
      "Absolute compaction trigger in 10k-token units (wan), converted per routed model at check time. 0 (default) keeps the compaction backend ratio policy untouched; 1-100 spans 10k-1M tokens, e.g. 8 compacts once measured context reaches 80000 tokens. Clamped to the model window when larger. A backend modelPolicies entry with its own thresholdRatio still takes precedence."
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
function engineRatioPolicy(engine) {
  return {
    thresholdRatio: engine.thresholdRatio,
    retainRatio: engine.retainRatio,
    maxTokens: engine.maxTokens,
    compactionRetries: engine.compactionRetries,
    maxOverflowRetries: engine.maxOverflowRetries,
    auto: engine.auto
  };
}
function resolvePluginConfig(config) {
  const compact = config?.compact ?? {};
  const filter = config?.filter ?? {};
  const threshold = config?.threshold ?? {};
  const engine = config?.engine ?? {};
  const compactProvider = typeof compact.provider === "string" ? compact.provider : "";
  const compactModel = typeof compact.model === "string" ? compact.model : "";
  if (Boolean(compactProvider) !== Boolean(compactModel)) {
    throw new Error("context-distiller: compact.provider and compact.model must be set together");
  }
  const thresholdWan = threshold.wan ?? 0;
  if (!Number.isInteger(thresholdWan) || thresholdWan < 0 || thresholdWan > 100) {
    throw new Error(
      "context-distiller: threshold.wan must be an integer between 0 and 100 (units of 10000 tokens)"
    );
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
    threshold: {
      wan: thresholdWan
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
      const rerouted = deepFreeze({ ...adjusted, [REENTRY_MARKER]: true });
      return ctx.llm.stream(rerouted);
    }
  );
}

// src/threshold.ts
var STOCK_RETAIN_RATIO = 0.16;
var WAN_TOKENS = 1e4;
function planThreshold(wan, contextWindow) {
  const thresholdTokens = wan * WAN_TOKENS;
  if (thresholdTokens >= contextWindow) {
    return {
      thresholdRatio: 1,
      retainTokens: Math.max(1, Math.floor(contextWindow * STOCK_RETAIN_RATIO)),
      clamped: true
    };
  }
  return {
    thresholdRatio: thresholdTokens / contextWindow,
    retainTokens: Math.min(
      Math.floor(contextWindow * STOCK_RETAIN_RATIO),
      Math.floor(thresholdTokens / 2)
    ),
    clamped: false
  };
}
function sessionTarget(session) {
  const header = session?.requestHeader?.();
  const config = header?.config;
  if (!config?.provider?.length || !config?.model?.length) return void 0;
  return { provider: config.provider, model: config.model };
}
function agentTarget(agent) {
  const routed = sessionTarget(agent.session);
  if (routed !== void 0) return routed;
  const options = agent.options;
  if (!options?.provider?.length || !options?.model?.length) return void 0;
  return { provider: options.provider, model: options.model };
}
var warned = /* @__PURE__ */ new Set();
function warnOnce(ctx, message) {
  if (warned.has(message)) return;
  warned.add(message);
  ctx.logger.warn(message);
}
async function thresholdAdjustedConfig(ctx, agent, wan, original, signal) {
  if (wan <= 0) return original;
  const target = agentTarget(agent);
  if (target === void 0) return original;
  try {
    const info = await ctx.llm.resolveModelInfo(target.provider, target.model, signal);
    const contextWindow = info?.context?.contextWindow;
    if (typeof contextWindow !== "number" || !(contextWindow > 0)) return original;
    const plan = planThreshold(wan, contextWindow);
    if (plan.clamped) {
      warnOnce(
        ctx,
        `context-distiller: threshold ${wan}wan (${wan * WAN_TOKENS} tokens) covers the whole ${contextWindow}-token window of ${target.provider}/${target.model}; compaction will only trigger at a full window`
      );
    }
    return {
      ...original,
      thresholdRatio: plan.thresholdRatio,
      retainTokens: plan.retainTokens
    };
  } catch (error) {
    warnOnce(
      ctx,
      `context-distiller: threshold lookup for ${target.provider}/${target.model} failed (${error instanceof Error ? error.message : String(error)}); this check uses the backend ratio policy`
    );
    return original;
  }
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
    getConfig;
    constructor(ctx, config, compressPrompt, auxRoute, getConfig) {
      super(ctx, config);
      this.compressPrompt = compressPrompt;
      this.auxRoute = auxRoute;
      this.getConfig = getConfig;
    }
    /**
     * Refresh the pressure policy right before a check so config edits to the
     * threshold apply without rebuilding the engine. When the absolute wan
     * threshold is set it is converted for the routed model on every check;
     * otherwise the engine's own ratio policy applies unchanged.
     */
    async syncEngineConfig(agent) {
      const resolved = this.getConfig();
      const base = {
        ...engineRatioPolicy(resolved.engine),
        summarizationProvider: "",
        summarizationModel: "",
        modelPolicies: []
      };
      this.config = await thresholdAdjustedConfig(this.ctx, agent, resolved.threshold.wan, base);
    }
    async compactIfNeeded(agent, trigger, signal) {
      await this.syncEngineConfig(agent);
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
    engineRatioPolicy(engine),
    engine.compressPrompt,
    () => compactRoute(get),
    get
  );
}

// src/threshold-patch.ts
function installThresholdPatch(ctx, get) {
  const candidate = ctx.get("compaction");
  if (candidate === null || typeof candidate !== "object" || typeof candidate.compactIfNeeded !== "function" || candidate.config === void 0) {
    if (get().threshold.wan > 0) {
      ctx.logger.warn(
        "context-distiller: threshold.wan is set but no stock compaction backend is present to patch (ctx.compaction is absent); the absolute threshold stays inert."
      );
    }
    return void 0;
  }
  const engine = candidate;
  const hadOwn = Object.prototype.hasOwnProperty.call(engine, "compactIfNeeded");
  if (hadOwn) {
    delete engine.compactIfNeeded;
  }
  const original = engine.compactIfNeeded;
  const wrapper = async (agent, trigger, signal) => {
    engine.config = await thresholdAdjustedConfig(
      ctx,
      agent,
      get().threshold.wan,
      engine.config,
      signal
    );
    return original.call(engine, agent, trigger, signal);
  };
  engine.compactIfNeeded = wrapper;
  const { wan } = get().threshold;
  if (wan > 0) {
    ctx.logger.info(
      `context-distiller: absolute-threshold patch installed on the stock compaction backend (wan: ${wan})`
    );
  }
  return () => {
    if (Object.prototype.hasOwnProperty.call(engine, "compactIfNeeded") && engine.compactIfNeeded === wrapper) {
      if (hadOwn) engine.compactIfNeeded = original;
      else delete engine.compactIfNeeded;
    }
  };
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
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
function policyView(r) {
  return {
    compact: {
      enabled: r.compact.enabled,
      provider: r.compact.provider,
      model: r.compact.model
    },
    filter: { flaggedTurns: r.filter.flaggedTurns },
    threshold: { wan: r.threshold.wan },
    engine: {
      enabled: r.engine.enabled,
      thresholdRatio: r.engine.thresholdRatio,
      retainRatio: r.engine.retainRatio
    }
  };
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
      threshold: { ...config.threshold, ...runtimeOverride?.threshold },
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
      json(res, 200, {
        status: "ok",
        plugin: PLUGIN_NAME,
        ...policyView(resolved()),
        uptime: process.uptime()
      });
    }
  });
  const disposeConfig = ctx.webServer.register({
    kind: "exact",
    path: `/${PLUGIN_NAME}/config`,
    handler: async (req, res) => {
      if (req.method === "GET") {
        json(res, 200, policyView(resolved()));
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
            },
            threshold: {
              wan: body.threshold?.wan ?? cur.threshold.wan
            }
          };
          lastRaw = void 0;
          const r = resolved();
          ctx.logger.info(
            `context-distiller config updated (router: ${r.compact.enabled ? "on" : "off"}, provider: ${r.compact.provider}, model: ${r.compact.model}; flagged-turn filter: ${r.filter.flaggedTurns ? "on" : "off"}; threshold: ${r.threshold.wan}wan)`
          );
          json(res, 200, { ok: true, compact: r.compact, filter: r.filter, threshold: r.threshold });
        } catch (error) {
          ctx.logger.error("context-distiller: config update failed");
          ctx.logger.error(error);
          json(res, 400, { ok: false, error: error.message });
        }
        return;
      }
      json(res, 405, { error: "method not allowed" });
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
        json(res, 200, result);
      } catch (error) {
        json(res, 500, { error: error.message });
      }
    }
  });
  let compressionEngine;
  let disposeThreshold;
  ctx.effect(
    () => () => {
      disposeRouter?.();
      disposeHealth?.();
      disposeConfig?.();
      disposeModels?.();
      disposeThreshold?.();
      compressionEngine = void 0;
      clearDshFacade();
    },
    "context-distiller: router, health/config/models routes, threshold patch, and engine lifecycle"
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
  if (compressionEngine === void 0) {
    try {
      disposeThreshold = installThresholdPatch(ctx, resolved);
    } catch (error) {
      ctx.logger.warn(
        "context-distiller: compaction threshold patch failed; the stock backend keeps its ratio policy."
      );
      ctx.logger.warn(error);
    }
  }
  const final = resolved();
  ctx.logger.info(
    `context-distiller loaded (router: ${final.compact.enabled ? "on" : "off"}, flagged-turn filter: ${final.filter.flaggedTurns ? "on" : "off"}, engine: ${final.engine.enabled ? "on" : "off"}, threshold: ${final.threshold.wan}wan)`
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
  installThresholdPatch,
  name,
  resolvePluginConfig
};
//# sourceMappingURL=index.js.map
