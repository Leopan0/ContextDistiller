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

/** Event types that produce model-visible surface messages (dsh-session surface). */
const SURFACE_EVENT_TYPES = new Set([
  'user/message',
  'assistant/message',
  'tool/result',
  'system/message',
  'developer/message',
]);

/** Read the turn number carried by an event payload, when present. */
function turnOf(event: ScanEvent): number | undefined {
  const data = event.data as { turn?: unknown } | undefined;
  return typeof data?.turn === 'number' ? data.turn : undefined;
}

/**
 * Extract the stable message id carried by a surface event's payload.
 * `user/message` carries the message itself; the other surface events nest it
 * under `message`.
 */
function messageIdOf(event: ScanEvent): string | undefined {
  if (typeof event.data !== 'object' || event.data === null) return undefined;
  const data = event.data as Record<string, unknown>;
  const candidate = event.type === 'user/message' ? data : data.message;
  if (typeof candidate !== 'object' || candidate === null) return undefined;
  const id = (candidate as Record<string, unknown>).id;
  return typeof id === 'string' ? id : undefined;
}

/** Read the message id a `negative` rating targets, from a feedback event payload. */
function negativelyRatedMessageId(event: ScanEvent): string | undefined {
  if (typeof event.data !== 'object' || event.data === null) return undefined;
  const item = (event.data as Record<string, unknown>).item;
  if (typeof item !== 'object' || item === null) return undefined;
  const record = item as Record<string, unknown>;
  if (record.rating !== 'negative') return undefined;
  const id = record.messageId;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Resolve the set of turn numbers the user flagged via negative message
 * ratings. A rated answer flags the whole turn that contains it.
 */
export function collectFlaggedTurns(events: readonly ScanEvent[]): ReadonlySet<number> {
  const flagged = new Set<number>();
  const turnOfMessage = new Map<string, number>();
  let openTurn: number | undefined;

  for (const event of events) {
    if (event.type === 'turn/start') {
      openTurn = turnOf(event);
    } else if (event.type === 'turn/end') {
      openTurn = undefined;
    } else if (SURFACE_EVENT_TYPES.has(event.type)) {
      const id = messageIdOf(event);
      const turn = turnOf(event) ?? openTurn;
      if (id !== undefined && turn !== undefined) turnOfMessage.set(id, turn);
    } else if (event.type === 'feedback/message-put') {
      const target = negativelyRatedMessageId(event);
      const turn = target !== undefined ? turnOfMessage.get(target) : undefined;
      if (turn !== undefined) flagged.add(turn);
    }
  }
  return flagged;
}

/**
 * Collect the message ids belonging to flagged turns.
 *
 * The returned Set is matched against the `messages` array of a
 * `purpose: 'compaction'` llm call by each message's stable `id`. An empty set
 * means no filtering is needed.
 */
export function collectFlaggedMessageIds(session: FilterableSession): ReadonlySet<string> {
  const events = session.snapshotEvents();
  const flaggedTurns = collectFlaggedTurns(events);
  if (flaggedTurns.size === 0) return new Set();

  const flagged = new Set<string>();
  let openTurn: number | undefined;

  for (const event of events) {
    if (event.type === 'turn/start') {
      openTurn = turnOf(event);
      continue;
    }
    if (event.type === 'turn/end') {
      openTurn = undefined;
      continue;
    }
    const turn = turnOf(event) ?? openTurn;
    if (turn === undefined || !flaggedTurns.has(turn)) continue;
    if (!SURFACE_EVENT_TYPES.has(event.type)) continue;
    const id = messageIdOf(event);
    if (id !== undefined) flagged.add(id);
  }
  return flagged;
}

/**
 * Remove flagged-turn messages from one compaction call's message list.
 * Returns the original array when nothing is removed so callers can skip the
 * re-entry stream. The compaction instruction appended by the backend is a
 * freshly synthesized message and therefore never matches.
 */
export function filterFlaggedMessages(
  messages: readonly Message[],
  flagged: ReadonlySet<string>
): { messages: Message[]; removed: number } {
  if (flagged.size === 0) return { messages: [...messages], removed: 0 };
  const kept = messages.filter((message) => !flagged.has(message.id));
  return { messages: kept, removed: messages.length - kept.length };
}
