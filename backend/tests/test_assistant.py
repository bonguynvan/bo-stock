"""Research assistant — grounding + prompt assembly + not-configured guard."""
from __future__ import annotations

import pytest

from app.services import assistant
from app.services.llm import LLMNotConfigured


def test_build_user_content_embeds_context_and_question() -> None:
    out = assistant.build_user_content("ROE của FPT?", {"symbol": "FPT", "metrics": {"roe": 27}})
    assert "CÂU HỎI" in out
    assert "ROE của FPT?" in out
    assert '"roe": 27' in out
    assert "FPT" in out


def test_build_messages_carries_history_and_ends_with_user() -> None:
    history = [
        {"role": "user", "content": "ROE?"},
        {"role": "assistant", "content": "ROE 27%."},
    ]
    msgs = assistant.build_messages(history, "Còn ROA?", {"symbol": "FPT"})
    assert [m["role"] for m in msgs] == ["user", "assistant", "user"]
    assert msgs[-1]["content"][0]["text"].endswith("Còn ROA?")


def test_build_messages_drops_trailing_user_to_keep_alternation() -> None:
    # A dangling user turn (no answer yet) must not precede the new user turn.
    history = [{"role": "assistant", "content": "A"}, {"role": "user", "content": "orphan"}]
    msgs = assistant.build_messages(history, "Q?", {})
    assert [m["role"] for m in msgs] == ["assistant", "user"]


def test_build_messages_drops_interior_consecutive_same_role() -> None:
    history = [
        {"role": "user", "content": "a"},
        {"role": "user", "content": "b"},  # consecutive user — must be dropped
        {"role": "assistant", "content": "c"},
    ]
    msgs = assistant.build_messages(history, "Q?", {})
    assert [m["role"] for m in msgs] == ["user", "assistant", "user"]
    # No two adjacent turns share a role.
    assert all(msgs[i]["role"] != msgs[i + 1]["role"] for i in range(len(msgs) - 1))


def test_build_messages_caps_history() -> None:
    history = [{"role": "assistant", "content": f"a{i}"} for i in range(20)]
    msgs = assistant.build_messages(history, "Q?", {})
    assert len(msgs) <= 7  # 6 capped history + current


async def test_gather_context_pulls_metrics_for_symbol(session) -> None:
    ctx = await assistant.gather_context(session, "aaa")
    assert ctx["symbol"] == "AAA"
    # Seeded fixture AAA has ROE=30, quant=90.
    assert ctx["metrics"]["roe"] == 30.0
    assert ctx["metrics"]["quant_score"] == 90.0


async def test_gather_context_without_symbol_notes_general(session) -> None:
    ctx = await assistant.gather_context(session, None)
    assert "note" in ctx
    assert "symbol" not in ctx


async def test_answer_question_raises_without_api_key(session, monkeypatch) -> None:
    # Ensure no key configured on the cached settings.
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "anthropic_api_key", None, raising=False)
    with pytest.raises(LLMNotConfigured):
        await assistant.answer_question(session, "Câu hỏi?", "AAA")
