/**
 * context-distiller — dedicated-model context compression for DeepSeek Harness.
 *
 * Two layered capabilities, both optional and both leaving the conversation
 * model untouched:
 *
 *   1. Model router (core): an `llm/stream` waterfall listener reroutes every
 *      `purpose: 'compaction'` summary call to a configured provider/model
 *      pair. Works on top of the stock dsh-compaction-basic backend.
 *   2. Compression engine (optional): replaces the compaction backend with a
 *      `BasicCompactionEngine` subclass driven by an explicit compression
 *      prompt. Requires @dsh-plugin/dsh-loader and is mutually exclusive with
 *      dsh-compaction-basic.
 *   3. Absolute threshold (optional): `threshold.wan` overrides any stock
 *      compaction backend in place so compaction triggers at a fixed token
 *      budget (in 10k-token units) instead of a window ratio. 0 = untouched.
 *
 * A `GET /context-distiller/health` route is provided as a load smoke test.
 *
 * @module context-distiller
 */
import type { Context } from '@deepseek-ai/cordis';
// Type-only side-effect import: pulls in the Context.webServer service
// augmentation at compile time; erased from the runtime bundle.
import type {} from '@deepseek-ai/dsh-host-webserver';
import {
  Config,
  PLUGIN_NAME,
  resolvePluginConfig,
  type PluginConfig,
  type PluginConfigInput,
  type ResolvedPluginConfig
} from './config.js';
import { installCompactRouter } from './compact-router.js';
import { type CompressEngine, installCompressionEngine } from './compress-engine.js';
import { clearDshFacade, setDshFacade, type DshFacade } from './dsh.js';
import { installThresholdPatch } from './threshold-patch.js';

export { Config, PLUGIN_NAME, resolvePluginConfig } from './config.js';
export type { PluginConfig, PluginConfigInput } from './config.js';
export { installCompactRouter, compactRoute } from './compact-router.js';
export { installCompressionEngine, type CompressEngine } from './compress-engine.js';
export { installThresholdPatch } from './threshold-patch.js';

/** Cordis plugin name used by loader diagnostics. */
export const name = PLUGIN_NAME;

/**
 * Services this entry accesses via `ctx`.
 *
 * - `llm`: the model seam the waterfall listener hooks and streams through.
 * - `webServer`: hosts the `/context-distiller/health` smoke route.
 * - `sessions`: resolves the live session of a compaction call so turns
 *   flagged via negative message ratings (`feedback/message-put`) can be
 *   filtered out of the summarization input.
 *
 * `dshLoader` is deliberately NOT required: the core router has no module-level
 * dsh dependency. It is probed optionally via `ctx.get` for the engine.
 */
export const inject = ['llm', 'webServer', 'sessions'];

/** Structural shape of `ctx.dshLoader`; only populated when dsh-loader is installed. */
interface DshLoaderApi extends DshFacade {}

/** Minimal structural shape of the node:http responses written below. */
interface JsonResponse {
  writeHead: (status: number, headers: Record<string, string>) => unknown;
  end: (body?: string) => unknown;
}

/** Send any value as a JSON response body. */
function json(res: JsonResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Last client-half diagnostic payload (undefined until a probe arrives). */
let clientProbe: Record<string, unknown> | undefined;

/** Read the raw body of a node:http request as a string. */
function readBody(req: { on: (ev: string, cb: (chunk?: Buffer) => void) => void }): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk?: Buffer) => { if (chunk) data += chunk.toString(); });
    req.on('end', () => resolve(data));
  });
}

/** Policy snapshot shared verbatim by the health route. */
function policyView(r: ResolvedPluginConfig) {
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
      retainRatio: r.engine.retainRatio,
      headroomTokens: r.engine.headroomTokens,
      maxTokens: r.engine.maxTokens,
      auto: r.engine.auto
    }
  };
}

/**
 * Unwrap one config section. Sections declared `.volatile()` in the schema
 * reach `apply` as refs carrying the current value behind `.get()` (the 0.1.7
 * live-update contract), so every read observes the latest edit without a
 * plugin reload; plain sections pass through unchanged.
 */
function sectionValue<T>(value: unknown): T {
  if (typeof value === 'object' && value !== null && typeof (value as { get?: unknown }).get === 'function') {
    return (value as { get: () => T }).get();
  }
  return value as T;
}

/** Cordis plugin entry. */
export function apply(ctx: Context, config: PluginConfig): void {
  // Runtime override set by the settings panel (POST /config). Merged on top
  // of the Cordis config block so UI changes take effect without a restart.
  let runtimeOverride: Partial<PluginConfigInput> | undefined;

  // Resolve config on every access — volatile sections deliver live refs, so
  // resolution is cheap and always current. A config block that fails
  // validation never crashes an active session's compaction: the last good
  // snapshot stays in force until the block is fixed.
  let lastGood: ResolvedPluginConfig | undefined;
  const resolved = (): ResolvedPluginConfig => {
    const raw: PluginConfigInput = {
      compact: { ...sectionValue(config.compact), ...runtimeOverride?.compact },
      filter: { ...sectionValue(config.filter), ...runtimeOverride?.filter },
      threshold: { ...sectionValue(config.threshold), ...runtimeOverride?.threshold },
      engine: { ...sectionValue(config.engine), ...runtimeOverride?.engine },
    };
    try {
      const next = resolvePluginConfig(raw);
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === undefined) throw error;
      ctx.logger.error(
        'context-distiller: keeping the last good configuration after an invalid config block'
      );
      ctx.logger.error(error);
      return lastGood;
    }
  };

  // 1) Core: dedicated-model rerouting for compaction summaries.
  //    Only needs ctx.llm (in inject). Never touches dshLoader.
  const disposeRouter = installCompactRouter(ctx, resolved);

  // 2) Health smoke route. Configuration happens in the Plugin Manager's
  //    native config form (volatile schema fields, persisted through the
  //    profile patch) or a cordis.patch.yml config block.
  const disposeHealth = ctx.webServer.register({
    kind: 'exact',
    path: `/${PLUGIN_NAME}/health`,
    handler: (_req, res) => {
      json(res, 200, {
        status: 'ok',
        plugin: PLUGIN_NAME,
        ...policyView(resolved()),
        clientProbe,
        uptime: process.uptime()
      });
    }
  });

  // 2b) Client-half diagnostic probe: the browser bundle reports its load
  //     state here so the health route shows whether the plugins-page card
  //     bound (and why not, when it did not).
  const disposeProbe = ctx.webServer.register({
    kind: 'exact',
    path: `/${PLUGIN_NAME}/probe`,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method not allowed' });
        return;
      }
      void readBody(req).then((body) => {
        try {
          clientProbe = JSON.parse(body) as Record<string, unknown>;
        } catch {
          clientProbe = { raw: body.slice(0, 500) };
        }
        json(res, 200, { ok: true });
      });
    }
  });

  // 2c) Settings-panel config routes. GET returns the resolved policy; POST
  //     merges a partial body into the runtime override so changes apply
  //     immediately without a plugin reload.
  const disposeConfig = ctx.webServer.register({
    kind: 'exact',
    path: `/${PLUGIN_NAME}/config`,
    handler: async (req, res) => {
      if (req.method === 'GET') {
        json(res, 200, policyView(resolved()));
        return;
      }
      if (req.method === 'POST') {
        try {
          const text = await readBody(req);
          const body = JSON.parse(text) as Partial<PluginConfigInput>;
          const cur = resolved();
          runtimeOverride = {
            compact: {
              enabled: body.compact?.enabled ?? cur.compact.enabled,
              provider: body.compact?.provider ?? cur.compact.provider,
              model: body.compact?.model ?? cur.compact.model,
            },
            filter: {
              flaggedTurns: body.filter?.flaggedTurns ?? cur.filter.flaggedTurns,
            },
            threshold: {
              wan: body.threshold?.wan ?? cur.threshold.wan,
            },
            engine: {
              enabled: body.engine?.enabled ?? cur.engine.enabled,
              thresholdRatio: body.engine?.thresholdRatio ?? cur.engine.thresholdRatio,
              retainRatio: body.engine?.retainRatio ?? cur.engine.retainRatio,
              headroomTokens: body.engine?.headroomTokens ?? cur.engine.headroomTokens,
              maxTokens: body.engine?.maxTokens ?? cur.engine.maxTokens,
              compactionRetries: body.engine?.compactionRetries ?? cur.engine.compactionRetries,
              maxOverflowRetries: body.engine?.maxOverflowRetries ?? cur.engine.maxOverflowRetries,
              auto: body.engine?.auto ?? cur.engine.auto,
              compressPrompt: body.engine?.compressPrompt ?? cur.engine.compressPrompt,
            },
          };
          const r = resolved();
          ctx.logger.info(
            `context-distiller config updated (router: ${r.compact.enabled ? 'on' : 'off'}, ` +
            `provider: ${r.compact.provider}, model: ${r.compact.model}; ` +
            `flagged-turn filter: ${r.filter.flaggedTurns ? 'on' : 'off'}; ` +
            `threshold: ${r.threshold.wan}wan; engine: ${r.engine.enabled ? 'on' : 'off'})`
          );
          json(res, 200, { ok: true, ...policyView(r) });
        } catch (error) {
          ctx.logger.error('context-distiller: config update failed');
          ctx.logger.error(error);
          json(res, 400, { ok: false, error: (error as Error).message });
        }
        return;
      }
      json(res, 405, { error: 'method not allowed' });
    }
  });

  // 2d) Provider/model directory from ctx.llm, for the settings dropdowns.
  const disposeModels = ctx.webServer.register({
    kind: 'exact',
    path: `/${PLUGIN_NAME}/models`,
    handler: async (_req, res) => {
      try {
        const providers = ctx.llm.listProviders();
        const result: Array<{
          provider: string;
          name: string;
          models: Array<{ id: string; name: string }>;
        }> = [];
        for (const p of providers) {
          try {
            const models = await ctx.llm.listModels(p.id);
            result.push({
              provider: p.id,
              name: p.name,
              models: models.map((m) => ({ id: m.id, name: m.name })),
            });
          } catch {
            result.push({ provider: p.id, name: p.name, models: [] });
          }
        }
        json(res, 200, result);
      } catch (error) {
        json(res, 500, { error: (error as Error).message });
      }
    }
  });

  // Lifecycle cleanup.
  let compressionEngine: CompressEngine | undefined;
  let disposeThreshold: (() => void) | undefined;
  ctx.effect(
    () => () => {
      disposeRouter?.();
      disposeHealth?.();
      disposeProbe?.();
      disposeConfig?.();
      disposeModels?.();
      disposeThreshold?.();
      compressionEngine = undefined;
      clearDshFacade();
    },
    'context-distiller: router, health/probe/config/models routes, threshold patch, and engine lifecycle'
  );

  // 3) Optional explicit-prompt compression engine.
  //    dshLoader is accessed via ctx.get() (not property access, which would
  //    throw without inject). Only touched when engine.enabled is true, so
  //    the core router works even if dshLoader is absent.
  if (resolved().engine.enabled) {
    try {
      const loader = ctx.get('dshLoader') as DshLoaderApi | undefined;
      if (loader === undefined) {
        ctx.logger.warn(
          'context-distiller: engine.enabled is true but @dsh-plugin/dsh-loader is not available; ' +
            'the dedicated-model router remains active, but the explicit-prompt engine was not installed.'
        );
      } else {
        setDshFacade(loader);
        compressionEngine = installCompressionEngine(ctx, resolved);
      }
    } catch (error) {
      ctx.logger.warn(
        'context-distiller: compression engine installation failed; the dedicated-model router remains active.'
      );
      ctx.logger.warn(error);
    }
  }

  // 4) Absolute-threshold patch for a stock (foreign) compaction backend.
  //    Skipped when our own engine owns ctx.compaction — it applies the wan
  //    threshold internally via syncEngineConfig. If engine.enabled was set
  //    but its install failed/skipped, the stock backend (if any) gets the
  //    patch instead.
  if (compressionEngine === undefined) {
    try {
      disposeThreshold = installThresholdPatch(ctx, resolved);
    } catch (error) {
      ctx.logger.warn(
        'context-distiller: compaction threshold patch failed; the stock backend keeps its ratio policy.'
      );
      ctx.logger.warn(error);
    }
  }

  const final = resolved();
  ctx.logger.info(
    `context-distiller loaded (router: ${final.compact.enabled ? 'on' : 'off'}, ` +
    `flagged-turn filter: ${final.filter.flaggedTurns ? 'on' : 'off'}, ` +
    `engine: ${final.engine.enabled ? 'on' : 'off'}, threshold: ${final.threshold.wan}wan)`
  );
}
