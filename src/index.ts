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
  // Resolve config on every access — volatile sections deliver live refs, so
  // resolution is cheap and always current (edits made in the Plugin Manager's
  // config form apply without a reload). A config block that fails validation
  // never crashes an active session's compaction: the last good snapshot stays
  // in force until the block is fixed.
  let lastGood: ResolvedPluginConfig | undefined;
  const resolved = (): ResolvedPluginConfig => {
    const raw: PluginConfigInput = {
      compact: sectionValue(config.compact),
      filter: sectionValue(config.filter),
      threshold: sectionValue(config.threshold),
      engine: sectionValue(config.engine),
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

  // Lifecycle cleanup.
  let compressionEngine: CompressEngine | undefined;
  let disposeThreshold: (() => void) | undefined;
  ctx.effect(
    () => () => {
      disposeRouter?.();
      disposeHealth?.();
      disposeProbe?.();
      disposeThreshold?.();
      compressionEngine = undefined;
      clearDshFacade();
    },
    'context-distiller: router, health/probe routes, threshold patch, and engine lifecycle'
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
