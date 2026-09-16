/**
 * Filtering of human-flagged conversations out of compaction input.
 *
 * DSH records explicit "this answer has a problem" feedback as a log-only
 * `feedback/record` session event (produced by `@deepseek-ai/dsh-command-feedback`
 * — the `/feedback` command and the web feedback button). The event payload
 * carries only a remark/category, NOT a target message id; its POSITION in the
 * event log is the anchor: feedback recorded while a turn is open flags that
 * turn, and feedback recorded between turns flags the most recently closed one
 * (the answer the user just read).
 *
 * When the feature is enabled, EVERY surface node of a flagged turn — the
 * triggering user message, the assistant answer, and that turn's tool
 * call/result messages — is dropped from the messages sent to the compaction
 * summarizer, so the bad exchange never enters the checkpoint summary. The
 * events stay untouched in the durable log; only the summarization view is
 * filtered.
 *
 * Matching is by OBJECT IDENTITY: `Session.deriveEventMessage` returns the
 * exact frozen message object nested in the session event, and that same
 * reference is what the compaction backend places in the `llm/stream` call
 * options. No content heuristics, so duplicated text can never be mis-filtered.
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
/** Minimal structural Session surface this scan needs. */
export interface FilterableSession {
    readonly events: readonly ScanEvent[];
    /** The canonical per-node projection; returns the shared frozen message or null. */
    deriveEventMessage(event: ScanEvent): unknown;
}
/**
 * Resolve the set of turn numbers the user flagged with `feedback/record`.
 *
 * A feedback event inside an open turn flags that turn; one appearing between
 * turns (the common web case: the button is clicked after the answer landed)
 * flags the most recently closed turn.
 */
export declare function collectFlaggedTurns(events: readonly ScanEvent[]): ReadonlySet<number>;
/**
 * Collect the exact derived message objects belonging to flagged turns.
 *
 * The returned Set is matched by reference against the `messages` array of a
 * `purpose: 'compaction'` llm call. An empty set means no filtering is needed.
 */
export declare function collectFlaggedMessages(session: FilterableSession): ReadonlySet<Message>;
/**
 * Remove flagged-turn messages from one compaction call's message list.
 * Returns the original array when nothing is removed so callers can skip the
 * re-entry stream. The compaction instruction appended by the backend is a
 * freshly synthesized message and therefore never matches.
 */
export declare function filterFlaggedMessages(messages: readonly Message[], flagged: ReadonlySet<Message>): {
    messages: Message[];
    removed: number;
};
export {};
