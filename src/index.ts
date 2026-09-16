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

export { Config, PLUGIN_NAME, resolvePluginConfig } from './config.js';
export { installCompactRouter, compactRoute } from './compact-router.js';
export { installCompressionEngine, type CompressEngine } from './compress-engine.js';

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
      const r = resolved();
      const body = JSON.stringify({
        status: 'ok',
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
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
    }
  });

  // GET returns current config; POST updates runtime override. Same path,
  // dispatched by method — webServer.register rejects duplicate exact routes.
  const disposeConfig = ctx.webServer.register({
    kind: 'exact',
    path: `/${PLUGIN_NAME}/config`,
    handler: async (req, res) => {
      if (req.method === 'GET') {
        const r = resolved();
        const body = JSON.stringify({
          compact: { enabled: r.compact.enabled, provider: r.compact.provider, model: r.compact.model },
          filter: { flaggedTurns: r.filter.flaggedTurns },
          engine: { enabled: r.engine.enabled, thresholdRatio: r.engine.thresholdRatio, retainRatio: r.engine.retainRatio }
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(body);
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
          };
          lastRaw = undefined; // force re-resolve
          const r = resolved();
          ctx.logger.info(
            `context-distiller config updated (router: ${r.compact.enabled ? 'on' : 'off'}, ` +
            `provider: ${r.compact.provider}, model: ${r.compact.model}; ` +
            `flagged-turn filter: ${r.filter.flaggedTurns ? 'on' : 'off'})`
          );
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, compact: r.compact, filter: r.filter }));
        } catch (error) {
          ctx.logger.error('context-distiller: config update failed');
          ctx.logger.error(error);
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
        }
        return;
      }
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end('{"error":"method not allowed"}');
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
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    }
  });

  // Lifecycle cleanup.
  let compressionEngine: CompressEngine | undefined;
  ctx.effect(
    () => () => {
      disposeRouter?.();
      disposeHealth?.();
      disposeConfig?.();
      disposeModels?.();
      compressionEngine = undefined;
      clearDshFacade();
    },
    'context-distiller: router, health/config/models routes, and engine lifecycle'
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

  ctx.logger.info(
    `context-distiller loaded (router: ${resolved().compact.enabled ? 'on' : 'off'}, ` +
    `flagged-turn filter: ${resolved().filter.flaggedTurns ? 'on' : 'off'}, engine: ${
      resolved().engine.enabled ? 'on' : 'off'
    })`
  );
}
