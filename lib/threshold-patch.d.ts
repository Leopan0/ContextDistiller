/**
 * Runtime patch for a foreign (stock) compaction backend: wraps the live
 * `ctx.compaction` service's `compactIfNeeded` so every pressure check first
 * converts the absolute wan threshold into the routed model's ratio form and
 * swaps the backend's `config` — without replacing the engine or its
 * registered listeners.
 *
 * This works because the stock backend re-reads `this.config` on every check
 * (`resolveTargetPolicy(this.config, target)`) and dispatches
 * `compactIfNeeded` dynamically, so an instance-own wrapper plus a config
 * swap is sufficient and fully reversible on dispose.
 *
 * @module context-distiller/threshold-patch
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedPluginConfig } from './config.js';
/**
 * Patch the stock compaction backend in place. Returns a dispose function
 * that restores the original dynamic dispatch, or undefined when no
 * patchable `ctx.compaction` service exists.
 */
export declare function installThresholdPatch(ctx: Context, get: () => ResolvedPluginConfig): (() => void) | undefined;
