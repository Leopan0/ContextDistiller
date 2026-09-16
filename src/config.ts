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
import z from 'schemastery';

/**
 * Stable plugin id: the cordis plugin name, the npm package name, the bundle
 * patch id, and the HTTP route prefix — all identical by contract.
 */
export const PLUGIN_NAME = 'context-distiller';

/** Default ceiling for one compression (summary) completion, in tokens. */
export const DEFAULT_ENGINE_MAX_TOKENS = 8192;

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

/** Plugin entry / config schema. Defaults live here so config blocks can omit them. */
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
  }),
  filter: z.object({
    flaggedTurns: z
      .boolean()
      .default(false)
      .description(
        'During compaction, drop every message of conversation turns the user flagged with feedback/record (the web "report a problem" / /feedback action) so flagged exchanges never enter the checkpoint summary. Independent of the dedicated-model router.'
      )
  }),
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
    maxTokens: z.number().step(1).min(1).default(DEFAULT_ENGINE_MAX_TOKENS)
      .description('Maximum tokens for one compression completion.'),
    compactionRetries: z.number().step(1).min(0).default(1),
    maxOverflowRetries: z.number().step(1).min(0).default(1),
    auto: z.boolean().default(true).description('Compact automatically on pressure, not only on manual /compact.'),
    compressPrompt: z.string().default(DEFAULT_COMPRESS_PROMPT)
      .description('The explicit instruction appended to the compression call.')
  })
});

/** Inferred plugin configuration value. */
export type PluginConfig = typeof Config extends z<infer T> ? T : never;

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

/** Resolved compression-engine policy. */
export interface ResolvedEngineConfig {
  readonly enabled: boolean;
  readonly thresholdRatio: number;
  readonly retainRatio: number;
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
  readonly engine: ResolvedEngineConfig;
}

/** Recursively freeze a value so resolved snapshots cannot be mutated at runtime. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/**
 * Resolve and validate one untrusted config snapshot into the frozen runtime
 * shape. Throws on mutually-inconsistent values so a bad config fails loudly.
 */
export function resolvePluginConfig(config: PluginConfig): ResolvedPluginConfig {
  const compact = config?.compact ?? {};
  const filter = config?.filter ?? {};
  const engine = config?.engine ?? {};

  const compactProvider = typeof compact.provider === 'string' ? compact.provider : '';
  const compactModel = typeof compact.model === 'string' ? compact.model : '';
  if (Boolean(compactProvider) !== Boolean(compactModel)) {
    throw new Error('context-distiller: compact.provider and compact.model must be set together');
  }

  const thresholdRatio = engine.thresholdRatio ?? 0.8;
  const retainRatio = engine.retainRatio ?? 0.16;
  if (retainRatio >= thresholdRatio) {
    throw new Error('context-distiller: engine.retainRatio must be less than engine.thresholdRatio');
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
    engine: {
      enabled: engine.enabled ?? false,
      thresholdRatio,
      retainRatio,
      maxTokens: engine.maxTokens ?? DEFAULT_ENGINE_MAX_TOKENS,
      compactionRetries: engine.compactionRetries ?? 1,
      maxOverflowRetries: engine.maxOverflowRetries ?? 1,
      auto: engine.auto ?? true,
      compressPrompt
    }
  });
}

export { Config };
