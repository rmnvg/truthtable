"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  askQuestion,
  createSession,
  getSession,
  SessionExpiredError,
  uploadFiles,
  type JoinHint,
  type UploadResponse,
} from "@/lib/api";
import { ChatMessage } from "@/components/ChatMessage";
import { Sidebar } from "@/components/Sidebar";
import {
  loadActiveSessionId,
  loadSessions,
  saveActiveSessionId,
  saveSessions,
} from "@/lib/storage";
import { titleFromQuestion, type ChatSession, type Exchange, type TableEntry } from "@/lib/types";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

const SESSION_LOST_MESSAGE =
  "The backend restarted, so this chat's uploaded tables were lost. Re-upload your files to continue.";

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function emptySession(id: string): ChatSession {
  return {
    id,
    title: "New chat",
    createdAt: Date.now(),
    tables: [],
    joinHints: [],
    exchanges: [],
  };
}

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  const [sessionError, setSessionError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [question, setQuestion] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  // React StrictMode runs effects twice in dev; without this the bootstrap
  // would create (and orphan) a second backend session on every load.
  const bootstrapped = useRef(false);
  // Files chosen before the session exists would otherwise be silently dropped.
  const queuedFiles = useRef<File[] | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const updateSession = useCallback(
    (id: string, updater: (session: ChatSession) => ChatSession) => {
      setSessions((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
    },
    []
  );

  // ---- bootstrap: restore chats from localStorage, or start a fresh one ----
  useEffect(() => {
    // The ref guard (not a cleanup flag) is what makes this StrictMode-safe:
    // cancelling on cleanup would abort the first run while the second exits
    // early, leaving the app with no session at all.
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      const stored = loadSessions();
      if (stored.length > 0) {
        const storedActive = loadActiveSessionId();
        const target = stored.find((s) => s.id === storedActive) ?? stored[0];
        let next = stored;
        try {
          const state = await getSession(target.id);
          next = stored.map((s) =>
            s.id === target.id
              ? {
                  ...s,
                  expired: false,
                  // Trust the server for which tables still exist.
                  tables: s.tables.filter((t) => state.tables.includes(t.name)),
                  joinHints: state.join_hints,
                }
              : s
          );
        } catch (err) {
          if (err instanceof SessionExpiredError) {
            next = stored.map((s) =>
              s.id === target.id ? { ...s, expired: true, tables: [], joinHints: [] } : s
            );
          }
        }
        setSessions(next);
        setActiveSessionId(target.id);
        setBooted(true);
        return;
      }

      try {
        const res = await createSession();
        const fresh = emptySession(res.session_id);
        setSessions([fresh]);
        setActiveSessionId(fresh.id);
      } catch (err) {
        setSessionError(errorMessage(err));
      }
      setBooted(true);
    })();
  }, []);

  // ---- persistence ----
  useEffect(() => {
    if (booted) saveSessions(sessions);
  }, [sessions, booted]);

  useEffect(() => {
    if (booted) saveActiveSessionId(activeSessionId);
  }, [activeSessionId, booted]);

  // ---- keep the newest message in view ----
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeSession?.exchanges, activeSessionId]);

  const handleNewChat = useCallback(async () => {
    setUploadError(null);
    setSidebarOpen(false);
    try {
      const res = await createSession();
      const fresh = emptySession(res.session_id);
      setSessions((prev) => [fresh, ...prev]);
      setActiveSessionId(fresh.id);
    } catch (err) {
      setSessionError(errorMessage(err));
    }
  }, []);

  const handleSelectSession = useCallback(
    async (id: string) => {
      setActiveSessionId(id);
      setUploadError(null);
      setSidebarOpen(false);
      try {
        const state = await getSession(id);
        updateSession(id, (s) => ({
          ...s,
          expired: false,
          tables: s.tables.filter((t) => state.tables.includes(t.name)),
          joinHints: state.join_hints,
        }));
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          updateSession(id, (s) => ({ ...s, expired: true, tables: [], joinHints: [] }));
        }
      }
    },
    [updateSession]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        if (id === activeSessionId) {
          setActiveSessionId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
    },
    [activeSessionId]
  );

  /** A chat whose backend session died is unusable until it gets a live one.
   * Mint a fresh session and swap it onto this chat, keeping the conversation. */
  const reviveSession = useCallback(async (deadId: string): Promise<string | null> => {
    try {
      const res = await createSession();
      setSessions((prev) =>
        prev.map((s) =>
          s.id === deadId
            ? { ...s, id: res.session_id, expired: false, tables: [], joinHints: [] }
            : s
        )
      );
      setActiveSessionId((current) => (current === deadId ? res.session_id : current));
      return res.session_id;
    } catch (err) {
      setSessionError(errorMessage(err));
      return null;
    }
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const sessionId = activeSessionId;
      if (!sessionId) {
        // Still booting — hold onto these and upload once the session exists.
        queuedFiles.current = files;
        return;
      }

      const validFiles = files.filter((f) => hasAcceptedExtension(f.name));
      const invalidFiles = files.filter((f) => !hasAcceptedExtension(f.name));

      setUploadError(
        invalidFiles.length > 0
          ? `Skipped unsupported file${invalidFiles.length > 1 ? "s" : ""}: ${invalidFiles
              .map((f) => f.name)
              .join(", ")}`
          : null
      );
      if (validFiles.length === 0) return;

      setIsUploading(true);

      const uploadTo = async (target: string) => {
        const entries: TableEntry[] = [];
        const failed: string[] = [];
        let hints: JoinHint[] | null = null;
        let lost = false;

        for (const file of validFiles) {
          try {
            const result: UploadResponse = await uploadFiles(target, [file]);
            const kind: TableEntry["kind"] = result.added.length > 1 ? "sheet" : "file";
            for (const name of result.added) {
              entries.push({ name, source: file.name, kind });
            }
            hints = result.join_hints;
          } catch (err) {
            if (err instanceof SessionExpiredError) {
              lost = true;
              break;
            }
            failed.push(`${file.name}: ${errorMessage(err)}`);
          }
        }
        return { entries, failed, hints, lost };
      };

      let targetId = sessionId;
      let { entries: newEntries, failed: failures, hints: latestHints, lost } =
        await uploadTo(targetId);

      // The backend forgot this session (it restarted). Give the chat a live
      // session and retry once, so re-uploading actually recovers it.
      if (lost) {
        const revivedId = await reviveSession(sessionId);
        if (!revivedId) {
          setUploadError(SESSION_LOST_MESSAGE);
          setIsUploading(false);
          return;
        }
        targetId = revivedId;
        ({ entries: newEntries, failed: failures, hints: latestHints, lost } =
          await uploadTo(targetId));
        if (lost) {
          setUploadError(SESSION_LOST_MESSAGE);
          setIsUploading(false);
          return;
        }
        setUploadError(null);
      }

      const sessionIdForUpdate = targetId;
      updateSession(sessionIdForUpdate, (s) => {
        // Re-uploading a file replaces its table rather than adding a duplicate.
        const merged = [...s.tables];
        for (const entry of newEntries) {
          const existing = merged.findIndex((t) => t.name === entry.name);
          if (existing === -1) merged.push(entry);
          else merged[existing] = entry;
        }
        return { ...s, tables: merged, joinHints: latestHints ?? s.joinHints, expired: false };
      });

      if (failures.length > 0) {
        setUploadError((prev) => {
          const message = `Failed to upload:\n${failures.join("\n")}`;
          return prev ? `${prev}\n${message}` : message;
        });
      }
      setIsUploading(false);
    },
    [activeSessionId, updateSession, reviveSession]
  );

  // Declared after handleFiles so the dependency array isn't evaluated in its TDZ.
  useEffect(() => {
    if (!activeSessionId || !queuedFiles.current) return;
    const files = queuedFiles.current;
    queuedFiles.current = null;
    void handleFiles(files);
  }, [activeSessionId, handleFiles]);

  const submitQuestion = useCallback(async () => {
    const sessionId = activeSessionId;
    const trimmed = question.trim();
    if (!sessionId || !trimmed || isAsking) return;

    const exchangeId = newId();
    const pending: Exchange = { id: exchangeId, question: trimmed, status: "loading" };

    updateSession(sessionId, (s) => ({
      ...s,
      title: s.exchanges.length === 0 ? titleFromQuestion(trimmed) : s.title,
      exchanges: [...s.exchanges, pending],
    }));
    setQuestion("");
    setIsAsking(true);

    try {
      const res = await askQuestion(sessionId, trimmed);
      updateSession(sessionId, (s) => ({
        ...s,
        exchanges: s.exchanges.map((ex) =>
          ex.id === exchangeId
            ? {
                ...ex,
                status: "done",
                cannotAnswer: res.status === "cannot_answer",
                retried: res.retried,
                answer: res.answer,
                executedSql: res.executed_sql,
                columns: res.columns,
                rows: res.rows,
                chart: res.chart,
              }
            : ex
        ),
      }));
    } catch (err) {
      const expired = err instanceof SessionExpiredError;
      updateSession(sessionId, (s) => ({
        ...s,
        expired: expired ? true : s.expired,
        tables: expired ? [] : s.tables,
        joinHints: expired ? [] : s.joinHints,
        exchanges: s.exchanges.map((ex) =>
          ex.id === exchangeId
            ? {
                ...ex,
                status: "error",
                error: expired ? SESSION_LOST_MESSAGE : errorMessage(err),
              }
            : ex
        ),
      }));
      // Give the chat a live session so re-uploading can recover it.
      if (expired) await reviveSession(sessionId);
    } finally {
      setIsAsking(false);
    }
  }, [activeSessionId, question, isAsking, updateSession, reviveSession]);

  // ---- window-wide drag & drop ----
  const onDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    if (event.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const onDragOver = (event: React.DragEvent) => event.preventDefault();
  const onDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) setIsDragging(false);
  };
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const tables = activeSession?.tables ?? [];
  const exchanges = activeSession?.exchanges ?? [];
  const hasTables = tables.length > 0;
  const canSend = hasTables && !isAsking && question.trim().length > 0;

  return (
    <div
      className="flex h-dvh overflow-hidden bg-white font-sans dark:bg-zinc-950"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-white bg-zinc-900/80 px-8 py-6 text-center text-white">
            <p className="text-base font-medium">Drop to upload</p>
            <p className="mt-1 text-sm opacity-80">CSV or Excel files</p>
          </div>
        </div>
      )}

      {/* Sidebar — off-canvas on small screens */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          tables={tables}
          joinHints={activeSession?.joinHints ?? []}
          isUploading={isUploading}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onPickFiles={() => fileInputRef.current?.click()}
        />
      </aside>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-zinc-900/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main column */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {activeSession?.title ?? "truthtable"}
          </h1>
          {activeSession?.expired && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              session expired
            </span>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
            {sessionError && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                Couldn&apos;t reach the backend: {sessionError}
              </p>
            )}

            {activeSession?.expired && (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                {SESSION_LOST_MESSAGE}
              </p>
            )}

            {uploadError && (
              <p className="whitespace-pre-line rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {uploadError}
              </p>
            )}

            {!hasTables && exchanges.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 px-6 py-16 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
              >
                <p className="text-base font-medium text-zinc-800 dark:text-zinc-200">
                  Drop CSV or Excel files here
                </p>
                <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                  Upload one or more files, then ask questions about them in plain
                  English. Answers are computed with SQL, and the query is always
                  shown.
                </p>
              </button>
            )}

            {hasTables && exchanges.length === 0 && (
              <div className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                <p className="font-medium text-zinc-700 dark:text-zinc-300">
                  {tables.length} table{tables.length > 1 ? "s" : ""} ready
                </p>
                <p className="mt-1">Ask anything about your data below.</p>
              </div>
            )}

            {exchanges.map((exchange) => (
              <ChatMessage key={exchange.id} exchange={exchange} />
            ))}
          </div>
        </div>

        {/* Composer — pinned, so it never scrolls away */}
        <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitQuestion();
            }}
            className="mx-auto flex w-full max-w-3xl items-end gap-2"
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitQuestion();
                }
              }}
              rows={1}
              disabled={!hasTables || isAsking}
              placeholder={
                hasTables
                  ? "Ask a question about your data…"
                  : "Upload a file to start asking questions"
              }
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="h-[44px] shrink-0 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isAsking ? "…" : "Send"}
            </button>
          </form>
          <p className="mx-auto mt-1.5 w-full max-w-3xl text-[11px] text-zinc-400 dark:text-zinc-600">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </main>
    </div>
  );
}
