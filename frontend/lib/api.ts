const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface SessionResponse {
  session_id: string;
}

export interface JoinHint {
  left: string;
  right: string;
  score: number;
}

export interface UploadResponse {
  tables: string[];
  added: string[];
  join_hints: JoinHint[];
}

export interface ChartSuggestion {
  type: "bar" | "line" | "pie";
  x: string;
  y: string;
}

export type QueryRow = Record<string, unknown>;

export interface AskResponse {
  status: "answered" | "cannot_answer";
  answer: string;
  sql: string | null;
  executed_sql: string | null;
  retried: boolean;
  columns: string[];
  rows: QueryRow[];
  chart: ChartSuggestion | null;
}

/** Thrown when the backend no longer knows the session — e.g. it restarted and
 * the in-memory session store was cleared. */
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionExpiredError";
  }
}

async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") {
      return body.detail;
    }
    return JSON.stringify(body);
  } catch {
    return response.statusText;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    if (response.status === 404) {
      throw new SessionExpiredError(detail);
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export interface SessionStateResponse {
  session_id: string;
  tables: string[];
  join_hints: JoinHint[];
}

export function createSession(): Promise<SessionResponse> {
  return request<SessionResponse>("/session", { method: "POST" });
}

/** Throws SessionExpiredError if the backend no longer has this session. */
export function getSession(sessionId: string): Promise<SessionStateResponse> {
  return request<SessionStateResponse>(`/session/${sessionId}`, { method: "GET" });
}

export function uploadFiles(sessionId: string, files: File[]): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  for (const file of files) {
    formData.append("files", file);
  }

  return request<UploadResponse>("/upload", {
    method: "POST",
    body: formData,
  });
}

export function askQuestion(sessionId: string, question: string): Promise<AskResponse> {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("question", question);

  return request<AskResponse>("/ask", {
    method: "POST",
    body: formData,
  });
}
