"""
Integration test extending test_graph_critic_chain.py one node further: does
the compiled LangGraph actually drive meta_critic -> merge_validator, with
`merge_validator_node`'s `adispatch_custom_event` call, `RunnableConfig`
injection, and `winning_script` finalization all working for real (not just
as bare function calls)? `merge_validator_node` cannot be unit-tested in
isolation (see test_merge_validator.py's module docstring -- it calls
`adispatch_custom_event`, which raises without a real parent run id), so this
is the one place that path is actually exercised.

Only the network boundary is faked; StateGraph, superstep scheduling, the
checkpointer, astream_events and custom-event dispatch are all real.

NOTE (test data / real bug-shaped finding): test_graph_build.py's shared
FOUR_GOOD_VARIANTS fixture gives each variant exactly ONE body beat (hook,
body, cta -- a 3-beat script). meta_critic's real Step 6 re-timing therefore
hands the Merge Coherence Validator a merge candidate with a single ~9s body
beat, which genuinely fails the pacing re-check's early-beat window (2-3s) --
and with only one body beat, the one deterministic repair has no OTHER beat
to redistribute slack to/from, so it CANNOT be fixed (see
test_merge_validator.py's `_mk_unfixable_candidate` unit test for the same
degenerate shape in isolation). This is not a bug in this test or in
merge_validator.py -- it is a real, honest demonstration of the pacing ->
fallback path using the existing shared fixture, so this test asserts THAT
path (rather than a clean pass, which the shared fixture cannot produce
without giving each variant a second body beat).

NOTE (graph wiring placeholder): graph/build.py currently points the
"copy_editor" conditional-edge target at "meta_critic" as a placeholder,
pending agents/copy_editor.py from a parallel build (see graph/build.py's
PLACEHOLDER comment). This test's path (pacing failure -> immediate fallback)
never touches that placeholder edge.
"""
from __future__ import annotations

import json

import pytest

from graph.build import build_graph
from tests._fakes import make_content_routed_sync_openai, make_fake_async_openai
from tests._phase3_graph import (
    patch_assembly_boundaries,
    patch_continuity_boundaries,
    patch_format_export_boundaries,
    patch_phase3_boundaries,
    patch_visual_direction_boundaries,
    patch_voiceover_boundaries,
)
from tests.test_graph_build import (
    CHECKER_ROUTES,
    CONCEPT_AGENT_PAYLOAD,
    HOOK_PAYLOAD,
    SHOT_LIST_CALL_A_PAYLOAD,
    SHOT_LIST_CALL_B_PAYLOAD,
    TREATMENT_PAYLOAD,
    TRUTH_EXTRACTOR_PAYLOAD,
)


@pytest.mark.asyncio
async def test_merge_validator_falls_back_on_unrepairable_pacing_failure(monkeypatch):
    monkeypatch.setattr(
        "agents.product_truth_extractor.AsyncOpenAI",
        make_fake_async_openai([TRUTH_EXTRACTOR_PAYLOAD]),
    )
    monkeypatch.setattr(
        "agents.concept_agent.AsyncOpenAI",
        make_fake_async_openai([CONCEPT_AGENT_PAYLOAD]),
    )
    monkeypatch.setattr(
        "agents.hook_checker.AsyncOpenAI",
        make_fake_async_openai([HOOK_PAYLOAD]),
    )
    # No coherence-read route needed: a pacing failure that survives the one
    # repair attempt skips the LLM coherence read entirely (see
    # validate_merge_candidate's step 2), so CHECKER_ROUTES alone is enough --
    # if the coherence read WERE (incorrectly) invoked, ContentRoutedSyncOpenAIClient
    # would raise AssertionError for the unmatched "BLIND COLD READ" prompt,
    # which doubles as a regression check for "no LLM call on this path".
    monkeypatch.setattr(
        "agents.critic_llm.OpenAI",
        make_content_routed_sync_openai(CHECKER_ROUTES),
    )
    # The fallback still sets a real winning_script, so the graph now runs on into
    # Phase 2 (Treatment Agent -> Shot-List Agent -> Budget Gate). Fake the two
    # agents' network boundary (Budget Gate is pure code).
    monkeypatch.setattr(
        "agents.treatment_agent.AsyncOpenAI",
        make_fake_async_openai([TREATMENT_PAYLOAD]),
    )
    monkeypatch.setattr(
        "agents.shot_list_agent.AsyncOpenAI",
        make_fake_async_openai([SHOT_LIST_CALL_A_PAYLOAD, SHOT_LIST_CALL_B_PAYLOAD]),
    )
    patch_visual_direction_boundaries(monkeypatch)
    patch_phase3_boundaries(monkeypatch, fail_shot_s2=False)
    patch_continuity_boundaries(monkeypatch)  # Phase 4: clean drift, no retry loop
    patch_voiceover_boundaries(monkeypatch)  # Phase 5: parallel branch off merge_validator
    patch_assembly_boundaries(monkeypatch)  # Phase 5: fan-in join off voiceover + continuity_gate
    patch_format_export_boundaries(monkeypatch)  # Phase 6: format exports without real ffmpeg/OSS

    graph = await build_graph()
    initial_state = {
        "job_id": "test-job-merge-validator",
        "product_photos": ["http://example.com/a.jpg"],
        # Positive-Only Truths fix: signals the explicit authentic/well-loved
        # carve-out -- see test_graph_build.py's GOOD_FACTS/FOUR_GOOD_VARIANTS
        # comment for why (this shared fixture's narrative is imperfection-led).
        "brief": "a durable everyday case with authentic, well-loved character",
    }
    config = {"configurable": {"thread_id": "test-job-merge-validator"}}

    custom_events = [
        event
        async for event in graph.astream_events(initial_state, config=config, version="v2")
        if event.get("event") == "on_custom_event"
    ]

    event_names = {e["name"] for e in custom_events}
    assert "merge_validated" in event_names
    merge_event = next(e for e in custom_events if e["name"] == "merge_validated")
    assert merge_event["data"]["attempt_number"] == 1
    assert merge_event["data"]["result"]["passed"] is False
    assert merge_event["data"]["result"]["failure_kind"] == "pacing"

    # The fallback path is a real, usable winning_script, so Phase 2 runs on to the
    # Budget Gate, which dispatches budget_updated (the only Phase 2 custom event).
    assert "budget_updated" in event_names
    budget_event = next(e for e in custom_events if e["name"] == "budget_updated")
    assert budget_event["data"]["ledger"]["cap"] > 0

    final = (await graph.aget_state(config)).values

    assert "merge_attempts" in final
    assert len(final["merge_attempts"]) == 1
    attempt = final["merge_attempts"][0]
    assert attempt["outcome"] == "fell_back_to_variant"
    assert attempt["coherence_check"]["passed"] is False
    assert attempt["coherence_check"]["failure_kind"] == "pacing"
    assert attempt["pacing_recheck"]["passed"] is False
    assert attempt["pacing_recheck"]["repaired"] is True

    fallback_id = final["meta_critic_result"]["fallback_variant_id"]
    assert fallback_id is not None

    assert "winning_script" in final
    winning = final["winning_script"]
    assert winning["source_variant_ids"] == [fallback_id]
    assert winning["text"]
    assert len(winning["beats"]) == 3  # the fallback variant's own, unmerged beats
    for beat in winning["beats"]:
        assert set(beat.keys()) == {"t_start", "t_end", "line"}

    # Phase 2 ran off the fallback winning_script: one beat_treatment per beat,
    # 3-7 shots each with a positive budget and no product_category, and a ledger.
    assert len(final["treatment"]["beat_treatments"]) == len(winning["beats"])
    shot_list = final["shot_list"]
    assert 3 <= len(shot_list) <= 7
    assert all(shot["allocated_budget"] > 0 for shot in shot_list)
    assert all("product_category" not in shot for shot in shot_list)
    assert final["budget_ledger"]["cap"] > 0
    assert final["budget_ledger"] == budget_event["data"]["ledger"]


@pytest.mark.asyncio
async def test_merge_validator_reports_job_failed_when_zero_variants_survive(monkeypatch):
    """Reproduces a real crash, confirmed on a live run: Concept Agent produced
    0/4 valid script variants (even after its targeted re-prompt), so
    meta_critic_node received script_variants=[] and short-circuited to
    meta_critic_result.outcome == "all_excluded_failure" with no
    merge_candidate at all. merge_validator_node used to let
    _candidate_from_state's ValueError propagate unhandled, crashing the
    whole graph run. It must now report job_failed and let the graph reach
    END gracefully instead -- this is the regression test for that fix.
    """
    monkeypatch.setattr(
        "agents.product_truth_extractor.AsyncOpenAI",
        make_fake_async_openai([TRUTH_EXTRACTOR_PAYLOAD]),
    )
    # Empty script_variants on every call (including the targeted re-prompt --
    # FakeOpenAIClient reuses the last response for calls beyond the list) is
    # exactly how a real "0/4 valid after re-prompt" run looks from Concept
    # Agent's own return value: generate_script_variants logs a warning and
    # returns [] rather than raising, so this is real, reachable behavior, not
    # a contrived state.
    monkeypatch.setattr(
        "agents.concept_agent.AsyncOpenAI",
        make_fake_async_openai([json.dumps({"script_variants": []})]),
    )
    # hook/pacing/body/cta/tone checkers all short-circuit to `return {}` on
    # empty script_variants (confirmed in agents/hook_checker.py and mirrored
    # across the other four) -- zero LLM calls happen on this path, so no
    # agents.critic_llm.OpenAI patch is needed at all.

    graph = await build_graph()
    initial_state = {
        "job_id": "test-job-merge-validator-zero-variants",
        "product_photos": ["http://example.com/a.jpg"],
        "brief": "charcoal briquettes for backyard grilling",
    }
    config = {"configurable": {"thread_id": "test-job-merge-validator-zero-variants"}}

    custom_events = [
        event
        async for event in graph.astream_events(initial_state, config=config, version="v2")
        if event.get("event") == "on_custom_event"
    ]

    event_names = {e["name"] for e in custom_events}
    # The old crash meant NEITHER of these could ever fire for this state shape.
    assert "job_failed" in event_names
    assert "merge_validated" not in event_names  # never got as far as validating anything

    failed_event = next(e for e in custom_events if e["name"] == "job_failed")
    assert failed_event["data"]["stage"] == "merge_validator"
    assert failed_event["data"]["reason"]  # non-empty, seller-visible text
    assert "all_excluded_failure" not in failed_event["data"]["reason"]  # no raw internals leaked to the user

    final = (await graph.aget_state(config)).values
    assert "job_failure" in final
    assert final["job_failure"]["stage"] == "merge_validator"
    assert "winning_script" not in final  # never produced -- nothing valid to build one from
    assert "treatment" not in final  # graph genuinely stopped here, didn't limp into Phase 2

    # The graph actually reached END (not stuck mid-run / not still pending a node).
    snapshot = await graph.aget_state(config)
    assert snapshot.next == ()
