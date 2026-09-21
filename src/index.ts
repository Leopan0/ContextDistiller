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
  type ResolvedPluginConfig
} from './config.js';
import { installCompactRouter } from './compact-router.js';
import { type CompressEngine, installCompressionEngine } from './compress-engine.js';
import { clearDshFacade, setDshFacade, type DshFacade } from './dsh.js';
import { installThresholdPatch } from './threshold-patch.js';

export { Config, PLUGIN_NAME, resolvePluginConfig } from './config.js';
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
 * - `sessions`: resolves the live session of a compaction call so flagged
 *   turns (`feedback/record`) can be filtered out of the summarization input.
 *
 * `dshLoader` is deliberately NOT required: the core router has no module-level
 * dsh dependency. It is probed optionally via `ctx.get` for the engine.
 */
export const inject = ['llm', 'webServer', 'sessions'];

/** Structural shape of `ctx.dshLoader`; only populated when dsh-loader is installed. */
interface DshLoaderApi extends DshFacade {}

/** Read the raw body of a node:http request as a string. */
function readBody(req: { on: (ev: string, cb: (chunk?: Buffer) => void) => void }): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk?: Buffer) => { if (chunk) data += chunk.toString(); });
    req.on('end', () => resolve(data));
  });
}

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

/** Policy snapshot shared verbatim by the health and config GET routes. */
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
      retainRatio: r.engine.retainRatio
    }
  };
}

/** Cordis plugin entry. */
export function apply(ctx: Context, config: PluginConfig): void {
  // Runtime override set by the settings panel (POST /config). Merged on top
  // of the Cordis config block so UI changes take effect without a restart.
  let runtimeOverride: Partial<PluginConfig> | undefined;

  // Resolve config with a last-good cache so a later invalid config block never
  // crashes an active session's compaction.
  let lastRaw: PluginConfig | undefined;
  let lastGood: ResolvedPluginConfig | undefined;
  const resolved = (): ResolvedPluginConfig => {
    const raw: PluginConfig = { ...config, ...runtimeOverride,
      compact: { ...config.compact, ...runtimeOverride?.compact },
      filter: { ...config.filter, ...runtimeOverride?.filter },
      threshold: { ...config.threshold, ...runtimeOverride?.threshold },
      engine: { ...config.engine, ...runtimeOverride?.engine },
    };
    if (raw === lastRaw && lastGood !== undefined) return lastGood;
    try {
      const next = resolvePluginConfig(raw);
      lastRaw = raw;
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === undefined) throw error;
      lastRaw = raw;
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

  // 2) Health smoke route + config read/write routes.
  //    All use the raw node:http handler shape (kind/path/handler).
  const disposeHealth = ctx.webServer.register({
    kind: 'exact',
    path: `/${PLUGIN_NAME}/health`,
    handler: (_req, res) => {
      json(res, 200, {
        status: 'ok',
        plugin: PLUGIN_NAME,
        ...policyView(resolved()),
        uptime: process.uptime()
      });
    }
  });

  // GET returns current config; POST updates runtime override. Same path,
  // dispatched by method — webServer.register rejects duplicate exact routes.
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
          const body = JSON.parse(text) as Partial<PluginConfig>;
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
          };
          lastRaw = undefined; // force re-resolve
          const r = resolved();
          ctx.logger.info(
            `context-distiller config updated (router: ${r.compact.enabled ? 'on' : 'off'}, ` +
            `provider: ${r.compact.provider}, model: ${r.compact.model}; ` +
            `flagged-turn filter: ${r.filter.flaggedTurns ? 'on' : 'off'}; ` +
            `threshold: ${r.threshold.wan}wan)`
          );
          json(res, 200, { ok: true, compact: r.compact, filter: r.filter, threshold: r.threshold });
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

  // GET /context-distiller/models → provider/model directory from ctx.llm.
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
            // Provider might error on listModels; include it with empty models.
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
      disposeConfig?.();
      disposeModels?.();
      disposeThreshold?.();
      compressionEngine = undefined;
      clearDshFacade();
    },
    'context-distiller: router, health/config/models routes, threshold patch, and engine lifecycle'
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
