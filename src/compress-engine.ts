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
import type { BasicCompactionConfig, ResolvedConfig } from '@deepseek-ai/dsh-compaction-basic';
import type { CompactionResult, CompactionTrigger } from '@deepseek-ai/dsh-compaction';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock, Message, TokenUsage, ToolSchema } from '@deepseek-ai/dsh-llm';
import { dsh, llm } from './dsh.js';
import { PLUGIN_NAME, engineRatioPolicy, type ResolvedPluginConfig } from './config.js';
import { compactRoute } from './compact-router.js';
import { thresholdAdjustedConfig } from './threshold.js';

/** Structural mirror of the base hook's input type. */
interface CompressInput {
  readonly system?: string;
  readonly tools?: readonly ToolSchema[];
  readonly messages: readonly Message[];
}

/** Structural mirror of the base hook's result type. */
type CompressResult = {
  summary: ContentBlock[];
  provider: string;
  model: string;
  maxTokens?: number;
  usage?: TokenUsage;
} & (
  | { rawOutput: ContentBlock[]; llmStreamCall: true }
  | { rawOutput?: ContentBlock[]; llmStreamCall?: never }
);

/** Map a terminal summarization finish to its fail-closed error. */
function finishError(finish: {
  kind: string;
  failure?: { message: string; code: string };
}): Error | undefined {
  switch (finish.kind) {
    case 'stop':
      return undefined;
    case 'error':
    case 'aborted': {
      const error = new Error(finish.failure?.message ?? 'compression call failed');
      (error as Error & { code?: string }).code = finish.failure?.code;
      return error;
    }
    case 'max-tokens':
      return new Error('context-distiller: compression output reached maxTokens');
    case 'tool-calls':
      return new Error('context-distiller: compression model unexpectedly requested a tool');
    default:
      return new Error(`context-distiller: unsupported finish reason "${String(finish.kind)}"`);
  }
}

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
  compactIfNeeded(
    agent: Agent,
    trigger: CompactionTrigger,
    signal: AbortSignal
  ): Promise<CompactionResult | null>;
}

/** Cached lazily-built class, so repeated installs reuse one constructor. */
let CompressEngineClass:
  | (new (
      ctx: Context,
      config: BasicCompactionConfig | undefined,
      compressPrompt: string,
      auxRoute: () => { provider: string; model: string } | undefined,
      getConfig: () => ResolvedPluginConfig
    ) => CompressEngine)
  | undefined;

/**
 * Build (once) the engine class on top of dsh's `BasicCompactionEngine`.
 * The base class arrives through `ctx.dshLoader.dsh.compaction`, which is only
 * populated after `apply` — hence the deferral.
 */
function compressEngineClass(): NonNullable<typeof CompressEngineClass> {
  if (CompressEngineClass !== undefined) return CompressEngineClass;
  const Base = dsh().compaction.BasicCompactionEngine;

  class CompressEngineImpl extends Base {
    private readonly compressPrompt: string;
    private readonly auxRoute: () => { provider: string; model: string } | undefined;
    private readonly getConfig: () => ResolvedPluginConfig;

    constructor(
      ctx: Context,
      config: BasicCompactionConfig | undefined,
      compressPrompt: string,
      auxRoute: () => { provider: string; model: string } | undefined,
      getConfig: () => ResolvedPluginConfig
    ) {
      super(ctx, config);
      this.compressPrompt = compressPrompt;
      this.auxRoute = auxRoute;
      this.getConfig = getConfig;
    }

    /**
     * Refresh the pressure policy right before a check so config edits to the
     * threshold apply without rebuilding the engine. When the absolute wan
     * threshold is set it is converted for the routed model on every check;
     * otherwise the engine's own ratio policy applies unchanged.
     */
    private async syncEngineConfig(agent: Agent): Promise<void> {
      const resolved = this.getConfig();
      const base: ResolvedConfig = {
        ...engineRatioPolicy(resolved.engine),
        summarizationProvider: '',
        summarizationModel: '',
        modelPolicies: []
      };
      // No-op while threshold.wan is 0; otherwise converts for the routed model.
      this.config = await thresholdAdjustedConfig(this.ctx, agent, resolved.threshold.wan, base);
    }

    async compactIfNeeded(
      agent: Agent,
      trigger: CompactionTrigger,
      signal: AbortSignal
    ): Promise<CompactionResult | null> {
      await this.syncEngineConfig(agent);
      return super.compactIfNeeded(agent, trigger, signal);
    }

    protected async summarize(
      input: CompressInput,
      agent: Agent,
      signal?: AbortSignal
    ): Promise<CompressResult> {
      const route = this.auxRoute();
      if (route === undefined) {
        // No dedicated route: keep the stock behavior untouched.
        return super.summarize(input, agent, signal);
      }

      const messages = [
        ...input.messages,
        llm().createUserMessage({
          content: [{ type: 'text', text: this.compressPrompt }],
          source: { kind: 'plugin', plugin: PLUGIN_NAME }
        })
      ];

      const assembler = new (dsh().llm.BlockAssembler)();
      for await (const chunk of this.ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        messages,
        ...(input.system !== undefined ? { system: input.system } : {}),
        ...(input.tools !== undefined ? { tools: [...input.tools] } : {}),
        maxTokens: this.config.maxTokens,
        sessionId: agent.session.id,
        purpose: 'compaction',
        ...(signal !== undefined ? { signal } : {})
      })) {
        assembler.push(chunk);
      }

      const terminalError = finishError(assembler.finish);
      if (terminalError !== undefined) throw terminalError;

      const rawOutput = assembler.blocks();
      const summary = rawOutput.filter(
        (block: ContentBlock): block is Extract<ContentBlock, { type: 'text' }> =>
          block.type === 'text'
      );
      if (!summary.some((block) => block.text.trim().length > 0)) {
        throw new Error('context-distiller: compression produced no text summary content');
      }

      return {
        summary,
        rawOutput,
        llmStreamCall: true,
        provider: route.provider,
        model: route.model,
        maxTokens: this.config.maxTokens,
        ...(assembler.usage !== undefined ? { usage: assembler.usage } : {})
      };
    }
  }

  CompressEngineClass = CompressEngineImpl as unknown as NonNullable<
    typeof CompressEngineClass
  >;
  return CompressEngineClass;
}

/**
 * Install the engine unless `ctx.compaction` is already provided (e.g. by
 * dsh-compaction-basic). Returns undefined when skipped.
 */
export function installCompressionEngine(
  ctx: Context,
  get: () => ResolvedPluginConfig
): CompressEngine | undefined {
  if (ctx.get('compaction') !== undefined) {
    ctx.logger.warn(
      'context-distiller: compression engine skipped — ctx.compaction is already provided ' +
        '(likely by dsh-compaction-basic). The dedicated-model router still works; remove the stock ' +
        'compaction plugin only if you want this explicit-prompt engine to own compaction.'
    );
    return undefined;
  }

  const engine = get().engine;
  return new (compressEngineClass())(
    ctx,
    engineRatioPolicy(engine),
    engine.compressPrompt,
    () => compactRoute(get),
    get
  );
}
