/**
 * Shared absolute-threshold (wan) conversion used by both compaction paths.
 *
 * dsh-compaction-basic only accepts a ratio-based trigger
 * (`thresholdRatio` x contextWindow). This module converts a user-facing
 * absolute budget in 10k-token units (wan) into the equivalent ratio plus an
 * absolute retention budget, resolved per routed model at check time —
 * preserving the backend's entire compaction pipeline (locking, range
 * selection, overflow recovery).
 *
 * @module context-distiller/threshold
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from '@deepseek-ai/dsh-compaction-basic';
import type { Agent } from '@deepseek-ai/dsh-agent';

/** The stock backend's default retention fraction (DEFAULT_RETAIN_RATIO). */
export const STOCK_RETAIN_RATIO = 0.16;

/** Tokens per unit of the user-facing threshold setting. */
export const WAN_TOKENS = 10_000;

/** Structural mirror of the routed provider/model pair. */
export interface RouteTarget {
  readonly provider: string;
  readonly model: string;
}

/** One model's converted absolute-threshold policy. */
export interface ThresholdPlan {
  /** Ratio form fed to the backend's `thresholdRatio`. */
  readonly thresholdRatio: number;
  /** Absolute recent-context budget; overrides any ratio retention. */
  readonly retainTokens: number;
  /** True when the requested budget reached the window and was clamped to it. */
  readonly clamped: boolean;
}

/**
 * Convert an absolute wan budget into a backend policy for one window.
 * Retention keeps half the budget or the stock 16% headroom, whichever is
 * smaller — always strictly below the threshold, so the backend's
 * `retainTokens >= thresholdTokens` invariant can never trip.
 */
export function planThreshold(wan: number, contextWindow: number): ThresholdPlan {
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

/** Read the durable routed provider/model pair off a session (structural mirror of `routedTarget`). */
export function sessionTarget(session: unknown): RouteTarget | undefined {
  const header = (
    session as { requestHeader?: () => { config?: { provider?: string; model?: string } } } | undefined
  )?.requestHeader?.();
  const config = header?.config;
  if (!config?.provider?.length || !config?.model?.length) return undefined;
  return { provider: config.provider, model: config.model };
}

/** Resolve the conversation target: routed history first, agent fallback second. */
export function agentTarget(agent: Agent): RouteTarget | undefined {
  const routed = sessionTarget(agent.session);
  if (routed !== undefined) return routed;
  const options = (agent as { options?: { provider?: string; model?: string } }).options;
  if (!options?.provider?.length || !options?.model?.length) return undefined;
  return { provider: options.provider, model: options.model };
}

/** Process-lifetime warn-once dedupe, keyed by message (few distinct keys). */
const warned = new Set<string>();
function warnOnce(ctx: Context, message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  ctx.logger.warn(message);
}

/**
 * Build the backend config for one check: the original policy untouched when
 * the wan threshold is unset (<= 0) or the target/window cannot be resolved,
 * otherwise the original with the absolute threshold spliced in.
 * `retainTokens` takes precedence over any ratio retention inside the
 * backend, per its own target-policy resolution.
 */
export async function thresholdAdjustedConfig(
  ctx: Context,
  agent: Agent,
  wan: number,
  original: ResolvedConfig,
  signal?: AbortSignal
): Promise<ResolvedConfig> {
  if (wan <= 0) return original;
  const target = agentTarget(agent);
  if (target === undefined) return original;
  try {
    const info = (await ctx.llm.resolveModelInfo(target.provider, target.model, signal)) as
      | { context?: { contextWindow?: number } }
      | undefined;
    const contextWindow = info?.context?.contextWindow;
    if (typeof contextWindow !== 'number' || !(contextWindow > 0)) return original;
    const plan = planThreshold(wan, contextWindow);
    if (plan.clamped) {
      warnOnce(
        ctx,
        `context-distiller: threshold ${wan}wan (${wan * WAN_TOKENS} tokens) covers the whole ` +
          `${contextWindow}-token window of ${target.provider}/${target.model}; ` +
          'compaction will only trigger at a full window'
      );
    }
    return {
      ...original,
      thresholdRatio: plan.thresholdRatio,
      retainTokens: plan.retainTokens
    } as ResolvedConfig;
  } catch (error) {
    warnOnce(
      ctx,
      `context-distiller: threshold lookup for ${target.provider}/${target.model} failed ` +
        `(${error instanceof Error ? error.message : String(error)}); ` +
        'this check uses the backend ratio policy'
    );
    return original;
  }
}
