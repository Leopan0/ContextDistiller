/**
 * Optional dedicated compression engine: a {@link BasicCompactionEngine}
 * subclass whose single customization hook (`summarize`) is overridden to
 * (a) route the summary call to the configured dedicated model pair and
 * (b) drive it with an explicit context-compression instruction instead of the
 * backend's default summarization prompt.
 *
 * Mutually exclusive with the stock `dsh-compaction-basic` backend: both
 * provide `ctx.compaction`. When the dedicated route is not configured the
 * override falls back to the base implementation, so it degrades gracefully.
 *
 * @module context-distiller/compress-engine
 */
import type { Context } from '@deepseek-ai/cordis';
import type { CompactionResult, CompactionTrigger } from '@deepseek-ai/dsh-compaction';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type ResolvedPluginConfig } from './config.js';
/**
 * Instance surface of the compression engine.
 *
 * Exported as an INTERFACE rather than a class type because the class itself is
 * built lazily (see {@link compressEngineClass}): its base class is a
 * module-level export of `@deepseek-ai/dsh-compaction-basic` that dshloader
 * only resolves at boot, so `class X extends Base` cannot be evaluated at
 * module scope.
 */
export interface CompressEngine {
    compactIfNeeded(agent: Agent, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null>;
}
/**
 * Install the engine unless `ctx.compaction` is already provided (e.g. by
 * dsh-compaction-basic). Returns undefined when skipped.
 */
export declare function installCompressionEngine(ctx: Context, get: () => ResolvedPluginConfig): CompressEngine | undefined;
