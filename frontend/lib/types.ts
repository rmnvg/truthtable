import type { ChartSuggestion, JoinHint, QueryRow } from "@/lib/api";

export type TableEntry = {
  name: string;
  source: string;
  kind: "file" | "sheet";
};

export type Exchange = {
  id: string;
  question: string;
  status: "loading" | "done" | "error";
  cannotAnswer?: boolean;
  retried?: boolean;
  answer?: string;
  executedSql?: string | null;
  columns?: string[];
  rows?: QueryRow[];
  chart?: ChartSuggestion | null;
  error?: string;
};

export type ChatSession = {
  /** The backend session id. Doubles as this chat's local identity. */
  id: string;
  title: string;
  createdAt: number;
  tables: TableEntry[];
  joinHints: JoinHint[];
  exchanges: Exchange[];
  /** Set once the backend confirms it no longer holds this session. */
  expired?: boolean;
};

export const MAX_DISPLAYED_ROWS = 50;

export function titleFromQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}
