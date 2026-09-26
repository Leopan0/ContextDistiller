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
/**
 * Stable plugin id: the cordis plugin name, the npm package name, the bundle
 * patch id, and the HTTP route prefix — all identical by contract.
 */
export declare const PLUGIN_NAME = "context-distiller";
/** Default ceiling for one compression (summary) completion, in tokens. */
export declare const DEFAULT_ENGINE_MAX_TOKENS = 8192;
/** Default pressure headroom the backend reserves beyond the output budget. */
export declare const DEFAULT_ENGINE_HEADROOM_TOKENS = 65536;
/**
 * The default context-compression instruction used by the optional engine.
 * It asks the dedicated model for a structured, lossless-as-possible resume
 * checkpoint rather than a loose prose summary.
 */
export declare const DEFAULT_COMPRESS_PROMPT: string;
/** Plugin entry / config schema. Defaults live here so config blocks can omit them.
 *
 * Every section is declared `.volatile()`: the 0.1.7 settings architecture
 * projects volatile fields into the Plugin Manager / web settings forms, and a
 * volatile-only edit keeps the running plugin instance alive. The instance
 * reads current values lazily through the delivered refs (see `apply`), so a
 * form edit applies immediately and persists through the profile patch.
 */
declare const Config: z<Schemastery.ObjectS<NoInfer<{
    compact: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        provider: z<string, string, "plain">;
        model: z<string, string, "plain">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        provider: z<string, string, "plain">;
        model: z<string, string, "plain">;
    }>>>, "volatile-defined">;
    filter: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        flaggedTurns: z<boolean, boolean, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        flaggedTurns: z<boolean, boolean, "defined">;
    }>>>, "volatile-defined">;
    threshold: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        wan: z<number, number, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        wan: z<number, number, "defined">;
    }>>>, "volatile-defined">;
    engine: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        thresholdRatio: z<number, number, "defined">;
        retainRatio: z<number, number, "defined">;
        headroomTokens: z<number, number, "defined">;
        maxTokens: z<number, number, "defined">;
        compactionRetries: z<number, number, "defined">;
        maxOverflowRetries: z<number, number, "defined">;
        auto: z<boolean, boolean, "defined">;
        compressPrompt: z<string, string, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        thresholdRatio: z<number, number, "defined">;
        retainRatio: z<number, number, "defined">;
        headroomTokens: z<number, number, "defined">;
        maxTokens: z<number, number, "defined">;
        compactionRetries: z<number, number, "defined">;
        maxOverflowRetries: z<number, number, "defined">;
        auto: z<boolean, boolean, "defined">;
        compressPrompt: z<string, string, "defined">;
    }>>>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    compact: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        provider: z<string, string, "plain">;
        model: z<string, string, "plain">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        provider: z<string, string, "plain">;
        model: z<string, string, "plain">;
    }>>>, "volatile-defined">;
    filter: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        flaggedTurns: z<boolean, boolean, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        flaggedTurns: z<boolean, boolean, "defined">;
    }>>>, "volatile-defined">;
    threshold: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        wan: z<number, number, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        wan: z<number, number, "defined">;
    }>>>, "volatile-defined">;
    engine: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        thresholdRatio: z<number, number, "defined">;
        retainRatio: z<number, number, "defined">;
        headroomTokens: z<number, number, "defined">;
        maxTokens: z<number, number, "defined">;
        compactionRetries: z<number, number, "defined">;
        maxOverflowRetries: z<number, number, "defined">;
        auto: z<boolean, boolean, "defined">;
        compressPrompt: z<string, string, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        thresholdRatio: z<number, number, "defined">;
        retainRatio: z<number, number, "defined">;
        headroomTokens: z<number, number, "defined">;
        maxTokens: z<number, number, "defined">;
        compactionRetries: z<number, number, "defined">;
        maxOverflowRetries: z<number, number, "defined">;
        auto: z<boolean, boolean, "defined">;
        compressPrompt: z<string, string, "defined">;
    }>>>, "volatile-defined">;
}>>, "plain">;
/** Inferred plugin configuration value: sections declared `.volatile()` are
 * delivered to `apply` as loader refs carrying the live value behind `.get()`. */
export type PluginConfig = typeof Config extends z<infer T> ? T : never;
/** Unwrap one `.volatile()` section ref to its plain snapshot value. */
type UnwrapSection<S> = S extends {
    get(): infer V;
} ? V : S;
/** Plain (ref-unwrapped) config sections accepted by resolvePluginConfig. */
export type PluginConfigInput = {
    [K in keyof PluginConfig]: UnwrapSection<PluginConfig[K]>;
};
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
export declare function engineRatioPolicy(engine: ResolvedEngineConfig): EngineRatioPolicy;
/**
 * Resolve and validate one untrusted config snapshot into the frozen runtime
 * shape. Throws on mutually-inconsistent values so a bad config fails loudly.
 */
export declare function resolvePluginConfig(config: PluginConfigInput): ResolvedPluginConfig;
export { Config };
