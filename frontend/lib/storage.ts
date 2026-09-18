import { MAX_DISPLAYED_ROWS, type ChatSession } from "@/lib/types";

const SESSIONS_KEY = "truthtable.sessions";
const ACTIVE_KEY = "truthtable.activeSessionId";
const MAX_STORED_SESSIONS = 30;

/** Result rows can be large, and we only ever render the first
 * MAX_DISPLAYED_ROWS — storing more would burn quota for nothing. */
function trimForStorage(sessions: ChatSession[]): ChatSession[] {
  return sessions.slice(0, MAX_STORED_SESSIONS).map((session) => ({
    ...session,
    exchanges: session.exchanges.map((exchange) => ({
      ...exchange,
      rows: exchange.rows?.slice(0, MAX_DISPLAYED_ROWS),
      // A request that was in flight when the page closed can never resume.
      status: exchange.status === "loading" ? ("error" as const) : exchange.status,
      error:
        exchange.status === "loading"
          ? "This question was interrupted when the page was closed."
          : exchange.error,
    })),
  }));
}

export function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatSession[]) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimForStorage(sessions)));
  } catch {
    // Quota exceeded or storage blocked — the app still works, it just won't
    // remember this conversation next time.
  }
}

export function loadActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveSessionId(sessionId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionId) {
      window.localStorage.setItem(ACTIVE_KEY, sessionId);
    } else {
      window.localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // ignore
  }
}
