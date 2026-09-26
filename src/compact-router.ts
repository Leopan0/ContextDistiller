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
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm';
import { deepFreeze } from './dsh.js';
import { collectFlaggedMessageIds, filterFlaggedMessages, type FilterableSession } from './flagged-filter.js';
import type { ResolvedPluginConfig } from './config.js';

/**
 * Marker stamped on options this listener itself re-dispatches. Registered
 * process-wide (`Symbol.for`) so the guard survives any module duplication.
 */
const REENTRY_MARKER: unique symbol = Symbol.for('context-distiller.compaction-reentry');

/** Compaction options plus our internal re-entry marker. */
type RouterOptions = GenerateOptions & { [REENTRY_MARKER]?: true };

/** Structural shape of the session store this layer needs. */
interface SessionLookup {
  sessions?: {
    get(id: string): FilterableSession | undefined;
  };
}

/** The configured dedicated summarizer route, or undefined when routing is off. */
export function compactRoute(
  get: () => ResolvedPluginConfig
): { provider: string; model: string } | undefined {
  const compact = get().compact;
  if (!compact.enabled || compact.provider.length === 0 || compact.model.length === 0) {
    return undefined;
  }
  return { provider: compact.provider, model: compact.model };
}

/**
 * Apply the flagged-turn filter to one compaction call's options. Returns a
 * new options object when at least one flagged message was removed, otherwise
 * the same object. Failures fail OPEN (no filtering, normal compaction).
 */
function applyFlaggedFilter(
  ctx: Context,
  options: RouterOptions
): RouterOptions {
  if (typeof options.sessionId !== 'string' || !Array.isArray(options.messages)) return options;
  const sessions = (ctx as Context & SessionLookup).sessions;
  if (sessions === undefined) return options;

  let session: FilterableSession | undefined;
  try {
    session = sessions.get(options.sessionId);
  } catch (error) {
    ctx.logger.warn('context-distiller: session lookup for flagged-turn filtering failed');
    ctx.logger.warn(error);
    return options;
  }
  if (session === undefined) return options;

  try {
    const flagged = collectFlaggedMessageIds(session);
    if (flagged.size === 0) return options;
    const { messages, removed } = filterFlaggedMessages(
      options.messages as readonly Message[],
      flagged
    );
    if (removed === 0) return options;
    ctx.logger.info(
      `context-distiller: filtered ${removed} flagged message(s) out of the compaction input`
    );
    return { ...options, messages };
  } catch (error) {
    ctx.logger.warn('context-distiller: flagged-turn filtering failed; compaction proceeds unfiltered');
    ctx.logger.warn(error);
    return options;
  }
}

/**
 * Install the compaction filter + rerouting middleware. Returns a disposer
 * that removes the listener.
 */
export function installCompactRouter(
  ctx: Context,
  get: () => ResolvedPluginConfig
): () => void {
  return ctx.on(
    'llm/stream',
    (rawOptions: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => {
      const options = rawOptions as RouterOptions;
      // Our own re-dispatch: pass through untouched.
      if (options[REENTRY_MARKER] === true) return next();
      if (options.purpose !== 'compaction') return next();

      let adjusted: RouterOptions | undefined;

      // Layer 1: drop messages of user-flagged conversation turns.
      if (get().filter.flaggedTurns) {
        const filtered = applyFlaggedFilter(ctx, options);
        if (filtered !== options) adjusted = filtered;
      }

      // Layer 2: reroute the (possibly filtered) call to the dedicated model.
      const route = compactRoute(get);
      if (route !== undefined) {
        const target = adjusted ?? options;
        if (target.provider !== route.provider || target.model !== route.model) {
          adjusted = { ...target, provider: route.provider, model: route.model };
        }
      }

      if (adjusted === undefined) return next();
      const rerouted = deepFreeze({ ...adjusted, [REENTRY_MARKER]: true });
      return ctx.llm.stream(rerouted);
    }
  );
}
