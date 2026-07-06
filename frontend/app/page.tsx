"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Phase 0 connectivity proof.
 *
 * Opens a WebSocket to the backend no-op endpoint
 * (ws://localhost:8000/ws/{job_id} by default) and logs each JSON envelope
 * it streams back. This is intentionally minimal — it is NOT the live
 * dashboard, just a proof that the frontend can talk to KR's endpoint.
 */

type ConnStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface LogEntry {
  id: number;
  receivedAt: string;
  type: string;
  ts?: string;
  raw: unknown;
}

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8000";

const STATUS_STYLES: Record<ConnStatus, string> = {
  idle: "bg-gray-400",
  connecting: "bg-yellow-400 animate-pulse",
  connected: "bg-green-500",
  disconnected: "bg-gray-500",
  error: "bg-red-500",
};

const STATUS_LABELS: Record<ConnStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
};

export default function Home() {
  const [jobId, setJobId] = useState("test-job-001");
  const [status, setStatus] = useState<ConnStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((type: string, raw: unknown, ts?: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: logIdRef.current++,
        receivedAt: new Date().toISOString(),
        type,
        ts,
        raw,
      },
    ]);
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  const connect = useCallback(() => {
    // Tear down any previous socket first.
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = `${WS_BASE_URL.replace(/\/$/, "")}/ws/${encodeURIComponent(
      jobId.trim() || "test-job-001",
    )}`;

    appendLog("client.connecting", { url });
    setStatus("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      setStatus("error");
      appendLog("client.error", { error: String(err) });
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      appendLog("client.open", { url });
    };

    ws.onmessage = (event) => {
      let parsed: unknown = event.data;
      let type = "message";
      let ts: string | undefined;
      try {
        parsed = JSON.parse(event.data);
        if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj.type === "string") type = obj.type;
          if (typeof obj.ts === "string") ts = obj.ts;
        }
      } catch {
        // Non-JSON frame; keep raw string.
      }
      appendLog(type, parsed, ts);
    };

    ws.onerror = () => {
      setStatus("error");
      appendLog("client.error", { message: "WebSocket error" });
    };

    ws.onclose = (event) => {
      // Only reflect a "disconnected" state if this is still the active socket.
      if (wsRef.current === ws) {
        setStatus((s) => (s === "error" ? s : "disconnected"));
        wsRef.current = null;
      }
      appendLog("client.close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    };
  }, [jobId, appendLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    logIdRef.current = 0;
  }, []);

  // Auto-scroll the log panel to the newest entry.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Clean up the socket on unmount.
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  const isBusy = status === "connecting" || status === "connected";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-6 font-mono">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">
          ProductCut — WebSocket Connectivity Proof
        </h1>
        <p className="text-sm text-gray-500">
          Phase 0: connect to the backend no-op endpoint and log streamed
          events.
        </p>
        <p className="text-xs text-gray-400">
          Endpoint base: <code>{WS_BASE_URL}</code>
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-gray-300 p-4 dark:border-gray-700">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600 dark:text-gray-300">Job ID</span>
          <input
            type="text"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={isBusy}
            placeholder="test-job-001"
            className="rounded border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-50 dark:border-gray-600"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={connect}
            disabled={status === "connecting"}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "connected" ? "Reconnect" : "Connect"}
          </button>
          <button
            onClick={disconnect}
            disabled={!isBusy}
            className="rounded border border-gray-400 px-4 py-2 text-sm font-medium transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
          >
            Disconnect
          </button>
          <button
            onClick={clearLogs}
            className="rounded border border-gray-400 px-4 py-2 text-sm font-medium transition hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Clear
          </button>

          <span className="ml-auto flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-3 w-3 rounded-full ${STATUS_STYLES[status]}`}
              aria-hidden
            />
            <span data-testid="status">{STATUS_LABELS[status]}</span>
          </span>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Event log</span>
          <span data-testid="log-count">{logs.length} event(s)</span>
        </div>
        <div
          data-testid="log-panel"
          className="flex-1 overflow-y-auto rounded-lg border border-gray-300 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900"
          style={{ maxHeight: "50vh", minHeight: "12rem" }}
        >
          {logs.length === 0 ? (
            <p className="text-gray-400">
              No events yet. Enter a job ID and click Connect.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="rounded border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-950"
                >
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 select-none">
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {log.type}
                      </span>
                      <span className="text-gray-400">
                        {log.ts ?? log.receivedAt}
                      </span>
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-gray-700 dark:text-gray-300">
                      {JSON.stringify(log.raw, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
              <div ref={logEndRef} />
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
