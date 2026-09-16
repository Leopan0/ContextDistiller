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
export declare const PLUGIN_NAME = "context-distiller";
/** Default ceiling for one compression (summary) completion, in tokens. */
export declare const DEFAULT_ENGINE_MAX_TOKENS = 8192;
/**
 * The default context-compression instruction used by the optional engine.
 * It asks the dedicated model for a structured, lossless-as-possible resume
 * checkpoint rather than a loose prose summary.
 */
export declare const DEFAULT_COMPRESS_PROMPT: string;
/** Plugin entry / config schema. Defaults live here so config blocks can omit them. */
declare const Config: z<Schemastery.ObjectS<{
    compact: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        provider: z<string, string>;
        model: z<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        provider: z<string, string>;
        model: z<string, string>;
    }>>;
    engine: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        thresholdRatio: z<number, number>;
        retainRatio: z<number, number>;
        maxTokens: z<number, number>;
        compactionRetries: z<number, number>;
        maxOverflowRetries: z<number, number>;
        auto: z<boolean, boolean>;
        compressPrompt: z<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        thresholdRatio: z<number, number>;
        retainRatio: z<number, number>;
        maxTokens: z<number, number>;
        compactionRetries: z<number, number>;
        maxOverflowRetries: z<number, number>;
        auto: z<boolean, boolean>;
        compressPrompt: z<string, string>;
    }>>;
}>, Schemastery.ObjectT<{
    compact: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        provider: z<string, string>;
        model: z<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        provider: z<string, string>;
        model: z<string, string>;
    }>>;
    engine: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        thresholdRatio: z<number, number>;
        retainRatio: z<number, number>;
        maxTokens: z<number, number>;
        compactionRetries: z<number, number>;
        maxOverflowRetries: z<number, number>;
        auto: z<boolean, boolean>;
        compressPrompt: z<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        thresholdRatio: z<number, number>;
        retainRatio: z<number, number>;
        maxTokens: z<number, number>;
        compactionRetries: z<number, number>;
        maxOverflowRetries: z<number, number>;
        auto: z<boolean, boolean>;
        compressPrompt: z<string, string>;
    }>>;
}>>;
/** Inferred plugin configuration value. */
export type PluginConfig = typeof Config extends z<infer T> ? T : never;
/** Resolved compaction-routing policy (the dedicated summarizer route). */
export interface ResolvedCompactConfig {
    readonly enabled: boolean;
    readonly provider: string;
    readonly model: string;
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
    readonly engine: ResolvedEngineConfig;
}
/**
 * Resolve and validate one untrusted config snapshot into the frozen runtime
 * shape. Throws on mutually-inconsistent values so a bad config fails loudly.
 */
export declare function resolvePluginConfig(config: PluginConfig): ResolvedPluginConfig;
export { Config };
