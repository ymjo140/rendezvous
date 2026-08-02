# -*- coding: utf-8 -*-
"""메뉴 분류가 프론트(lib/stock-image.ts)와 어긋나지 않는지 붙잡아 둔다.

같은 규칙이 두 곳에 산다. 한쪽만 고치면 같은 가게가 홈탭에서는 국밥 사진인데
온보딩에서는 백반으로 잡히는 식으로 조용히 어긋난다. 그래서 TS 파일에서 정규식을
직접 읽어 파이썬 쪽과 문자 단위로 비교한다.

pytest가 없어도 `python tests/test_menu_taxonomy.py`로 돌아간다.
"""
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from core import menu_taxonomy as mt  # noqa: E402

TS = os.path.join(os.path.dirname(__file__), "..", "..", "lib", "stock-image.ts")


def _load_ts(const_name):
    src = open(TS, encoding="utf-8").read()
    body = src.split(f"const {const_name}: [RegExp, string][] = [")[1].split("\n]")[0]
    return [(m.group(1), m.group(2)) for m in re.finditer(r'\[/(.+?)/, "(\w+)"\]', body)]


def test_pools_match_frontend():
    ts = _load_ts("POOLS")
    py = [(rx.pattern, key) for rx, key in mt.POOLS]
    assert len(ts) == len(py), f"풀 개수가 다르다: TS {len(ts)} vs PY {len(py)}"
    for i, (t, p) in enumerate(zip(ts, py)):
        assert t == p, f"{i+1}번째가 다르다:\n  TS {t}\n  PY {p}"


def test_category_only_match_frontend():
    ts = _load_ts("CATEGORY_ONLY")
    py = [(rx.pattern, key) for rx, key in mt.CATEGORY_ONLY]
    assert ts == py, f"CATEGORY_ONLY가 다르다:\n  TS {ts}\n  PY {py}"


def test_every_pool_has_a_card():
    """사진 풀과 메뉴 카드가 1:1이어야 한다 — 카드 없는 풀은 화면에서 못 고른다."""
    pools = {k for _, k in mt.POOLS} | {mt.FALLBACK}
    cards = {c["key"] for c in mt.MENU_CARDS}
    assert pools == cards, f"짝이 안 맞는다: 풀에만 {pools - cards}, 카드에만 {cards - pools}"


def test_card_groups_are_known():
    for c in mt.MENU_CARDS:
        assert c["group"] in mt.GROUP_ORDER, f"{c['title']}의 대분류 '{c['group']}'가 목록에 없다"


def test_known_cases():
    """실제로 틀렸던 것들 — 회귀 방지."""
    cases = [
        ("인카페(in cafe)", "호프/통닭", None, "cafe"),      # 이름이 업종을 이긴다
        ("세계맥주3도씨", "호프/통닭", None, "pub"),
        ("퍼멘트베이커리", "기타", None, "bakery"),          # '커리'가 베이커리에 걸리던 오탐
        ("향토칼국수", "분식", None, "kalguksu"),
        ("춘천막국수", "한식", None, "naengmyeon"),
        ("아쯔마로", "일식", None, "sashimi"),
        ("배타집 성수역점", "식육(숯불구이)", None, "gogi"),
        ("그린하우스", "기타", "CAFE", "cafe"),              # main_category가 마지막 힌트
        ("우리식당", "한식", "RESTAURANT", "korean"),
    ]
    for name, cat, mc, want in cases:
        got = mt.menu_key(name, cat, mc)
        assert got == want, f"{name}[{cat}/{mc}] → {got} (기대 {want})"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  OK   {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL {fn.__name__}: {e}")
    print(f"\n{len(fns)}건 중 {len(fns)-failed}건 통과")
    sys.exit(1 if failed else 0)
