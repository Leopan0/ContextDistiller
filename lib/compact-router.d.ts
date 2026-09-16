/**
 * Dedicated-model routing for context compaction.
 *
 * A `llm/stream` waterfall listener: every call classified with
 * `purpose: 'compaction'` (issued by the compaction backend for its summary
 * request) is rerouted to the configured dedicated summarizer pair, while the
 * conversation's own model route stays untouched. This is the core of
 * "compress the context with a separate model" and requires no change to the
 * compaction backend's own configuration.
 *
 * When routing is disabled (or the pair is incomplete) the listener is a pure
 * pass-through.
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
 * Install the compaction rerouting middleware.
 *
 * The waterfall listener returns its own stream when rerouting is needed
 * (guarded against re-entry by the route-match check) and delegates via
 * `next()` otherwise. Returns a disposer that removes the listener.
 */
export declare function installCompactRouter(ctx: Context, get: () => ResolvedPluginConfig): () => void;
