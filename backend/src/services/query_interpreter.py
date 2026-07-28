# -*- coding: utf-8 -*-
"""검색어를 지역·음식·목적으로 쪼갠다.

## 왜 필요한가

"신논현"을 치면 아무것도 안 나왔다. 검색어(q)는 **리스트 이름과 설명만** 봤고,
지역은 하드코딩된 칩 8개(성수·홍대·강남·연남·이태원·망원·판교·성북)로만 고를 수
있었다. 같은 "강남"이라도 칩을 누르면 가게 주소를 보고, 검색창에 치면 리스트
이름만 봤다 — 두 경로가 서로 다른 걸 보고 있었다.

## 어떻게

1. 상권 사전 — 지도에 안 나오는 생활권 이름(신논현·연트럴파크 등). 사람이 관리.
2. 행정 토큰 사전 — places.address에서 '~구/~동' 토큰과 대표 좌표를 뽑는다.
   359개가 자동으로 나오고, 카드에 찍히는 지역명(_area_of)과 같은 어휘라 어긋나지 않는다.
3. 음식·목적 — 기존 FOOD_KEYWORDS / TAG_NAME_HINTS 재사용.
4. **해석한 토큰은 검색어에서 뺀다.** 안 빼면 '신논현 파스타'가 리스트 이름에
   "신논현 파스타"가 없다는 이유로 0건이 된다(q와 region이 백엔드에서 AND라서).
"""
from __future__ import annotations

import re
import time
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# 지도 행정구역에 없지만 사람들이 쓰는 생활권 이름. 좌표는 대표 지점.
LANDMARKS = {
    "신논현": (37.5045, 127.0250), "강남역": (37.4979, 127.0276),
    "홍대": (37.5572, 126.9245), "홍대입구": (37.5572, 126.9245),
    "연남": (37.5606, 126.9256), "연트럴파크": (37.5606, 126.9256),
    "성수": (37.5446, 127.0559), "서울숲": (37.5444, 127.0374),
    "을지로": (37.5663, 126.9925), "을지로3가": (37.5663, 126.9925),
    "이태원": (37.5345, 126.9946), "경리단길": (37.5400, 126.9880),
    "망원": (37.5560, 126.9020), "합정": (37.5495, 126.9137),
    "가로수길": (37.5205, 127.0230), "압구정": (37.5270, 127.0286),
    "청담": (37.5197, 127.0530), "삼성": (37.5088, 127.0631),
    "선릉": (37.5045, 127.0490), "역삼": (37.5008, 127.0364),
    "논현": (37.5110, 127.0215), "잠실": (37.5133, 127.1001),
    "건대": (37.5403, 127.0695), "왕십리": (37.5613, 127.0374),
    "여의도": (37.5215, 126.9243), "종로": (37.5720, 126.9794),
    "명동": (37.5636, 126.9827), "익선동": (37.5740, 126.9900),
    "샤로수길": (37.4813, 126.9527), "판교": (37.3947, 127.1112),
    "정자": (37.3670, 127.1080), "수유": (37.6379, 127.0255),
    "노원": (37.6543, 127.0568), "신촌": (37.5551, 126.9368),
    "혜화": (37.5822, 127.0018), "대학로": (37.5822, 127.0018),
    "성북": (37.5894, 127.0167), "안암": (37.5863, 127.0294),
}

_SUFFIX = re.compile(r"(역|일대|근처|쪽|앞|동네)$")
_TOKEN = re.compile(r"[가-힣A-Za-z0-9]+")

_ADDR: Optional[dict] = None
_ADDR_AT = 0.0
_ADDR_TTL = 24 * 3600


def _addr_dict(db: Session) -> dict:
    """주소에서 뽑은 행정 토큰 → 대표 좌표. 하루 한 번만 만든다."""
    global _ADDR, _ADDR_AT
    if _ADDR is not None and (time.time() - _ADDR_AT) < _ADDR_TTL:
        return _ADDR
    try:
        # 이 DB의 주소는 도로명 형식이라 법정동이 없다. 실제로 잡히는 건 '~구'뿐이고,
        # 숫자로 시작하는 토큰은 아파트 동 번호(101동)라 걸러야 한다.
        rows = db.execute(text("""
            SELECT tok, avg(lat), avg(lng), count(*) FROM (
                SELECT unnest(string_to_array(address, ' ')) AS tok, lat, lng
                FROM places WHERE address IS NOT NULL AND lat IS NOT NULL
            ) t
            WHERE tok ~ '^[가-힣]{2,7}(동|구|읍|면|리)$'
            GROUP BY tok HAVING count(*) >= 30
        """)).all()
        d = {}
        for tok, la, ln, _ in rows:
            d[tok] = (float(la), float(ln))
            # '강남구'를 아는데 '강남'을 모르면 안 된다 — 사람들은 접미사를 잘 안 쓴다
            if len(tok) > 2 and tok[-1] in "구동":
                d.setdefault(tok[:-1], (float(la), float(ln)))
        _ADDR = d
        _ADDR_AT = time.time()
    except Exception as exc:
        print(f"[query] 주소 사전 실패: {exc}")
        _ADDR = _ADDR or {}
    return _ADDR


def interpret(db: Session, q: Optional[str], food_keywords: dict, tag_hints: dict) -> dict:
    """검색어 → {region, foods, tags, residual_q, source}.

    residual_q는 해석되지 않고 남은 말이다. 그건 리스트 이름과 **가게 이름** 양쪽에
    쓴다 — 지금은 '치킨'처럼 음식 8버킷에 없는 단어가 조용히 버려진다.
    """
    out = {"region": None, "foods": [], "tags": [], "residual_q": "", "source": None}
    if not q or not q.strip():
        return out

    toks = _TOKEN.findall(q.strip())
    if not toks:
        return out

    addr = _addr_dict(db)
    used = set()

    for i, t in enumerate(toks):
        base = _SUFFIX.sub("", t) or t
        for cand, src in ((base, None), (t, None)):
            if cand in LANDMARKS:
                lat, lng = LANDMARKS[cand]
                out["region"] = {"name": cand, "lat": lat, "lng": lng,
                                 "radius_km": 1.5, "source": "landmark"}
                used.add(i)
                break
            if cand in addr:
                lat, lng = addr[cand]
                out["region"] = {"name": cand, "lat": lat, "lng": lng,
                                 "radius_km": 2.0, "source": "address"}
                used.add(i)
                break
        if i in used:
            break   # 지역은 하나만

    for i, t in enumerate(toks):
        if i in used:
            continue
        if t in food_keywords:
            out["foods"].append(t)
            used.add(i)
            continue
        for f, kws in food_keywords.items():
            if any(k in t for k in kws):
                if f not in out["foods"]:
                    out["foods"].append(f)
                used.add(i)
                break
        if i in used:
            continue
        for tag, hints in tag_hints.items():
            if any(h in t for h in hints):
                if tag not in out["tags"]:
                    out["tags"].append(tag)
                used.add(i)
                break

    out["residual_q"] = " ".join(t for i, t in enumerate(toks) if i not in used).strip()
    out["source"] = out["region"]["source"] if out["region"] else None
    return out
