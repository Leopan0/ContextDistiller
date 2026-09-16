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

/** Event types that produce model-visible surface nodes (see dsh-session surface). */
const SURFACE_EVENT_TYPES = new Set(['user/message', 'assistant/message', 'tool/result']);

/** Read the turn number carried by a turn boundary event. */
function turnOf(event: ScanEvent): number | undefined {
  const data = event.data as { turn?: unknown } | undefined;
  return typeof data?.turn === 'number' ? data.turn : undefined;
}

/**
 * Resolve the set of turn numbers the user flagged with `feedback/record`.
 *
 * A feedback event inside an open turn flags that turn; one appearing between
 * turns (the common web case: the button is clicked after the answer landed)
 * flags the most recently closed turn.
 */
export function collectFlaggedTurns(events: readonly ScanEvent[]): ReadonlySet<number> {
  const flagged = new Set<number>();
  let openTurn: number | undefined;
  let lastClosedTurn: number | undefined;

  for (const event of events) {
    if (event.type === 'turn/start') {
      openTurn = turnOf(event);
    } else if (event.type === 'turn/end') {
      const ended = turnOf(event) ?? openTurn;
      if (ended !== undefined) lastClosedTurn = ended;
      openTurn = undefined;
    } else if (event.type === 'feedback/record') {
      const target = openTurn ?? lastClosedTurn;
      if (target !== undefined) flagged.add(target);
    }
  }
  return flagged;
}

/**
 * Collect the exact derived message objects belonging to flagged turns.
 *
 * The returned Set is matched by reference against the `messages` array of a
 * `purpose: 'compaction'` llm call. An empty set means no filtering is needed.
 */
export function collectFlaggedMessages(session: FilterableSession): ReadonlySet<Message> {
  const flaggedTurns = collectFlaggedTurns(session.events);
  if (flaggedTurns.size === 0) return new Set();

  const flaggedMessages = new Set<Message>();
  let openTurn: number | undefined;

  for (const event of session.events) {
    if (event.type === 'turn/start') {
      openTurn = turnOf(event);
      continue;
    }
    if (event.type === 'turn/end') {
      openTurn = undefined;
      continue;
    }
    if (openTurn === undefined || !flaggedTurns.has(openTurn)) continue;
    if (!SURFACE_EVENT_TYPES.has(event.type)) continue;
    const message = session.deriveEventMessage(event);
    if (message !== null && message !== undefined) {
      flaggedMessages.add(message as Message);
    }
  }
  return flaggedMessages;
}

/**
 * Remove flagged-turn messages from one compaction call's message list.
 * Returns the original array when nothing is removed so callers can skip the
 * re-entry stream. The compaction instruction appended by the backend is a
 * freshly synthesized message and therefore never matches.
 */
export function filterFlaggedMessages(
  messages: readonly Message[],
  flagged: ReadonlySet<Message>
): { messages: Message[]; removed: number } {
  if (flagged.size === 0) return { messages: [...messages], removed: 0 };
  const kept = messages.filter((message) => !flagged.has(message));
  return { messages: kept, removed: messages.length - kept.length };
}
