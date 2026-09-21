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
export declare const STOCK_RETAIN_RATIO = 0.16;
/** Tokens per unit of the user-facing threshold setting. */
export declare const WAN_TOKENS = 10000;
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
export declare function planThreshold(wan: number, contextWindow: number): ThresholdPlan;
/** Read the durable routed provider/model pair off a session (structural mirror of `routedTarget`). */
export declare function sessionTarget(session: unknown): RouteTarget | undefined;
/** Resolve the conversation target: routed history first, agent fallback second. */
export declare function agentTarget(agent: Agent): RouteTarget | undefined;
/**
 * Build the backend config for one check: the original policy untouched when
 * the wan threshold is unset (<= 0) or the target/window cannot be resolved,
 * otherwise the original with the absolute threshold spliced in.
 * `retainTokens` takes precedence over any ratio retention inside the
 * backend, per its own target-policy resolution.
 */
export declare function thresholdAdjustedConfig(ctx: Context, agent: Agent, wan: number, original: ResolvedConfig, signal?: AbortSignal): Promise<ResolvedConfig>;
