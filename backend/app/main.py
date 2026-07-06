"""
Phase 0 scaffold: FastAPI app that streams LangGraph events over a WebSocket.

Endpoints:
  GET  /health          -> basic liveness + which checkpointer is active
  WS   /ws/{job_id}     -> runs the bare graph and forwards each astream_events
                           event to the client as a JSON envelope.

The WebSocket envelope shape below mirrors the project's planned "C2" event
schema, which is NOT frozen yet. It is intentionally a simple placeholder:
    {"type": ..., "job_id": ..., "ts": ..., "payload": ...}
Do not treat it as a stable contract.
"""
from __future__ import annotations

import logging
from contextlib import ExitStack, asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from graph.build import build_graph

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("productcut.app")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _envelope(event_type: str, job_id: str, payload: Any) -> dict:
    """Build the placeholder C2-style WebSocket event envelope."""
    return {
        "type": event_type,
        "job_id": job_id,
        "ts": _now_iso(),
        "payload": payload,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Compile the graph once at startup; keep any DB connection open for life."""
    app.state.exit_stack = ExitStack()
    logger.info("Building Phase 0 LangGraph graph...")
    app.state.graph = build_graph(exit_stack=app.state.exit_stack)
    logger.info("Graph compiled and ready.")
    try:
        yield
    finally:
        app.state.exit_stack.close()
        logger.info("Shutdown: released graph resources.")


app = FastAPI(title="ProductCut Backend (Phase 0 scaffold)", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    """Basic health check."""
    return {
        "status": "ok",
        "service": "productcut-backend",
        "phase": "0-scaffold",
        "graph_ready": getattr(app.state, "graph", None) is not None,
        "ts": _now_iso(),
    }


@app.websocket("/ws/{job_id}")
async def ws_run(websocket: WebSocket, job_id: str) -> None:
    """Run the bare graph for `job_id` and stream each event to the client."""
    await websocket.accept()
    graph = websocket.app.state.graph
    config = {"configurable": {"thread_id": job_id}}
    initial_state = {"job_id": job_id}

    try:
        await websocket.send_json(
            _envelope("run.started", job_id, {"message": "graph run starting"})
        )

        # astream_events surfaces the internal event stream of the graph run.
        async for event in graph.astream_events(
            initial_state, config=config, version="v2"
        ):
            await websocket.send_json(
                _envelope(
                    event.get("event", "unknown"),
                    job_id,
                    {
                        "name": event.get("name"),
                        "data": _jsonable(event.get("data")),
                    },
                )
            )

        await websocket.send_json(
            _envelope("run.completed", job_id, {"message": "graph run finished"})
        )
    except WebSocketDisconnect:
        logger.info("Client disconnected from job_id=%s", job_id)
    except Exception as exc:  # noqa: BLE001 - scaffold: report, don't crash socket
        logger.exception("Error during graph run for job_id=%s", job_id)
        try:
            await websocket.send_json(
                _envelope("run.error", job_id, {"error": str(exc)})
            )
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


def _jsonable(obj: Any) -> Any:
    """Best-effort convert event data to something json-serializable.

    astream_events payloads can contain rich objects; for a scaffold we only
    need a safe, lossy string/dict view so the socket never chokes.
    """
    try:
        import json

        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        if isinstance(obj, dict):
            return {k: _jsonable(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_jsonable(v) for v in obj]
        return repr(obj)
