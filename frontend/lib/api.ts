const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface SessionResponse {
  session_id: string;
}

export interface UploadResponse {
  tables: string[];
  added: string[];
}

export interface ChartSuggestion {
  type: "bar" | "line" | "pie";
  x: string;
  y: string;
}

export type QueryRow = Record<string, unknown>;

export interface AskResponse {
  answer: string;
  sql: string | null;
  columns: string[];
  rows: QueryRow[];
  chart: ChartSuggestion | null;
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
    throw new Error(await parseErrorDetail(response));
  }
  return response.json() as Promise<T>;
}

export function createSession(): Promise<SessionResponse> {
  return request<SessionResponse>("/session", { method: "POST" });
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
