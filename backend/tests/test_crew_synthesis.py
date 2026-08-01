# -*- coding: utf-8 -*-
"""집단 합성의 '말과 순서'를 지키는 테스트 — DB도 임베딩도 필요 없다.

이번 세션에 네 번 바뀐 부분이다(게이트 완화, 합집합·총합 정렬, 문구 분기,
양보 가중치 제거). 전부 순수 로직이라 여기서 잡을 수 있고, 안 잡으면
다음에 누가 문구 한 줄 고칠 때 조용히 거짓말이 된다.

실행: python backend/tests/test_crew_synthesis.py
(pytest가 깔려 있으면 pytest로도 그대로 돈다)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

# taste_service 전체를 import하면 DB/모델까지 딸려온다. 문구 함수만 떼어 쓴다.
import ast
import types

_SRC = os.path.join(os.path.dirname(__file__), "..", "src", "services", "taste_service.py")


def _load_pure(names):
    """taste_service에서 순수 함수/상수만 뽑아 실행한다(모듈 import 없이)."""
    tree = ast.parse(open(_SRC, encoding="utf-8").read())
    keep = [n for n in tree.body
            if (isinstance(n, (ast.FunctionDef,)) and n.name in names)
            or (isinstance(n, ast.Assign)
                and any(getattr(t, "id", None) in names for t in n.targets))]
    mod = types.ModuleType("pure")
    from typing import Optional  # 시그니처의 Optional[int]가 평가된다
    mod.__dict__["Optional"] = Optional
    exec(compile(ast.Module(body=keep, type_ignores=[]), _SRC, "exec"), mod.__dict__)
    return mod


_pure = _load_pure({"crew_reason", "GATE_FPR", "GATE_LEVELS", "W_MIN", "W_MEAN"})
crew_reason = _pure.crew_reason


def pick(sat, tot, weakest="조영민", weakest_id=7):
    return {"satisfied": sat, "total": tot, "weakest": weakest, "weakest_id": weakest_id}


# ── 문구: 이름은 '못 넘은 사람이 정확히 한 명'일 때만 부른다 ──────────────

def test_전원_통과는_이름을_안_부른다():
    txt, kind = crew_reason(pick(5, 5), [])
    assert txt == "5명 모두 취향에 맞아요"
    assert kind == "group_all"
    assert "조영민" not in txt


def test_한_명만_미달이면_그_사람을_부른다():
    txt, kind = crew_reason(pick(4, 5), [])
    assert txt == "5명 중 4명 취향에 맞아요 · 조영민님이 양보해야 해요"
    assert kind == "group_most"


def test_여럿이_미달이면_숫자로_말한다():
    # 5명 중 1명만 통과 = 넷이 양보하는 상황. 한 명만 부르면 나머지 셋이 괜찮아 보인다.
    txt, kind = crew_reason(pick(1, 5), [])
    assert txt == "5명 중 1명만 취향에 맞아요 · 4명이 양보해야 해요"
    assert "조영민" not in txt
    assert kind == "group_weak"


def test_아무도_못_넘으면_가장_먼_사람을_말한다():
    txt, kind = crew_reason(pick(0, 5), [])
    assert txt == "5명 다 기준 밖이에요 · 조영민님이 가장 멀어요"
    assert kind == "group_none"


def test_기준을_풀면_취향에_맞아요라고_안_한다():
    # 상위 20%를 상위 5%인 척하면 그게 매칭%와 같은 거짓말이 된다.
    txt, _ = crew_reason(pick(5, 5), [], strict=False)
    assert txt == "5명 모두 무난한 편이에요"
    assert "취향에 맞아요" not in txt


def test_본인이면_내가로_부른다():
    mine, _ = crew_reason(pick(4, 5), [], me_id=7)
    other, _ = crew_reason(pick(4, 5), [], me_id=99)
    assert mine == "5명 중 4명 취향에 맞아요 · 내가 양보해야 해요"
    assert "조영민님이" in other       # 남이 볼 땐 이름 — 저장되는 건 이쪽이다


def test_혼자일_때는_인원수를_안_센다():
    assert crew_reason(pick(1, 1), [])[0] == "취향에 맞아요"
    assert crew_reason(pick(0, 1), [])[0] == "취향과는 거리가 있어요"


def test_빈_입력은_조용히_없음을_반환():
    assert crew_reason({}, []) == (None, None)
    assert crew_reason(pick(0, 0), []) == (None, None)


# ── 순서: 합집합에서 총합이 높은 순, 동점이면 최소만족 ────────────────────

def _entry(margins):
    sat = sum(1 for m in margins if m > 0)
    return {"satisfied": sat, "total": len(margins),
            "total_margin": round(sum(margins), 4),
            "score": round(_pure.W_MIN * min(margins) + _pure.W_MEAN * (sum(margins) / len(margins)), 4)}


def _order(kv):
    """polls.suggest의 정렬 키와 같은 규칙."""
    return (-kv[1]["total_margin"], -kv[1]["score"])


def test_합집합은_아무도_못_넘은_곳을_추천에서_뺀다():
    picks = {"A": _entry([0.3, -0.02, -0.03]), "D": _entry([-0.01, -0.02, -0.05])}
    hit = [k for k, v in picks.items() if v["satisfied"] > 0]
    assert hit == ["A"]          # D는 추천이 아니다(목록에서 지우진 않고 아래로 내린다)


def test_총합이_높은_곳이_위로_간다():
    picks = {
        "한 명이 아주 좋아함": _entry([0.30, -0.02, -0.03]),
        "두 명이 조금씩": _entry([0.06, 0.05, -0.04]),
        "셋 다 조금씩": _entry([0.02, 0.01, 0.01]),
    }
    order = [k for k, _ in sorted(picks.items(), key=_order)]
    assert order[0] == "한 명이 아주 좋아함"
    # ★설계상 그렇다★ — 총합 기준이라 전원 통과가 1등이 아닐 수 있다.
    # 라벨이 사실을 말하므로(3명 중 1명만) 화면은 거짓말하지 않는다.
    assert order[-1] == "셋 다 조금씩"


def test_총합이_같으면_아무도_안_참는_쪽이_앞():
    picks = {"고른 쪽": _entry([0.03, 0.03, 0.03]), "쏠린 쪽": _entry([0.09, 0.0, 0.0])}
    order = [k for k, _ in sorted(picks.items(), key=_order)]
    assert order[0] == "고른 쪽"


# ── 게이트 단계 ──────────────────────────────────────────────────────

def test_게이트는_5퍼센트에서_시작해_넓어지기만_한다():
    lv = list(_pure.GATE_LEVELS)
    assert lv[0] == _pure.GATE_FPR == 0.05
    assert lv == sorted(lv)
    assert lv[-1] <= 0.5, "절반을 넘기면 '무난하다'는 말이 의미를 잃는다"


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  PASS  {name}")
            except AssertionError as e:
                fails += 1
                print(f"  FAIL  {name}: {e}")
    print(f"\n{'실패 ' + str(fails) + '건' if fails else '전부 통과'}")
    sys.exit(1 if fails else 0)
