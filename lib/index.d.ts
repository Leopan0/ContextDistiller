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
import { type PluginConfig } from './config.js';
export { Config, PLUGIN_NAME, resolvePluginConfig } from './config.js';
export { installCompactRouter, compactRoute } from './compact-router.js';
export { installCompressionEngine, type CompressEngine } from './compress-engine.js';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "context-distiller";
/**
 * Services this entry accesses via `ctx`.
 *
 * - `llm`: the model seam the waterfall listener hooks and streams through.
 * - `webServer`: hosts the `/context-distiller/health` smoke route.
 *
 * `dshLoader` is deliberately NOT required: the core router has no module-level
 * dsh dependency. It is probed optionally via `ctx.get` for the engine.
 */
export declare const inject: string[];
/** Cordis plugin entry. */
export declare function apply(ctx: Context, config: PluginConfig): void;
