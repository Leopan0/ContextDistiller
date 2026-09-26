/**
 * ContextDistiller 的 dsh 符号接入点。
 *
 * The optional compression engine needs dsh's *module-level* exports
 * (`BasicCompactionEngine`, `BlockAssembler`, `createUserMessage`). These are
 * not Cordis services — `ctx.get(...)` cannot reach them — and a direct
 * `import` of `@deepseek-ai/*` would both (a) violate the plugin packaging
 * contract and (b) rebind this plugin to dsh's internal surface.
 *
 * Instead the `@dsh-plugin/dsh-loader` plugin exposes them at boot on
 * `ctx.dshLoader.{dsh,llm}`. `index.ts` captures that facade in `apply` via
 * {@link setDshFacade}; every other module reaches the symbols through
 * {@link dsh} / {@link llm}. The facade is only touched at *runtime* (inside
 * function bodies), never at module-evaluation time, so it is safe to import
 * this module before `apply` runs.
 *
 * Type-only imports (`import type`) are erased at compile time and never enter
 * the runtime import graph, so they are used freely for signature fidelity.
 *
 * @module context-distiller/dsh
 */
import type * as DshLlm from '@deepseek-ai/dsh-llm';
/** The subset of dshloader's `dsh` facade this plugin uses. */
export interface DshSymbols {
    compaction: {
        /** Kept loose: it is only subclassed, narrowing it would hinder lazy extension. */
        readonly BasicCompactionEngine: new (...args: any[]) => any;
    };
    llm: {
        readonly BlockAssembler: typeof DshLlm.BlockAssembler;
    };
}
/** The subset of dshloader's `llm` helper facade this plugin uses. */
export interface LlmHelpers {
    createUserMessage: typeof DshLlm.createUserMessage;
}
/** Shape of `ctx.dshLoader` relied upon here. */
export interface DshFacade {
    dsh: DshSymbols;
    llm: LlmHelpers;
}
/** Inject `ctx.dshLoader` at the very start of `apply`. */
export declare function setDshFacade(value: DshFacade): void;
/** Clear the injection (plugin unload / test isolation). */
export declare function clearDshFacade(): void;
/** dsh module-level symbols; throws if called before the facade was injected. */
export declare function dsh(): DshSymbols;
/** dsh LLM message helpers; throws if called before the facade was injected. */
export declare function llm(): LlmHelpers;
/**
 * Recursively freeze a value with the plugin's own traversal. dsh-llm no
 * longer exports its `deepFreeze` helper (removed in 0.1.7), and the loader
 * facade degrades to a shallow top-level freeze, so identical runtime
 * semantics are guaranteed here instead.
 */
export declare function deepFreeze<T>(value: T): T;
