"use client";

import type { JoinHint } from "@/lib/api";
import type { ChatSession, TableEntry } from "@/lib/types";

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  tables: TableEntry[];
  joinHints: JoinHint[];
  isUploading: boolean;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onPickFiles: () => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  tables,
  joinHints,
  isUploading,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onPickFiles,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1">
        <span className="px-2 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          truthtable
        </span>
        <span className="px-2 text-xs text-zinc-500 dark:text-zinc-500">
          SQL-backed answers about your spreadsheets
        </span>
      </div>

      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        <span className="text-base leading-none">+</span> New chat
      </button>

      <nav className="flex flex-col gap-1">
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Chats
        </p>
        {sessions.length === 0 && (
          <p className="px-2 text-xs text-zinc-400 dark:text-zinc-600">No chats yet.</p>
        )}
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              className={`group flex items-center gap-1 rounded-lg pr-1 text-sm transition-colors ${
                isActive
                  ? "bg-zinc-200 dark:bg-zinc-800"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left"
              >
                <span className="w-full truncate text-zinc-800 dark:text-zinc-200">
                  {session.title}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {session.expired
                    ? "expired — re-upload needed"
                    : session.tables.length > 0
                      ? `${session.tables.length} table${session.tables.length > 1 ? "s" : ""}`
                      : "no files yet"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteSession(session.id)}
                aria-label={`Delete chat: ${session.title}`}
                title="Delete chat"
                className="shrink-0 rounded px-1.5 py-1 text-xs text-zinc-400 opacity-0 transition hover:bg-zinc-300 hover:text-zinc-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onPickFiles}
          disabled={isUploading}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
        >
          {isUploading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200" />
              Uploading…
            </>
          ) : (
            "Add files"
          )}
        </button>

        {tables.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Tables in this chat
            </p>
            <ul className="flex flex-col gap-1">
              {tables.map((table) => (
                <li
                  key={table.name}
                  className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 dark:bg-zinc-900"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-zinc-800 dark:text-zinc-200">
                      {table.name}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                      {table.source}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      table.kind === "sheet"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    }`}
                  >
                    {table.kind}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {joinHints.length > 0 && (
          <details className="rounded-md bg-white px-2 py-1.5 dark:bg-zinc-900">
            <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Detected relationships
            </summary>
            <ul className="mt-1.5 flex flex-col gap-1">
              {joinHints.slice(0, 5).map((hint) => (
                <li
                  key={`${hint.left}-${hint.right}`}
                  className="break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400"
                >
                  {hint.left} ↔ {hint.right}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
              Suggested to the model by comparing column names, so it doesn&apos;t
              guess how your files relate.
            </p>
          </details>
        )}
      </div>
    </div>
  );
}
