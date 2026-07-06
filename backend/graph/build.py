"""
Phase 0 scaffold: a bare LangGraph graph with a single no-op node.

This exists to prove the orchestration plumbing end-to-end (graph compile +
checkpointer + astream_events) before any real agents are wired in. The single
`ping` node does nothing meaningful — it just echoes the job_id back into the
state so there is an observable state update to stream.

Checkpointer selection is graceful:
  - if DATABASE_URL is set  -> PostgresSaver (real durable checkpoints)
  - otherwise               -> MemorySaver  (standalone, no DB required)

Do NOT import/modify graph.state's schema shape — we only consume it.
"""
from __future__ import annotations

import logging
import os
from contextlib import ExitStack
from typing import Optional

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from graph.state import ProductCutState

logger = logging.getLogger("productcut.graph")


def ping_node(state: ProductCutState) -> dict:
    """No-op node: echo the job_id back so there's an observable state update.

    Returns a partial state update (LangGraph merges it into the channel state).
    """
    job_id = state.get("job_id", "unknown")
    logger.info("ping_node invoked for job_id=%s", job_id)
    return {"reasoning_trace": f"ping ok for job_id={job_id}"}


def _build_uncompiled() -> StateGraph:
    """Construct the (uncompiled) single-node graph."""
    builder = StateGraph(ProductCutState)
    builder.add_node("ping", ping_node)
    builder.add_edge(START, "ping")
    builder.add_edge("ping", END)
    return builder


def build_graph(exit_stack: Optional[ExitStack] = None):
    """Compile the Phase 0 graph with a checkpointer.

    If DATABASE_URL is present, use PostgresSaver (its context manager is entered
    via the provided ExitStack so the connection lives for the app's lifetime).
    Otherwise fall back to an in-memory MemorySaver so the scaffold runs
    standalone without a provisioned database.

    Args:
        exit_stack: optional ExitStack owned by the caller (e.g. the FastAPI
            lifespan) used to keep the Postgres connection open. If None and a
            DATABASE_URL is set, a module-level stack is used instead.

    Returns:
        A compiled LangGraph runnable.
    """
    builder = _build_uncompiled()
    database_url = os.getenv("DATABASE_URL")

    if database_url:
        try:
            from langgraph.checkpoint.postgres import PostgresSaver

            stack = exit_stack if exit_stack is not None else ExitStack()
            checkpointer = stack.enter_context(
                PostgresSaver.from_conn_string(database_url)
            )
            checkpointer.setup()
            logger.info("Checkpointer: PostgresSaver (DATABASE_URL detected)")
            return builder.compile(checkpointer=checkpointer)
        except Exception as exc:  # noqa: BLE001 - scaffold must not hard-fail
            logger.warning(
                "DATABASE_URL set but PostgresSaver init failed (%s); "
                "falling back to MemorySaver",
                exc,
            )

    logger.info("Checkpointer: MemorySaver (no DATABASE_URL — standalone mode)")
    return builder.compile(checkpointer=MemorySaver())
