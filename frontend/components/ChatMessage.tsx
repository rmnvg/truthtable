"use client";

import { ResultChart } from "@/components/ResultChart";
import { formatValue } from "@/lib/format";
import { MAX_DISPLAYED_ROWS, type Exchange } from "@/lib/types";

export function ChatMessage({ exchange }: { exchange: Exchange }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          {exchange.question}
        </div>
      </div>

      {exchange.status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300" />
          Thinking…
        </div>
      )}

      {exchange.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {exchange.error}
        </div>
      )}

      {exchange.status === "done" && (
        <div
          className={`flex flex-col gap-3 rounded-xl border px-4 py-3.5 text-sm ${
            exchange.cannotAnswer
              ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
              : "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          }`}
        >
          {exchange.cannotAnswer && (
            <span className="w-fit rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
              Declined to answer
            </span>
          )}

          <p className="leading-relaxed">{exchange.answer}</p>

          {exchange.cannotAnswer && (
            <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300/80">
              No SQL was run. The model is required to refuse rather than invent a
              join or a column that isn&apos;t in your data.
            </p>
          )}

          {exchange.retried && (
            <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Self-corrected after a SQL error
            </span>
          )}

          {exchange.columns && exchange.columns.length > 0 && exchange.rows && (
            <div className="flex flex-col gap-1.5">
              <div className="max-h-80 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-950">
                    <tr>
                      {exchange.columns.map((col) => (
                        <th
                          key={col}
                          className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-zinc-600 dark:text-zinc-400"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exchange.rows.slice(0, MAX_DISPLAYED_ROWS).map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-zinc-200 dark:border-zinc-800">
                        {exchange.columns!.map((col) => (
                          <td key={col} className="whitespace-nowrap px-3 py-2">
                            {formatValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {exchange.rows.length > MAX_DISPLAYED_ROWS && (
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  Showing {MAX_DISPLAYED_ROWS} of {exchange.rows.length} rows.
                </p>
              )}
            </div>
          )}

          {exchange.chart && exchange.rows && exchange.rows.length > 0 && (
            <ResultChart chart={exchange.chart} rows={exchange.rows} />
          )}

          {exchange.executedSql && (
            <details className="group border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
              <summary className="cursor-pointer select-none text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                Show SQL used
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-100 dark:bg-black">
                <code>{exchange.executedSql}</code>
              </pre>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
                The exact query that ran, after validation: read-only (SELECT/WITH
                only, no INSERT/UPDATE/DELETE/DROP) with a row cap applied.
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
