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
  deepFreeze: typeof DshLlm.deepFreeze;
}

/** Shape of `ctx.dshLoader` relied upon here. */
export interface DshFacade {
  dsh: DshSymbols;
  llm: LlmHelpers;
}

let facade: DshFacade | undefined;

/** Inject `ctx.dshLoader` at the very start of `apply`. */
export function setDshFacade(value: DshFacade): void {
  facade = value;
}

/** Clear the injection (plugin unload / test isolation). */
export function clearDshFacade(): void {
  facade = undefined;
}

/** dsh module-level symbols; throws if called before the facade was injected. */
export function dsh(): DshSymbols {
  if (facade === undefined) {
    throw new Error('context-distiller: ctx.dshLoader facade is not injected; dsh() is only valid after apply');
  }
  return facade.dsh;
}

/** dsh LLM message helpers; throws if called before the facade was injected. */
export function llm(): LlmHelpers {
  if (facade === undefined) {
    throw new Error('context-distiller: ctx.dshLoader facade is not injected; llm() is only valid after apply');
  }
  return facade.llm;
}

/** Local recursive freeze, used as a fallback when the facade is unavailable. */
function localDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    localDeepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/**
 * Recursively freeze a value. Uses dsh's own `deepFreeze` when the facade is
 * present (identical runtime semantics), otherwise a local equivalent — so the
 * pure model-router path keeps working even without dsh-loader installed.
 */
export function deepFreeze<T>(value: T): T {
  if (facade !== undefined) return facade.llm.deepFreeze(value);
  return localDeepFreeze(value);
}
