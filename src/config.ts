/**
 * ContextDistiller plugin configuration: schemastery schema, runtime
 * validation, and the resolved/frozen snapshot consumed by the router and the
 * optional compression engine.
 *
 * The same schema backs the `cordis.yml` / bundle-patch `config:` block, so the
 * shape is identical whether defaults come from `cordis.patch.yml` or a profile
 * override.
 *
 * @module context-distiller/config
 */
import z from '@deepseek-ai/schemastery';
import { deepFreeze } from './dsh.js';

/**
 * Stable plugin id: the cordis plugin name, the npm package name, the bundle
 * patch id, and the HTTP route prefix — all identical by contract.
 */
export const PLUGIN_NAME = 'context-distiller';

/** Default ceiling for one compression (summary) completion, in tokens. */
export const DEFAULT_ENGINE_MAX_TOKENS = 8192;

/** Default pressure headroom the backend reserves beyond the output budget. */
export const DEFAULT_ENGINE_HEADROOM_TOKENS = 65_536;

/**
 * The default context-compression instruction used by the optional engine.
 * It asks the dedicated model for a structured, lossless-as-possible resume
 * checkpoint rather than a loose prose summary.
 */
export const DEFAULT_COMPRESS_PROMPT = [
  'You are a context-compression engine for an AI coding assistant. Condense the conversation above into a structured checkpoint that lets another model resume the work with no loss of essential context.',
  '',
  'Output EXACTLY the Markdown structure below, keeping every section in order with terse bullets:',
  '- ## Primary Request and Intent (quote verbatim where wording matters)',
  '- ## Key Technical Concepts',
  '- ## Files and Code (exact paths, key changes or snippets)',
  '- ## Errors and Fixes',
  '- ## Pending Jobs',
  '- ## Current Work',
  '- ## Next Step (the single next action, or (none))',
  '- ## Critical Context (decisions, constraints, user preferences, open questions)',
  '',
  'Rules: preserve exact paths, commands, identifiers, numbers, and syntax fragments; capture user corrections faithfully; do not mention this compression request; output only the checkpoint text.'
].join('\n');

/** Plugin entry / config schema. Defaults live here so config blocks can omit them.
 *
 * Every section is declared `.volatile()`: the 0.1.7 settings architecture
 * projects volatile fields into the Plugin Manager / web settings forms, and a
 * volatile-only edit keeps the running plugin instance alive. The instance
 * reads current values lazily through the delivered refs (see `apply`), so a
 * form edit applies immediately and persists through the profile patch.
 */
const Config = z.object({
  compact: z.object({
    enabled: z
      .boolean()
      .default(false)
      .description(
        'Route context-compaction summary calls (GenerateOptions.purpose = "compaction") to a dedicated provider/model pair, leaving the conversation model untouched.'
      ),
    provider: z
      .string()
      .description('An already-configured provider route used for compaction summaries.'),
    model: z
      .string()
      .description('The provider-owned model id used for compaction summaries.')
  }).default({ enabled: false, provider: '', model: '' }).volatile(),
  filter: z.object({
    flaggedTurns: z
      .boolean()
      .default(false)
      .description(
        'During compaction, drop every message of the conversation turn containing an answer the user rated negative (the message thumbs-down / feedback/message-put event) so the flagged exchange never enters the checkpoint summary. Independent of the dedicated-model router.'
      )
  }).default({ flaggedTurns: false }).volatile(),
  threshold: z.object({
    wan: z.number().step(1).min(0).max(100).default(0).description(
      'Absolute compaction trigger in 10k-token units (wan), converted per routed model at check time. ' +
      '0 (default) keeps the compaction backend ratio policy untouched; 1-100 spans 10k-1M tokens, ' +
      'e.g. 8 compacts once measured context reaches 80000 tokens. Clamped to the model window when ' +
      'larger. The backend additionally caps pressure below its reserved output budget and ' +
      'headroomTokens, so the effective trigger can land earlier than this value. A backend ' +
      'modelPolicies entry with its own thresholdRatio still takes precedence.'
    )
  }).default({ wan: 0 }).volatile(),
  engine: z.object({
    enabled: z
      .boolean()
      .default(false)
      .description(
        'Replace the stock dsh-compaction-basic backend with an explicit context-compression prompt engine. Mutually exclusive with dsh-compaction-basic (both provide ctx.compaction).'
      ),
    thresholdRatio: z.number().step(0.01).min(0.01).max(0.99).default(0.8)
      .description('Compact when context pressure reaches this fraction of the window.'),
    retainRatio: z.number().step(0.01).min(0.01).max(0.99).default(0.16)
      .description('Fraction of the window guaranteed to remain headroom after compaction.'),
    headroomTokens: z.number().step(1).min(0).default(DEFAULT_ENGINE_HEADROOM_TOKENS)
      .description(
        'Additional pressure headroom (tokens) reserved beyond the routed output reservation; the backend caps the pressure threshold below window minus this budget.'
      ),
    maxTokens: z.number().step(1).min(1).default(DEFAULT_ENGINE_MAX_TOKENS)
      .description('Maximum tokens for one compression completion.'),
    compactionRetries: z.number().step(1).min(0).default(1),
    maxOverflowRetries: z.number().step(1).min(0).default(1),
    auto: z.boolean().default(true).description('Compact automatically on pressure, not only on manual /compact.'),
    compressPrompt: z.string().default(DEFAULT_COMPRESS_PROMPT)
      .description('The explicit instruction appended to the compression call.')
  }).default({
    enabled: false,
    thresholdRatio: 0.8,
    retainRatio: 0.16,
    headroomTokens: DEFAULT_ENGINE_HEADROOM_TOKENS,
    maxTokens: DEFAULT_ENGINE_MAX_TOKENS,
    compactionRetries: 1,
    maxOverflowRetries: 1,
    auto: true,
    compressPrompt: DEFAULT_COMPRESS_PROMPT
  }).volatile()
});

/** Inferred plugin configuration value: sections declared `.volatile()` are
 * delivered to `apply` as loader refs carrying the live value behind `.get()`. */
export type PluginConfig = typeof Config extends z<infer T> ? T : never;

/** Unwrap one `.volatile()` section ref to its plain snapshot value. */
type UnwrapSection<S> = S extends { get(): infer V } ? V : S;

/** Plain (ref-unwrapped) config sections accepted by resolvePluginConfig. */
export type PluginConfigInput = { [K in keyof PluginConfig]: UnwrapSection<PluginConfig[K]> };

/** Resolved compaction-routing policy (the dedicated summarizer route). */
export interface ResolvedCompactConfig {
  readonly enabled: boolean;
  readonly provider: string;
  readonly model: string;
}

/** Resolved compaction-filter policy. */
export interface ResolvedFilterConfig {
  readonly flaggedTurns: boolean;
}

/** Resolved absolute-threshold policy (units of 10k tokens; 0 = untouched). */
export interface ResolvedThresholdConfig {
  readonly wan: number;
}

/** Resolved compression-engine policy. */
export interface ResolvedEngineConfig {
  readonly enabled: boolean;
  readonly thresholdRatio: number;
  readonly retainRatio: number;
  readonly headroomTokens: number;
  readonly maxTokens: number;
  readonly compactionRetries: number;
  readonly maxOverflowRetries: number;
  readonly auto: boolean;
  readonly compressPrompt: string;
}

/** The complete resolved, frozen plugin snapshot. */
export interface ResolvedPluginConfig {
  readonly compact: ResolvedCompactConfig;
  readonly filter: ResolvedFilterConfig;
  readonly threshold: ResolvedThresholdConfig;
  readonly engine: ResolvedEngineConfig;
}

/** Ratio-policy fields shared verbatim by the engine constructor config and the per-check refresh. */
export interface EngineRatioPolicy {
  readonly thresholdRatio: number;
  readonly retainRatio: number;
  readonly headroomTokens: number;
  readonly maxTokens: number;
  readonly compactionRetries: number;
  readonly maxOverflowRetries: number;
  readonly auto: boolean;
}

/** Map the resolved engine policy onto the backend's config vocabulary. */
export function engineRatioPolicy(engine: ResolvedEngineConfig): EngineRatioPolicy {
  return {
    thresholdRatio: engine.thresholdRatio,
    retainRatio: engine.retainRatio,
    headroomTokens: engine.headroomTokens,
    maxTokens: engine.maxTokens,
    compactionRetries: engine.compactionRetries,
    maxOverflowRetries: engine.maxOverflowRetries,
    auto: engine.auto
  };
}

/**
 * Resolve and validate one untrusted config snapshot into the frozen runtime
 * shape. Throws on mutually-inconsistent values so a bad config fails loudly.
 */
export function resolvePluginConfig(config: PluginConfigInput): ResolvedPluginConfig {
  const compact = config?.compact ?? {};
  const filter = config?.filter ?? {};
  const threshold = config?.threshold ?? {};
  const engine = config?.engine ?? {};

  const compactProvider = typeof compact.provider === 'string' ? compact.provider : '';
  const compactModel = typeof compact.model === 'string' ? compact.model : '';
  if (Boolean(compactProvider) !== Boolean(compactModel)) {
    throw new Error('context-distiller: compact.provider and compact.model must be set together');
  }

  const thresholdWan = threshold.wan ?? 0;
  if (!Number.isInteger(thresholdWan) || thresholdWan < 0 || thresholdWan > 100) {
    throw new Error(
      'context-distiller: threshold.wan must be an integer between 0 and 100 (units of 10000 tokens)'
    );
  }

  const thresholdRatio = engine.thresholdRatio ?? 0.8;
  const retainRatio = engine.retainRatio ?? 0.16;
  if (retainRatio >= thresholdRatio) {
    throw new Error('context-distiller: engine.retainRatio must be less than engine.thresholdRatio');
  }

  const headroomTokens = engine.headroomTokens ?? DEFAULT_ENGINE_HEADROOM_TOKENS;
  if (!Number.isInteger(headroomTokens) || headroomTokens < 0) {
    throw new Error('context-distiller: engine.headroomTokens must be a non-negative integer');
  }

  const compressPrompt =
    typeof engine.compressPrompt === 'string' && engine.compressPrompt.length > 0
      ? engine.compressPrompt
      : DEFAULT_COMPRESS_PROMPT;

  return deepFreeze({
    compact: {
      enabled: compact.enabled ?? false,
      provider: compactProvider,
      model: compactModel
    },
    filter: {
      flaggedTurns: filter.flaggedTurns ?? false
    },
    threshold: {
      wan: thresholdWan
    },
    engine: {
      enabled: engine.enabled ?? false,
      thresholdRatio,
      retainRatio,
      headroomTokens,
      maxTokens: engine.maxTokens ?? DEFAULT_ENGINE_MAX_TOKENS,
      compactionRetries: engine.compactionRetries ?? 1,
      maxOverflowRetries: engine.maxOverflowRetries ?? 1,
      auto: engine.auto ?? true,
      compressPrompt
    }
  });
}

export { Config };
