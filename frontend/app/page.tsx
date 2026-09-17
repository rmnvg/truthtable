"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, uploadFiles, type UploadResponse } from "@/lib/api";

type TableEntry = {
  name: string;
  source: string;
  kind: "file" | "sheet";
};

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createSession()
      .then((res) => setSessionId(res.session_id))
      .catch((err) => setSessionError(errorMessage(err)));
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!sessionId) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const validFiles = files.filter((file) => hasAcceptedExtension(file.name));
      const invalidFiles = files.filter((file) => !hasAcceptedExtension(file.name));

      setUploadError(
        invalidFiles.length > 0
          ? `Skipped unsupported file${invalidFiles.length > 1 ? "s" : ""}: ${invalidFiles
              .map((file) => file.name)
              .join(", ")}`
          : null
      );

      if (validFiles.length === 0) return;

      setIsUploading(true);
      const newEntries: TableEntry[] = [];
      const failures: string[] = [];

      for (const file of validFiles) {
        try {
          const result: UploadResponse = await uploadFiles(sessionId, [file]);
          const kind: TableEntry["kind"] = result.added.length > 1 ? "sheet" : "file";
          for (const name of result.added) {
            newEntries.push({ name, source: file.name, kind });
          }
        } catch (err) {
          failures.push(`${file.name}: ${errorMessage(err)}`);
        }
      }

      setTables((prev) => [...prev, ...newEntries]);
      if (failures.length > 0) {
        setUploadError((prev) => {
          const message = `Failed to upload:\n${failures.join("\n")}`;
          return prev ? `${prev}\n${message}` : message;
        });
      }
      setIsUploading(false);
    },
    [sessionId]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      void handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const onFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      void handleFiles(event.target.files);
    }
    event.target.value = "";
  };

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Darwinbox FDE Q&A
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {sessionId
              ? `Session ready (${sessionId.slice(0, 8)}…)`
              : sessionError
                ? `Failed to start session: ${sessionError}`
                : "Starting session…"}
          </p>
        </header>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
            isDragging
              ? "border-zinc-950 bg-zinc-100 dark:border-zinc-50 dark:bg-zinc-900"
              : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onFileInputChange}
          />
          {isUploading ? (
            <>
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-950 dark:border-zinc-700 dark:border-t-zinc-50" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Uploading…</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Drag and drop CSV or Excel files here, or click to browse
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">Accepts .csv, .xlsx, .xls</p>
            </>
          )}
        </div>

        {uploadError && (
          <p className="whitespace-pre-line rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {uploadError}
          </p>
        )}

        {tables.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Available tables
            </h2>
            <ul className="flex flex-col gap-2">
              {tables.map((table) => (
                <li
                  key={table.name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{table.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">from {table.source}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      table.kind === "sheet"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    }`}
                  >
                    {table.kind === "sheet" ? "sheet" : "file"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
