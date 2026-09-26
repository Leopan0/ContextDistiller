/**
 * Filtering of negatively-rated conversations out of compaction input.
 *
 * DSH 0.1.7 records per-message feedback as a log-only `feedback/message-put`
 * session event whose payload carries `{ item: { messageId, rating:
 * 'positive' | 'negative', ... } }` (produced by the message thumbs-down
 * action). A `negative` rating is the durable "this answer has a problem"
 * signal. The older session-level `feedback/record` event carries no message
 * anchor at all and is deliberately ignored here.
 *
 * When the feature is enabled, EVERY message of the turn containing a
 * negatively-rated message — the triggering user message, the assistant
 * answer, and that turn's tool/system/developer messages — is dropped from the
 * messages sent to the compaction summarizer, so the bad exchange never
 * enters the checkpoint summary. The events stay untouched in the durable
 * log; only the summarization view is filtered.
 *
 * Matching is by MESSAGE ID: every session message carries its stable `id`,
 * and the compaction backend derives its `messages` from the same surface, so
 * id equality is exact — no content heuristics, no object-identity coupling.
 *
 * Structural typing only: this module must not runtime-import
 * `@deepseek-ai/*` (the plugin packaging contract erases type-only imports).
 *
 * @module context-distiller/flagged-filter
 */
import type { Message } from '@deepseek-ai/dsh-llm';
/** Minimal structural SessionEvent this scan needs. */
interface ScanEvent {
    readonly seq: number;
    readonly type: string;
    readonly data?: unknown;
}
/** Minimal structural Session surface this scan needs (dsh 0.1.7 Session). */
export interface FilterableSession {
    /** Snapshot of the session's event log (dsh-session `Session.snapshotEvents`). */
    snapshotEvents(): readonly ScanEvent[];
    /** The canonical per-node projection; returns the shared frozen message or null. */
    deriveEventMessage(event: ScanEvent): unknown;
}
/**
 * Resolve the set of turn numbers the user flagged via negative message
 * ratings. A rated answer flags the whole turn that contains it.
 */
export declare function collectFlaggedTurns(events: readonly ScanEvent[]): ReadonlySet<number>;
/**
 * Collect the message ids belonging to flagged turns.
 *
 * The returned Set is matched against the `messages` array of a
 * `purpose: 'compaction'` llm call by each message's stable `id`. An empty set
 * means no filtering is needed.
 */
export declare function collectFlaggedMessageIds(session: FilterableSession): ReadonlySet<string>;
/**
 * Remove flagged-turn messages from one compaction call's message list.
 * Returns the original array when nothing is removed so callers can skip the
 * re-entry stream. The compaction instruction appended by the backend is a
 * freshly synthesized message and therefore never matches.
 */
export declare function filterFlaggedMessages(messages: readonly Message[], flagged: ReadonlySet<string>): {
    messages: Message[];
    removed: number;
};
export {};
