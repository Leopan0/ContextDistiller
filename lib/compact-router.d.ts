/**
 * Dedicated-model routing and flagged-turn filtering for context compaction.
 *
 * A single `llm/stream` waterfall listener handles two independent layers,
 * both scoped to calls classified with `purpose: 'compaction'`:
 *
 *   1. Flagged-turn filter (optional, `filter.flaggedTurns`): removes the
 *      messages of conversation turns containing an answer the user rated
 *      negative (`feedback/message-put`) from the summarization input, so a
 *      bad exchange never enters the checkpoint summary. Works with the stock
 *      dsh-compaction-basic backend AND the plugin's own engine.
 *   2. Dedicated-model router (optional, `compact.enabled`): reroutes the
 *      call to the configured dedicated summarizer pair, leaving the
 *      conversation model route untouched.
 *
 * When neither layer activates the listener is a pure pass-through. Both
 * layers are independent: filtering works without a dedicated model and vice
 * versa.
 *
 * Re-entry guard: whenever the options are altered we re-enter
 * `ctx.llm.stream` with a symbol marker so the listener's own re-dispatch is
 * recognized and passed straight through `next()` (preventing a loop).
 *
 * @module context-distiller/compact-router
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedPluginConfig } from './config.js';
/** The configured dedicated summarizer route, or undefined when routing is off. */
export declare function compactRoute(get: () => ResolvedPluginConfig): {
    provider: string;
    model: string;
} | undefined;
/**
 * Install the compaction filter + rerouting middleware. Returns a disposer
 * that removes the listener.
 */
export declare function installCompactRouter(ctx: Context, get: () => ResolvedPluginConfig): () => void;
