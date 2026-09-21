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
import type { ResolvedConfig } from '@deepseek-ai/dsh-compaction-basic';
import type { CompactionResult, CompactionTrigger } from '@deepseek-ai/dsh-compaction';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ResolvedPluginConfig } from './config.js';
import { thresholdAdjustedConfig } from './threshold.js';

/** Minimal structural surface of a patchable compaction backend. */
interface PatchableEngine {
  config: ResolvedConfig;
  compactIfNeeded(
    agent: Agent,
    trigger: CompactionTrigger,
    signal: AbortSignal
  ): Promise<CompactionResult | null>;
}

/**
 * Patch the stock compaction backend in place. Returns a dispose function
 * that restores the original dynamic dispatch, or undefined when no
 * patchable `ctx.compaction` service exists.
 */
export function installThresholdPatch(
  ctx: Context,
  get: () => ResolvedPluginConfig
): (() => void) | undefined {
  const candidate: unknown = ctx.get('compaction');
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    typeof (candidate as Partial<PatchableEngine>).compactIfNeeded !== 'function' ||
    (candidate as Partial<PatchableEngine>).config === undefined
  ) {
    if (get().threshold.wan > 0) {
      ctx.logger.warn(
        'context-distiller: threshold.wan is set but no stock compaction backend is present to patch ' +
          '(ctx.compaction is absent); the absolute threshold stays inert.'
      );
    }
    return undefined;
  }
  const engine = candidate as PatchableEngine;

  // Unwrap any wrapper left by a previous plugin life so `original` below is
  // always the prototype method, never a stale closure.
  const hadOwn = Object.prototype.hasOwnProperty.call(engine, 'compactIfNeeded');
  if (hadOwn) {
    delete (engine as { compactIfNeeded?: PatchableEngine['compactIfNeeded'] }).compactIfNeeded;
  }
  const original = engine.compactIfNeeded;

  const wrapper = async (
    agent: Agent,
    trigger: CompactionTrigger,
    signal: AbortSignal
  ): Promise<CompactionResult | null> => {
    // thresholdAdjustedConfig no-ops while wan is 0 (same reference back), so
    // the backend's own ratio policy stays untouched in that case.
    engine.config = await thresholdAdjustedConfig(
      ctx, agent, get().threshold.wan, engine.config, signal
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
    if (
      Object.prototype.hasOwnProperty.call(engine, 'compactIfNeeded') &&
      engine.compactIfNeeded === wrapper
    ) {
      if (hadOwn) engine.compactIfNeeded = original;
      else delete (engine as { compactIfNeeded?: PatchableEngine['compactIfNeeded'] }).compactIfNeeded;
    }
  };
}
