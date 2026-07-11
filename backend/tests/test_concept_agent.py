"""
Unit tests for the Concept Agent's validation/re-prompt/degrade logic --
same rationale as test_product_truth_extractor.py: these code paths (malformed
variant, duplicate framework/hook, degrade to best-N, single-survivor
short-circuit) are unlikely to fire reliably against the real model on demand,
so they're covered with a fake client instead.
"""
from __future__ import annotations

import json

import pytest

from agents.concept_agent import (
    FRAMEWORKS,
    MIN_VARIANTS_AFTER_DEGRADE,
    REQUIRED_VARIANT_COUNT,
    _build_system_prompt,
    _flaw_led_hook_problem,
    _has_human_moment_marker,
    _rhyme_problems,
    _validate_variant,
    generate_script_variants,
)
from tests._fakes import FakeOpenAIClient


TRUTHS = [
    {"truth_id": "t1", "fact": "matte black anodized aluminum finish", "category": "material", "source": "photo_1"},
    {"truth_id": "t2", "fact": "dual cylindrical hinge with knurled end caps", "category": "construction_detail", "source": "photo_1"},
    {"truth_id": "t3", "fact": "faint scuff on the base plate's right cutout", "category": "imperfection", "source": "photo_1"},
    {"truth_id": "t4", "fact": "deep navy blue colorway", "category": "color", "source": "photo_1"},
]


def _beats(target_length_sec: int = 15) -> list[dict]:
    return [
        {"t_start": 0, "t_end": 3, "line": "Your phone slides off every stand -- not this one."},
        {"t_start": 3, "t_end": 8, "line": "This one grips with a dual knurled hinge."},
        {"t_start": 8, "t_end": target_length_sec, "line": "Tap to get yours."},
    ]


def _variant(variant_id: str, framework: str, hook_type: str, trigger: str, gti=("t1", "t2"), hook_line=None) -> dict:
    beats = _beats()
    if hook_line is not None:
        beats[0]["line"] = hook_line
    return {
        "variant_id": variant_id,
        "text": "Your phone keeps sliding off every stand you own. This one grips with a dual knurled hinge. Tap to get yours.",
        "framework": framework,
        "hook_type": hook_type,
        "emotional_trigger": trigger,
        "grounding_truth_ids": list(gti),
        "beats": beats,
    }


def _payload(variants: list[dict]) -> str:
    return json.dumps({"script_variants": variants})


FOUR_GOOD_VARIANTS = [
    _variant("v1", "hook_problem_product_cta", "pattern interrupt", "curiosity"),
    _variant("v2", "PAS", "bold claim", "FOMO"),
    _variant("v3", "AIDA", "social proof", "recognition"),
    _variant("v4", "BAB", "how-to", "relief"),
]


@pytest.mark.asyncio
async def test_four_good_variants_pass_without_reprompt():
    client = FakeOpenAIClient([_payload(FOUR_GOOD_VARIANTS)])

    result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert client.call_count == 1
    assert len(result) == REQUIRED_VARIANT_COUNT
    assert {v["framework"] for v in result} == set(FRAMEWORKS)


@pytest.mark.asyncio
async def test_too_few_grounding_ids_triggers_reprompt_and_fix_is_accepted():
    bad = _variant("v4", "BAB", "how-to", "relief", gti=("t1",))  # only 1, needs 2
    first = _payload(FOUR_GOOD_VARIANTS[:3] + [bad])
    fixed_v4 = _variant("v4", "BAB", "how-to", "relief", gti=("t1", "t3"))
    retry = _payload(FOUR_GOOD_VARIANTS[:3] + [fixed_v4])
    client = FakeOpenAIClient([first, retry])

    result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert client.call_count == 2
    assert len(result) == REQUIRED_VARIANT_COUNT


@pytest.mark.asyncio
async def test_unknown_truth_id_is_rejected():
    bad = _variant("v4", "BAB", "how-to", "relief", gti=("t1", "t99"))  # t99 doesn't exist
    only_attempt = _payload(FOUR_GOOD_VARIANTS[:3] + [bad])
    client = FakeOpenAIClient([only_attempt, only_attempt])  # retry would repeat the same mistake

    result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert len(result) == 3, "the variant citing a nonexistent truth_id must be dropped"
    assert {v["variant_id"] for v in result} == {"v1", "v2", "v3"}


@pytest.mark.asyncio
async def test_duplicate_frameworks_across_variants_triggers_reprompt():
    dup = [
        _variant("v1", "PAS", "pattern interrupt", "curiosity"),
        _variant("v2", "PAS", "bold claim", "FOMO"),  # duplicate framework with v1
        _variant("v3", "AIDA", "social proof", "recognition"),
        _variant("v4", "BAB", "how-to", "relief"),
    ]
    first = _payload(dup)
    client = FakeOpenAIClient([first, _payload(FOUR_GOOD_VARIANTS)])

    result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert client.call_count == 2, "duplicate framework across variants must trigger a re-prompt"
    assert len(result) == REQUIRED_VARIANT_COUNT
    assert {v["framework"] for v in result} == set(FRAMEWORKS)


@pytest.mark.asyncio
async def test_grounding_in_only_generic_categories_triggers_reprompt():
    # t1 (material) + t4 (color) -- 2 ids, satisfies the count bar, but neither
    # is an "imperfection"/"construction_detail" -- must still be rejected.
    generic_only = _variant("v4", "BAB", "how-to", "relief", gti=("t1", "t4"))
    first = _payload(FOUR_GOOD_VARIANTS[:3] + [generic_only])
    fixed = _variant("v4", "BAB", "how-to", "relief", gti=("t1", "t2"))  # t2 is construction_detail
    retry = _payload(FOUR_GOOD_VARIANTS[:3] + [fixed])
    client = FakeOpenAIClient([first, retry])

    result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert client.call_count == 2, "grounding in only generic categories must trigger a re-prompt"
    assert len(result) == REQUIRED_VARIANT_COUNT


@pytest.mark.asyncio
async def test_weak_hook_with_no_number_or_contrast_triggers_reprompt():
    weak_hook = _variant(
        "v4", "BAB", "how-to", "relief", hook_line="Look closely at this detail here."
    )
    first = _payload(FOUR_GOOD_VARIANTS[:3] + [weak_hook])
    fixed_hook = _variant(
        "v4", "BAB", "how-to", "relief", hook_line="Scratched in 2 uses. Not this one."
    )
    retry = _payload(FOUR_GOOD_VARIANTS[:3] + [fixed_hook])
    client = FakeOpenAIClient([first, retry])

    result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert client.call_count == 2, "a hook with no number and no contrast marker must trigger a re-prompt"
    assert len(result) == REQUIRED_VARIANT_COUNT


@pytest.mark.asyncio
async def test_degrades_to_best_n_when_retry_still_bad(caplog):
    bad = _variant("v4", "BAB", "how-to", "relief", gti=("t1",))  # invalid: only 1 grounding id
    first = _payload(FOUR_GOOD_VARIANTS[:3] + [bad])
    still_bad = _payload(FOUR_GOOD_VARIANTS[:3] + [bad])  # retry repeats the same mistake
    client = FakeOpenAIClient([first, still_bad])

    with caplog.at_level("INFO"):
        result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert len(result) == 3, "must degrade to the 3 valid variants rather than block the job"
    assert len(result) >= MIN_VARIANTS_AFTER_DEGRADE


@pytest.mark.asyncio
async def test_single_surviving_variant_is_accepted_as_a_degrade_state(caplog):
    only_one_valid = _payload([FOUR_GOOD_VARIANTS[0]])
    client = FakeOpenAIClient([only_one_valid, only_one_valid])

    with caplog.at_level("WARNING"):
        result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert len(result) == 1
    assert any("proceeding degraded" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# VOICE backstop: lift detection + stacked-compound detection (_validate_variant).
# Exercised directly against _validate_variant since the thing under test is
# the exact violation string, not just whether a re-prompt fires.
# ---------------------------------------------------------------------------

_TRUTH_CATEGORIES = {t["truth_id"]: t["category"] for t in TRUTHS}
_TRUTH_FACTS = {t["truth_id"]: t["fact"] for t in TRUTHS}


def test_lifted_phrase_from_cited_truth_is_flagged():
    # t2's fact is "dual cylindrical hinge with knurled end caps" -- this line
    # quotes "dual cylindrical hinge with" (4 consecutive words) verbatim.
    v = _variant("v1", "hook_problem_product_cta", "pattern interrupt", "curiosity", gti=("t1", "t2"))
    v["beats"][1]["line"] = "This bag has a dual cylindrical hinge with knurled caps."

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert any(
        "reuses 4+ consecutive words" in p and "t2" in p for p in problems
    ), f"expected a lift violation naming t2, got: {problems}"


def test_stacked_hyphenated_compounds_before_noun_is_flagged():
    v = _variant("v1", "hook_problem_product_cta", "pattern interrupt", "curiosity", gti=("t1", "t2"))
    v["beats"][1]["line"] = "This brass-zippered, dome-topped bag only gets better."

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert any(
        "stacks hyphenated compound modifiers" in p for p in problems
    ), f"expected a stacked-compound violation, got: {problems}"


def test_natural_transformed_line_passes_voice_checks_cleanly():
    # Same truths (t1/t2) cited, but transformed into spoken language rather
    # than lifted -- must NOT false-positive on ordinary grounded copy.
    # (beat 1's line deliberately avoids ending on a word that rhymes with the
    # default hook beat's "stand" -- e.g. "hand" -- so this stays a clean test
    # of the lift/stacked-compound checks, not an incidental anti-rhyme hit.)
    v = _variant("v1", "hook_problem_product_cta", "pattern interrupt", "curiosity", gti=("t1", "t2"))
    v["beats"][1]["line"] = "That hinge? Actual knurled metal -- it won't ever slip loose."

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert problems == [], f"natural transformed line should pass cleanly, got: {problems}"


@pytest.mark.asyncio
async def test_lifted_phrasing_triggers_reprompt_through_full_flow():
    lifted = _variant("v4", "BAB", "how-to", "relief", gti=("t1", "t2"))
    lifted["beats"][1]["line"] = "It has a dual cylindrical hinge with knurled end caps."
    first = _payload(FOUR_GOOD_VARIANTS[:3] + [lifted])
    client = FakeOpenAIClient([first, _payload(FOUR_GOOD_VARIANTS)])

    result = await generate_script_variants("a brief", TRUTHS, client=client)

    assert client.call_count == 2, "a beat line lifting 4+ words from a cited truth must trigger a re-prompt"
    assert len(result) == REQUIRED_VARIANT_COUNT


def test_voice_prompt_block_present_in_system_prompt():
    prompt = _build_system_prompt(15)

    assert "VOICE -- SPOKEN, NOT CATALOG" in prompt
    assert "brass-zippered, dome-topped bag" in prompt
    assert "Never reuse 4 or more consecutive words" in prompt


# ---------------------------------------------------------------------------
# PRONOUN THREAD backstop (_reintroduction_problems, wired into _validate_variant).
# ---------------------------------------------------------------------------


def test_reintroduction_of_implied_person_is_flagged():
    v = _variant("v1", "hook_problem_product_cta", "pattern interrupt", "curiosity", gti=("t1", "t2"))
    v["beats"] = [
        {"t_start": 0, "t_end": 3, "line": "She slings it over one shoulder on her way out the door."},
        {"t_start": 3, "t_end": 8, "line": "A person grips the knurled hinge without looking down."},
        {"t_start": 8, "t_end": 15, "line": "Tap to get yours."},
    ]

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert any(
        "reintroduces the story's person generically" in p and "beat 1" in p for p in problems
    ), f"expected a reintroduction violation naming beat 1, got: {problems}"


def test_consistent_pronoun_thread_passes_cleanly():
    v = _variant("v1", "hook_problem_product_cta", "pattern interrupt", "curiosity", gti=("t1", "t2"))
    v["beats"] = [
        {"t_start": 0, "t_end": 3, "line": "She slings it over one shoulder on her way out the door."},
        {"t_start": 3, "t_end": 8, "line": "Her grip finds the knurled hinge without looking down."},
        {"t_start": 8, "t_end": 15, "line": "Tap to get yours."},
    ]

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert not any("reintroduces the story's person" in p for p in problems), (
        f"a consistent pronoun thread must not be flagged, got: {problems}"
    )


def test_no_pronoun_at_all_is_never_flagged():
    # A legitimately person-free variant (pure product/material beats) must
    # never trip the reintroduction check -- it only activates once a pronoun
    # has actually appeared.
    v = _variant("v1", "hook_problem_product_cta", "pattern interrupt", "curiosity", gti=("t1", "t2"))
    v["beats"] = [
        {"t_start": 0, "t_end": 3, "line": "That hinge? Actual knurled metal."},
        {"t_start": 3, "t_end": 8, "line": "A hand tests the grip before it ships."},
        {"t_start": 8, "t_end": 15, "line": "Tap to get yours."},
    ]

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert not any("reintroduces the story's person" in p for p in problems), (
        f"no pronoun ever appeared, so nothing should be flagged, got: {problems}"
    )


def test_pronoun_thread_rule_present_in_system_prompt():
    prompt = _build_system_prompt(15)

    assert "PRONOUN THREAD" in prompt
    assert "SAME pronoun" in prompt


# ---------------------------------------------------------------------------
# Backstory-First fix (video-gen-fidelity, 2026-07-11): anti-rhyme check,
# hook_type-gated hook floor, flaw-led-hook backstop.
# ---------------------------------------------------------------------------


def test_rhyme_problems_flags_genuine_rhyme_pair():
    # "gear"/"here" -- CMUdict transcribes them inconsistently (G IH1 R vs.
    # HH IY1 R) even though they're the same NEAR vowel in most dialects;
    # _normalize_rhyme_phones' IH/IY-before-R canonicalization is what makes
    # this genuinely-rhyming pair actually match.
    beats = [
        {"line": "Stop babying your gear."},
        {"line": "It belongs right here."},
    ]

    problems = _rhyme_problems(beats)

    assert any("gear" in p and "here" in p for p in problems), (
        f"expected a flagged rhyme between 'gear' and 'here', got: {problems}"
    )


def test_rhyme_problems_does_not_flag_non_rhyming_pair():
    beats = [
        {"line": "Stop babying your backpack."},
        {"line": "It belongs on the shelf."},
    ]

    assert _rhyme_problems(beats) == []


def test_rhyme_problems_does_not_flag_identical_word_repetition():
    # Repeating the same word is not a rhyme -- it's repetition, and must
    # never be flagged by the anti-rhyme check.
    beats = [
        {"line": "She loves her gear."},
        {"line": "She loves her gear."},
    ]

    assert _rhyme_problems(beats) == []


def test_rhyme_problems_does_not_flag_short_or_stopword_final_words():
    # Both clause-final candidates here are stopwords/too short ("so", "go")
    # and are filtered out before any rhyme comparison happens.
    beats = [
        {"line": "It is a bag, so."},
        {"line": "Grab yours, go."},
    ]

    assert _rhyme_problems(beats) == []


def test_rhyme_problems_does_not_false_positive_on_natural_lessen_strengthen_pair():
    # The exact false-positive case naive same-last-syllable matching is
    # documented to produce -- "lessen" (EH1 S AH0 N) and "strengthen"
    # (EH1 NG TH AH0 N) do NOT share a rhyming_part, so pronouncing's real
    # phonetic rhyme unit correctly does not flag them.
    beats = [
        {"line": "Time will lessen the shine."},
        {"line": "It only makes it strengthen."},
    ]

    assert _rhyme_problems(beats) == []


def test_human_moment_hook_passes_for_story_curiosity_hook_type():
    # No digit, no contrast marker -- would fail the OLD floor
    # (_hook_has_number_or_contrast) outright. hook_type "curiosity gap" is a
    # story/curiosity type, so it's judged on _has_human_moment_marker
    # instead: a pronoun ("She's") plus concrete nouns ("door", "shoulder").
    hook_line = "She's out the door before sunrise, bag on one shoulder."
    assert _has_human_moment_marker(hook_line)
    v = _variant(
        "v1", "hook_problem_product_cta", "curiosity gap", "curiosity",
        gti=("t1", "t2"), hook_line=hook_line,
    )

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert not any("has no number and no contrast marker" in p for p in problems), (
        f"a story/curiosity hook_type must not be judged on the number/contrast floor, got: {problems}"
    )
    assert not any("personal pronoun/second-person address" in p for p in problems), (
        f"this hook line DOES carry a human-moment marker and must pass, got: {problems}"
    )


def test_human_moment_hook_still_fails_number_contrast_floor_for_claim_led_hook_type():
    # Same hook line as the test above, but hook_type is claim-led ("bold
    # claim") -- proves the hook_type gating is REAL, not a no-op that quietly
    # accepts any hook regardless of its declared type. A human-moment hook
    # is not automatically a substitute for a claim-led hook's own floor.
    hook_line = "She's out the door before sunrise, bag on one shoulder."
    v = _variant(
        "v1", "hook_problem_product_cta", "bold claim", "curiosity",
        gti=("t1", "t2"), hook_line=hook_line,
    )

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert any("has no number and no contrast marker" in p for p in problems), (
        f"a claim-led hook_type must still enforce the number/contrast floor, got: {problems}"
    )


def test_flaw_led_hook_backstop_rejects_competitor_flaw_comparison():
    # The exact real winning-script failure mode that triggered this fix.
    problem = _flaw_led_hook_problem(
        "Other bags hide this scuff, not ours.", cited_truths=[], truth_categories={}
    )

    assert problem is not None
    assert "competitor-flaw comparison" in problem


def test_flaw_led_hook_backstop_rejects_via_validate_variant():
    hook_line = "Other bags hide this scuff, not ours."
    v = _variant(
        "v1", "hook_problem_product_cta", "bold claim", "curiosity",
        gti=("t1", "t3"), hook_line=hook_line,
    )

    problems = _validate_variant(v, _TRUTH_CATEGORIES, 15, _TRUTH_FACTS)

    assert any("competitor-flaw comparison" in p for p in problems), (
        f"expected the flaw-led-hook backstop to fire through _validate_variant, got: {problems}"
    )


def test_flaw_led_hook_backstop_does_not_flag_an_ordinary_claim_hook():
    problem = _flaw_led_hook_problem(
        "Your coffee is cold in 12 minutes. Mine isn't.", cited_truths=[], truth_categories={}
    )

    assert problem is None
