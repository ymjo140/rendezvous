# -*- coding: utf-8 -*-
"""취향 시트 — 유저의 취향을 '한 점'이 아니라 '여러 덩어리'로 본다.

## 왜 다시 짰나

예전 `_user_taste_centroid`는 저장한 곳 전부의 임베딩을 하나로 평균냈다. 그러면
혼밥 국밥집과 데이트 파스타집이 섞여 둘 다 아닌 중간 지점이 나온다. 저장이 늘수록
평균은 전체 평균에 가까워지므로, **쓸수록 무뎌진다.**

라이브 실측(uid5, 저장 236곳):
    단일 centroid   저장곳 32.9% vs 무작위 p95 31.6%  → 분리 +1.3%p (사실상 구분 못 함)
    한식 덩어리 89곳                37.7% vs 29.3%   → +8.4%p
    일식 덩어리 32곳                55.1% vs 33.1%   → +22.0%p
    양식 덩어리 31곳                49.1% vs 29.3%   → +19.8%p

## 두 가지 결정

**덩어리는 군집화가 아니라 `cuisine_type` 라벨로 나눈다.** k-means를 실측해보니
실루엣이 무작위 대조군보다 낮았다 — 데이터에 없는 구조를 만들어낸다. 라벨은 이미
있는 사실이고, 덤으로 "저장하신 한식 89곳과 같은 결"이라는 근거가 **구성상 참**이 된다.

**점수는 중심화 코사인으로 낸다.** 장소 임베딩 12만 개의 단위벡터 평균 norm이
0.946이다. 즉 벡터 대부분이 같은 방향을 본다. 그 공통 성분을 빼지 않으면 무작위
장소도 94% 매칭으로 나온다(실측 중앙값 94.2% → 중심화 후 -1.2%).
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from domain import models

# ── 상수 ──────────────────────────────────────────────────────

# 덩어리 라벨로 쓸 수 없는 값 — "일반음식점 89곳과 같은 결"은 아무 말도 아니다
BAD_LABELS = {"일반음식점", "기타", "음식점", "", None}

MIN_FACET_N = 4        # 이보다 적으면 덩어리로 인정하지 않는다(우연한 묶음 배제)
MAX_FACETS = 3         # 저장 컬럼 수. 상위 3개 넘어가면 꼬리라 변별에 기여가 적다
# 무작위 장소가 배지를 받을 확률의 상한. 덩어리가 여러 개면 각각이 기회를 주므로
# 덩어리 수로 나눠 보정한다 — 안 하면 저장을 많이 한 유저일수록 배지가 흔해져
# "쓸수록 정확해진다"와 부호가 반대가 된다(실측: 1개 5.0% → 3개 14.9%).
GATE_FPR = 0.05
# 집단 합성에서 단계적으로 푸는 기준. 5%는 '배지'용 문턱이라 개인에게는 맞지만
# 5명 전원에게 동시에 요구하면 통과가 사실상 안 나온다(독립이면 0.05^5). 그래서
# 아무도 못 넘으면 상위 10%·20%로 넓혀 보고, 어느 기준으로 봤는지 밝힌다.
GATE_LEVELS = (GATE_FPR, 0.10, 0.20)
SAMPLE_N = 2000        # 게이트 보정용 무작위 표본. 2000×768 float32 ≈ 6MB

# 신호별 (가중치, 반감기 일수). 행동이 말보다 강하고, 최근이 과거보다 강하다.
W_REVISIT_VISITED = (1.30, 180)   # 체크인까지 있는 재방문 의사 — 가장 강한 증거
W_REVISIT = (1.00, 180)
W_CHECKIN = (0.60, 180)
W_REVIEW_GOOD = (0.70, 150)
W_RESERVATION = (0.40, 120)
W_SAVE = {                        # 저장은 어떻게 담겼는지에 따라 무게가 다르다
    "manual": (0.80, 240),        # 내가 이 가게를 골랐다
    "copy": (0.25, 240),          # 남의 리스트를 통째로 담았다 — 리스트를 좋아한 것
    "import": (0.12, 240),        # 외부 북마크 반입 — 과거 관심의 흔적
}

LEVELS = ((14, "L3"), (6, "L2"), (1, "L1"))   # 신호 수 → 성숙도

# ── 프로세스 캐시 ─────────────────────────────────────────────
_MEAN: Optional[np.ndarray] = None
_MEAN_SQ: float = 0.0
_SAMPLE: Optional[np.ndarray] = None      # (SAMPLE_N, 768) 중심화 단위벡터


def _load_space(db: Session) -> bool:
    """코퍼스 평균 m과 m·m. 없으면 중심화를 쓸 수 없다(마이그레이션 미실행)."""
    global _MEAN, _MEAN_SQ
    if _MEAN is not None:
        return True
    row = db.execute(text("SELECT mean_vec, mean_sq FROM taste_space WHERE id = 1")).first()
    if row is None:
        return False
    _MEAN = _as_vec(row[0])
    _MEAN_SQ = float(row[1])
    return True


def _load_sample(db: Session) -> Optional[np.ndarray]:
    """게이트 보정용 무작위 장소 표본.

    게이트를 고정 상수로 둘 수 없는 이유: 무작위 장소의 점수가 덩어리마다 다르다.
    실측으로 술집 덩어리는 무작위도 55.4%가 나오고 한식은 29.3%다. 같은 50%가
    술집에선 평범하고 한식에선 훌륭하다. 그래서 덩어리마다 따로 잰다.
    """
    global _SAMPLE
    if _SAMPLE is not None:
        return _SAMPLE
    if not _load_space(db):
        return None
    rows = db.execute(text("""
        SELECT embedding FROM place_embeddings
        WHERE embedding IS NOT NULL AND mod(place_id, 61) = 7
        LIMIT :n
    """), {"n": SAMPLE_N}).scalars().all()
    if len(rows) < 200:
        return None
    V = np.array([_as_vec(r) for r in rows], dtype=np.float32)
    _SAMPLE = _center(V)
    return _SAMPLE


def _as_vec(x) -> np.ndarray:
    if isinstance(x, str):
        x = json.loads(x)
    return np.asarray(x, dtype=np.float64)


def _center(V: np.ndarray) -> np.ndarray:
    """단위정규화 → 코퍼스 평균 제거 → 재정규화."""
    V = np.atleast_2d(np.asarray(V, dtype=np.float64))
    n = np.linalg.norm(V, axis=1, keepdims=True)
    n[n == 0] = 1.0
    C = V / n - _MEAN
    cn = np.linalg.norm(C, axis=1, keepdims=True)
    cn[cn == 0] = 1.0
    return C / cn


# ── 자료구조 ──────────────────────────────────────────────────

@dataclass
class Facet:
    """취향 덩어리 하나. label·n이 그대로 근거 문장이 된다."""
    label: str                 # cuisine_type 원값 ('한식'). None이면 라벨 없는 폴백
    vec: np.ndarray            # 중심화 공간 단위벡터
    n: int                     # 실제 멤버 수 — 문장에 쓰는 숫자
    weight: float              # 감쇠 후 가중합
    gate: float                # 무작위 장소 분포의 95분위. 이걸 넘어야 배지가 붙는다


@dataclass
class TasteSheet:
    user_id: int
    facets: list = field(default_factory=list)
    excluded: set = field(default_factory=set)   # 갔는데 아니었던 곳 — 하드 제외
    level: str = "L0"
    signal_count: int = 0
    computed_at: Optional[datetime] = None

    @property
    def has_taste(self) -> bool:
        return bool(self.facets)

    @property
    def learning(self) -> bool:
        """근거가 약할 때 약하다고 말하기 위한 플래그."""
        return self.level in ("L0", "L1")


@dataclass
class Signal:
    place_id: int
    weight: float
    label: Optional[str] = None


# ── 신호 수집 ─────────────────────────────────────────────────

def _decay(created, half_life_days: int) -> float:
    """반감기 감쇠. 취향은 변하는데 3개월 전 저장과 어제 방문이 같은 무게면 안 된다."""
    if created is None:
        return 0.6
    age = (datetime.now() - created).total_seconds() / 86400.0
    if age < 0:
        age = 0.0
    return float(2.0 ** (-age / half_life_days))


def collect_signals(db: Session, uid: int) -> tuple[list, set]:
    """(긍정 신호들, 제외할 place_id들). DB만 만지고 계산은 하지 않는다."""
    acc: dict = {}
    excluded: set = set()

    def add(pid, w):
        if pid:
            acc[pid] = acc.get(pid, 0.0) + w

    # 재방문 의사 — '아니요'는 제외 목록으로. 3건뿐이라 방향은 못 만들어도 빼는 건 정확하다
    for f in db.query(models.PlaceVisitFeedback).filter(
            models.PlaceVisitFeedback.user_id == uid).all():
        if f.place_id is None:
            continue
        if f.personal_revisit is False:
            excluded.add(f.place_id)
            continue
        if f.personal_revisit is True:
            visited = getattr(f, "checkin_id", None) is not None
            w, h = W_REVISIT_VISITED if visited else W_REVISIT
            add(f.place_id, w * _decay(f.created_at, h))

    try:
        for c in db.query(models.PlaceCheckin).filter(models.PlaceCheckin.user_id == uid).all():
            w, h = W_CHECKIN
            add(c.place_id, w * _decay(c.created_at, h))
    except Exception:
        pass

    try:
        for r in db.query(models.Review).filter(models.Review.user_id == uid).all():
            pid = getattr(r, "place_id", None)
            if not pid or r.rating is None:
                continue
            if r.rating <= 2:
                excluded.add(pid)
            elif r.rating >= 4:
                w, h = W_REVIEW_GOOD
                add(pid, w * _decay(r.created_at, h))
    except Exception:
        pass

    for rv in db.query(models.Reservation).filter(
            models.Reservation.user_id == uid,
            models.Reservation.status != "cancelled").all():
        if rv.place_id:
            w, h = W_RESERVATION
            add(rv.place_id, w * _decay(rv.created_at, h))

    for s in db.query(models.SavedItem).filter(
            models.SavedItem.user_id == uid,
            models.SavedItem.place_id.isnot(None)).limit(600).all():
        w, h = W_SAVE.get(getattr(s, "source", None) or "manual", W_SAVE["manual"])
        add(s.place_id, w * _decay(s.created_at, h))

    try:
        for pid in (db.query(models.User.blacklisted_place_ids)
                    .filter(models.User.id == uid).scalar() or []):
            excluded.add(int(pid))
    except Exception:
        pass

    for pid in excluded:
        acc.pop(pid, None)

    return [Signal(pid, w) for pid, w in acc.items()], excluded


# ── 시트 생성 ─────────────────────────────────────────────────

def build_sheet(db: Session, uid: int, signals: list, excluded: set) -> TasteSheet:
    """신호 → 덩어리. 라벨별로 묶고 멤버가 충분한 것만 덩어리로 인정한다."""
    sheet = TasteSheet(user_id=uid, excluded=excluded, signal_count=len(signals),
                       computed_at=datetime.now())
    for th, lv in LEVELS:
        if len(signals) >= th:
            sheet.level = lv
            break

    if not _load_space(db) or not signals:
        return _cold_start(db, uid, sheet)

    rows = db.execute(text("""
        SELECT pe.place_id, p.cuisine_type, pe.embedding
        FROM place_embeddings pe JOIN places p ON p.id = pe.place_id
        WHERE pe.place_id = ANY(:ids) AND pe.embedding IS NOT NULL
    """), {"ids": [s.place_id for s in signals]}).all()
    if not rows:
        return _cold_start(db, uid, sheet)

    wmap = {s.place_id: s.weight for s in signals}
    sample = _load_sample(db)

    groups: dict = {}
    every = []
    for pid, label, emb in rows:
        v = _as_vec(emb)
        w = wmap.get(pid, 0.0)
        every.append((v, w))
        if label not in BAD_LABELS:
            groups.setdefault(label, []).append((v, w))

    def make(label, items, gate_pct) -> Optional[Facet]:
        V = _center(np.array([v for v, _ in items]))
        W = np.array([w for _, w in items], dtype=np.float64)
        if W.sum() <= 0:
            return None
        f = (V * W[:, None]).sum(axis=0) / W.sum()
        nrm = np.linalg.norm(f)
        if nrm == 0:
            return None
        f = f / nrm
        gate = float(np.percentile(sample @ f, gate_pct)) if sample is not None else 0.0
        return Facet(label=label, vec=f, n=len(items), weight=float(W.sum()), gate=gate)

    cands = [(label, items) for label, items in
             sorted(groups.items(), key=lambda kv: -sum(w for _, w in kv[1]))
             if len(items) >= MIN_FACET_N][:MAX_FACETS]
    # 덩어리마다 배지 기회를 주므로, 합쳐서 GATE_FPR을 넘지 않도록 백분위를 조인다
    gate_pct = 100.0 * (1.0 - GATE_FPR / max(1, len(cands)))

    facets = []
    for label, items in cands:
        fc = make(label, items, gate_pct)
        if fc is not None:
            facets.append(fc)

    # 라벨로 덩어리가 안 서면 전체를 하나로 — 지금까지 하던 방식과 같아진다
    if not facets:
        fc = make(None, every, 100.0 * (1.0 - GATE_FPR))
        if fc is not None:
            facets.append(fc)

    sheet.facets = facets
    return sheet


def _menu_place_ids(db: Session, key: str, limit: int = 200) -> list:
    """그 메뉴로 분류되는 가게 id. SQL로 크게 거르고 파이썬으로 확정한다.

    분류는 '먼저 걸리는 규칙이 이긴다'라서 SQL만으로는 정확히 못 고른다. 예를 들어
    '순대국'은 gukbap인데 '순대'가 들어가 bunsik 정규식에도 걸린다. 그래서 SQL은
    후보만 넓게 뽑고, 최종 판정은 프론트와 같은 menu_key()로 한다.
    """
    from core import menu_taxonomy as mt

    pattern = next((rx.pattern for rx, k in mt.POOLS if k == key), None)
    if pattern:
        sql = """
            SELECT p.id, p.name, COALESCE(p.uptae,''), p.main_category
            FROM places p JOIN place_embeddings pe ON pe.place_id = p.id
            WHERE pe.embedding IS NOT NULL
              AND p.main_category IN ('FOOD','RESTAURANT','CAFE','PUB')
              AND (p.name ~ :pat OR COALESCE(p.uptae,'') ~ :pat)
            LIMIT :cand
        """
        params = {"pat": pattern, "cand": limit * 4}
    else:
        # korean은 '아무 데도 안 걸린 나머지'라 정규식이 없다. 한식에서 뽑아 걸러낸다.
        sql = """
            SELECT p.id, p.name, COALESCE(p.uptae,''), p.main_category
            FROM places p JOIN place_embeddings pe ON pe.place_id = p.id
            WHERE pe.embedding IS NOT NULL AND p.cuisine_type = '한식'
            LIMIT :cand
        """
        params = {"cand": limit * 6}

    ids = []
    for pid, name, uptae, mc in db.execute(text(sql), params).all():
        if mt.menu_key(name or "", uptae, mc) == key:
            ids.append(pid)
            if len(ids) >= limit:
                break
    return ids


def cold_start_from_menus(db: Session, uid: int, sheet: TasteSheet, keys: list) -> TasteSheet:
    """온보딩에서 고른 메뉴 → 라벨 붙은 덩어리.

    고른 메뉴의 가게들을 평균내 축을 만든다. '국밥'을 고르면 국밥집 임베딩 평균이
    축이 되고, 그 축에서 무작위 장소 상위 5% 지점이 문턱이 된다. 그래서 이름에
    '국밥'이 없어도 벡터가 가까우면 추천에 올라온다 — 단어 매칭이 아니다.

    라벨을 '국밥·탕'처럼 화면에 보여준 말 그대로 쓴다. 기존 콜드스타트는 라벨이
    없어서 이유 문장이 "취향에 맞아요"밖에 안 나왔다.
    """
    from core import menu_taxonomy as mt

    keys = [k for k in (keys or []) if isinstance(k, str)][:MAX_FACETS]
    if not keys or not _load_space(db):
        return sheet
    sample = _load_sample(db)
    # 덩어리마다 배지 기회를 주므로 합쳐서 GATE_FPR을 넘지 않게 백분위를 조인다
    gate_pct = 100.0 * (1.0 - GATE_FPR / max(1, len(keys)))

    facets = []
    for key in keys:
        ids = _menu_place_ids(db, key)
        if len(ids) < MIN_FACET_N:
            continue
        rows = db.execute(text("""
            SELECT embedding FROM place_embeddings
            WHERE place_id = ANY(:ids) AND embedding IS NOT NULL
        """), {"ids": ids}).all()
        vecs = [_as_vec(r[0]) for r in rows if r[0] is not None]
        if len(vecs) < MIN_FACET_N:
            continue
        V = _center(np.array(vecs))
        f = V.mean(axis=0)
        nrm = np.linalg.norm(f)
        if nrm == 0:
            continue
        f = f / nrm
        gate = float(np.percentile(sample @ f, gate_pct)) if sample is not None else 0.0
        facets.append(Facet(label=mt.menu_title(key), vec=f, n=len(vecs),
                            weight=1.0, gate=gate))

    if facets:
        sheet.facets = facets
    return sheet


def _cold_start(db: Session, uid: int, sheet: TasteSheet) -> TasteSheet:
    """행동 신호가 없을 때 — 온보딩에서 받은 취향을 쓴다.

    고른 메뉴가 있으면 그게 먼저다(라벨이 붙어서 이유 문장이 살아난다).
    없으면 예전 방식대로 선호 단어에서 만든 벡터 하나를 쓴다.
    """
    try:
        picked = (db.query(models.User.preferences)
                    .filter(models.User.id == uid).scalar() or {})
        keys = picked.get("taste_menus") if isinstance(picked, dict) else None
        if keys:
            sheet = cold_start_from_menus(db, uid, sheet, keys)
            if sheet.facets:
                return sheet
    except Exception as e:
        print(f"[WARN] taste_menus cold start skipped: {e}")

    if not _load_space(db):
        return sheet
    row = db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == uid).first()
    if row is None or row.preference_embedding is None:
        return sheet
    v = _center(_as_vec(row.preference_embedding))[0]
    sample = _load_sample(db)
    gate = float(np.percentile(sample @ v, 100.0 * (1.0 - GATE_FPR))) if sample is not None else 0.0
    sheet.facets = [Facet(label=None, vec=v, n=0, weight=1.0, gate=gate)]
    return sheet


# ── 저장 / 로드 ───────────────────────────────────────────────

def _vec_lit(v: np.ndarray) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in v) + "]"


def refresh(db: Session, uid: int) -> TasteSheet:
    signals, excluded = collect_signals(db, uid)
    sheet = build_sheet(db, uid, signals, excluded)

    meta = {
        "v": 1,
        "level": sheet.level,
        "n_signal": sheet.signal_count,
        "excluded": sorted(sheet.excluded)[:200],
        "facets": [
            {"label": f.label, "n": f.n, "w": round(f.weight, 2), "gate": round(f.gate, 6)}
            for f in sheet.facets
        ],
    }
    params = {
        "uid": uid,
        "meta": json.dumps(meta, ensure_ascii=False),
        "sc": sheet.signal_count,
    }
    for i in range(3):
        params[f"f{i+1}"] = _vec_lit(sheet.facets[i].vec) if i < len(sheet.facets) else None

    db.execute(text("""
        INSERT INTO user_embeddings (user_id, facet_1, facet_2, facet_3, taste_meta,
                                     computed_at, signal_count, action_count)
        VALUES (:uid, (:f1)::vector, (:f2)::vector, (:f3)::vector, (:meta)::jsonb,
                now(), :sc, 0)
        ON CONFLICT (user_id) DO UPDATE SET
            facet_1 = EXCLUDED.facet_1, facet_2 = EXCLUDED.facet_2,
            facet_3 = EXCLUDED.facet_3, taste_meta = EXCLUDED.taste_meta,
            computed_at = now(), signal_count = EXCLUDED.signal_count,
            updated_at = now()
    """), params)
    db.commit()
    return sheet


def load(db: Session, uid: Optional[int]) -> Optional[TasteSheet]:
    """저장된 시트. dirty(computed_at IS NULL)면 다시 만든다."""
    if not uid:
        return None
    row = db.execute(text("""
        SELECT facet_1, facet_2, facet_3, taste_meta, computed_at, signal_count
        FROM user_embeddings WHERE user_id = :uid
    """), {"uid": uid}).first()
    if row is None or row[4] is None:
        try:
            return refresh(db, uid)
        except Exception as exc:
            print(f"[taste] refresh 실패 uid={uid}: {exc}")
            db.rollback()
            return None

    meta = row[3] or {}
    if isinstance(meta, str):
        meta = json.loads(meta)
    metas = meta.get("facets") or []
    facets = []
    for i in range(3):
        if row[i] is None or i >= len(metas):
            continue
        m = metas[i]
        facets.append(Facet(label=m.get("label"), vec=_as_vec(row[i]),
                            n=int(m.get("n") or 0), weight=float(m.get("w") or 0),
                            gate=float(m.get("gate") or 0)))
    return TasteSheet(
        user_id=uid, facets=facets, excluded=set(meta.get("excluded") or []),
        level=meta.get("level") or "L0", signal_count=int(row[5] or 0), computed_at=row[4],
    )


def mark_dirty(db: Session, uid: Optional[int]) -> None:
    """신호가 생겼다 — 다음 조회 때 다시 계산한다.

    ★UPSERT여야 한다★ — user_embeddings 행이 아예 없는 유저가 있다(라이브 uid 11~14).
    UPDATE 단문이면 0행 갱신으로 조용히 통과해 그들은 영원히 취향이 안 생긴다.
    """
    if not uid:
        return
    try:
        db.execute(text("""
            INSERT INTO user_embeddings (user_id, computed_at, action_count)
            VALUES (:uid, NULL, 0)
            ON CONFLICT (user_id) DO UPDATE SET computed_at = NULL, updated_at = now()
        """), {"uid": uid})
    except Exception as exc:
        print(f"[taste] mark_dirty 실패 uid={uid}: {exc}")


# ── 채점 ──────────────────────────────────────────────────────

def centered_unit(vec) -> Optional[np.ndarray]:
    """임의의 centroid를 중심화 단위벡터로. 크루 취향처럼 시트 밖 벡터를 맞출 때 쓴다."""
    if vec is None or _MEAN is None:
        return None
    return _center(np.asarray(vec, dtype=np.float64))[0]


def facet_literals(sheet: Optional[TasteSheet]) -> list:
    return [_vec_lit(f.vec) for f in sheet.facets] if sheet else []


def score_rows(sheet: TasteSheet, rows: list) -> dict:
    """SQL이 돌려준 (place_id, d1, d2, d3, dot_mean) → place_id별 (점수, 덩어리 인덱스).

    d_k = facet_k · p̂ 이고, 중심화 코사인은
        (d_k − f_k·m) / sqrt(1 − 2·dot_mean + m·m)
    로 복원된다. 벡터를 통째로 끌어오지 않아도 되는 이유다(2.42MB → 8KB).
    """
    if not sheet.facets or _MEAN is None:
        return {}
    fm = [float(f.vec @ _MEAN) for f in sheet.facets]
    out = {}
    for r in rows:
        pid = r[0]
        dm = float(r[-1])
        denom = math.sqrt(max(1e-12, 1.0 - 2.0 * dm + _MEAN_SQ))
        best, bi = -2.0, 0
        for k in range(len(sheet.facets)):
            d = r[1 + k]
            if d is None:
                continue
            s = (float(d) - fm[k]) / denom
            if s > best:
                best, bi = s, k
        out[pid] = (best, bi)
    return out


def passes_gate(sheet: TasteSheet, score: float, facet_idx: int) -> bool:
    """무작위 장소 분포의 95분위를 넘었는가 — 배지를 붙일지 결정한다."""
    if not sheet.facets or facet_idx >= len(sheet.facets):
        return False
    return score > sheet.facets[facet_idx].gate


def taste_reason(sheet: TasteSheet, facet_idx: int) -> tuple:
    """(문구, 종류). 점수를 낸 벡터가 곧 그 n곳의 중심이라 이 문장은 구성상 참이다."""
    if not sheet.facets or facet_idx >= len(sheet.facets):
        return (None, None)
    f = sheet.facets[facet_idx]
    if f.label and f.n:
        txt = f"저장하신 {f.label} {f.n}곳과 같은 결"
    elif f.n:
        txt = f"저장하신 {f.n}곳과 같은 결"
    else:
        txt = "설정하신 취향과 맞아요"
    if sheet.learning:
        txt += " (아직 학습 중)"
    return (txt, "taste")


# ── 장소 채점 (요청당 쿼리 1회) ────────────────────────────────

def score_places(db: Session, sheet: Optional[TasteSheet], place_ids: list) -> dict:
    """place_id → (점수, 덩어리 인덱스, 게이트 통과 여부).

    벡터를 통째로 끌어오지 않는다. 후보 330개면 예전엔 2.42MB였는데
    pgvector가 내적만 계산해 돌려주면 8KB다.
    """
    if not sheet or not sheet.facets or not place_ids or not _load_space(db):
        return {}
    lits = [_vec_lit(f.vec) for f in sheet.facets]
    while len(lits) < 3:
        lits.append(None)

    rows = db.execute(text("""
        SELECT pe.place_id,
               CASE WHEN :f1 IS NULL THEN NULL
                    ELSE -(pe.embedding <#> (:f1)::vector) * pm.inv_norm END,
               CASE WHEN :f2 IS NULL THEN NULL
                    ELSE -(pe.embedding <#> (:f2)::vector) * pm.inv_norm END,
               CASE WHEN :f3 IS NULL THEN NULL
                    ELSE -(pe.embedding <#> (:f3)::vector) * pm.inv_norm END,
               pm.dot_mean
        FROM place_embeddings pe
        JOIN place_embedding_meta pm ON pm.place_id = pe.place_id
        WHERE pe.place_id = ANY(:ids)
    """), {"f1": lits[0], "f2": lits[1], "f3": lits[2], "ids": list(place_ids)}).all()

    fm = [float(f.vec @ _MEAN) for f in sheet.facets]
    out = {}
    for r in rows:
        denom = math.sqrt(max(1e-12, 1.0 - 2.0 * float(r[4]) + _MEAN_SQ))
        best, bi = -2.0, 0
        for k in range(len(sheet.facets)):
            if r[1 + k] is None:
                continue
            sc = (float(r[1 + k]) - fm[k]) / denom
            if sc > best:
                best, bi = sc, k
        out[r[0]] = (best, bi, best > sheet.facets[bi].gate)
    return out


# ── 폴더(리스트) centroid ─────────────────────────────────────

def folder_centroids(db: Session, folder_ids: list) -> dict:
    """folder_id → 중심화 단위벡터. 담긴 장소가 바뀌면 자동으로 다시 만든다.

    무효화 훅을 두지 않는 이유: item_count가 이미 정답을 알고 있다.
    계산 시점의 개수(centroid_n)와 지금 개수가 다르면 그때 다시 만들면 된다.
    """
    if not folder_ids or not _load_space(db):
        return {}

    rows = db.execute(text("""
        SELECT id, centroid, centroid_n, item_count FROM save_folders
        WHERE id = ANY(:ids)
    """), {"ids": list(folder_ids)}).all()

    out, stale = {}, []
    for fid, cen, cn, ic in rows:
        if cen is not None and cn == ic:
            out[fid] = _center(_as_vec(cen))[0]
        else:
            stale.append(fid)

    for fid in stale:
        row = db.execute(text("""
            SELECT avg(pe.embedding), count(*)
            FROM saved_items si JOIN place_embeddings pe ON pe.place_id = si.place_id
            WHERE si.folder_id = :fid AND pe.embedding IS NOT NULL
        """), {"fid": fid}).first()
        if row is None or row[0] is None or not row[1]:
            continue
        v = _as_vec(row[0])
        db.execute(text("""
            UPDATE save_folders
               SET centroid = (:c)::vector, centroid_n = item_count, centroid_at = now()
             WHERE id = :fid
        """), {"c": _vec_lit(v), "fid": fid})
        out[fid] = _center(v)[0]
    if stale:
        db.commit()
    return out


def score_folders(db: Session, sheet: Optional[TasteSheet], folder_ids: list) -> dict:
    """folder_id → (점수, 덩어리 인덱스, 게이트 통과 여부)."""
    if not sheet or not sheet.facets:
        return {}
    cens = folder_centroids(db, folder_ids)
    out = {}
    for fid, c in cens.items():
        best, bi = -2.0, 0
        for k, f in enumerate(sheet.facets):
            sc = float(c @ f.vec)
            if sc > best:
                best, bi = sc, k
        out[fid] = (best, bi, best > sheet.facets[bi].gate)
    return out


# ── 집단 취향 합성 ──────────────────────────────────────────────
#
# 5명이 함께 만족하는 곳은 5명 취향의 평균이 아니다. 평균을 내면 아무도
# 좋아하지 않는 중간 지점이 나온다 — 한 사람 안에서 이미 실측된 문제이고
# (uid5 단일 centroid 분리 +1.3%p), 여러 사람이면 더 심해진다.
#
# 대신 두 가지를 한다:
#   ① 최소 만족도를 올린다 — 제일 안 맞는 사람이 기준이다. 다만 순수 min은
#      한 명 때문에 전부 0이 되는 병리가 있어 평균과 섞는다.
#   ② 지난번에 양보한 사람을 기억한다 — 매번 같은 사람이 참으면 그건 추천이
#      아니라 다수결이다.
#
# 네이버·카카오는 개인 계정만 알아서 이 문제를 구조적으로 풀 수 없다.

W_MIN = 0.6          # 최소 만족도 비중. 1.0이면 한 명이 전부를 거부한다
W_MEAN = 0.4
# 양보 가중치는 뺐다(2026-07-31). '누가 양보하는지'는 문구로만 말하고 순위는 밀지 않는다.
# 원래 기대한 보정은 크루 체크인이 쌓여야 도는데 그 루프가 아직 안 닫혀 있어서,
# 지금 넣으면 효과는 0이면서 점수만 설명하기 어려워진다. 되살릴 땐 git 이력에 있다.


@dataclass
class MemberTaste:
    user_id: int
    name: str
    sheet: TasteSheet
    weight: float = 1.0     # 지금은 전원 1.0(가중 평균 = 단순 평균)


def crew_members(db: Session, community_id: str) -> list:
    """크루 멤버 + 각자의 취향 시트. 시트가 없는 사람은 빠진다(합성에서 제외)."""
    crew = db.query(models.Community).filter(models.Community.id == str(community_id)).first()
    if crew is None:
        return []
    ids = list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))
    if not ids:
        return []
    names = {u.id: (u.name or f"멤버{u.id}")
             for u in db.query(models.User).filter(models.User.id.in_(ids)).all()}
    out = []
    for uid in ids:
        sh = load(db, uid)
        if sh and sh.has_taste:
            out.append(MemberTaste(user_id=uid, name=names.get(uid, f"멤버{uid}"), sheet=sh))
    return out


def crew_scores(db: Session, members: list, place_ids: list) -> dict:
    """uid → {place_id: (점수, 덩어리, 통과)}. 게이트와 무관하니 한 번만 잰다.

    게이트를 여러 단계로 풀어 볼 때 이걸 재사용한다 — 단계마다 다시 재면
    멤버 수 × 단계 수만큼 쿼리가 나간다.
    """
    return {m.user_id: score_places(db, m.sheet, place_ids) for m in members}


def _member_gates(db: Session, members: list, fpr: Optional[float]) -> dict:
    """uid → 덩어리별 게이트. fpr가 기본값이면 시트에 박힌 값을 그대로 쓴다.

    다른 값이면 표본에서 그 백분위를 다시 잰다. 게이트는 '무작위 장소 분포의
    상위 fpr 지점'이라는 정의라, 정의대로 다시 재는 것 말고 방법이 없다
    (덩어리마다 무작위 분포가 달라서 상수로 환산이 안 된다).
    """
    stored = {m.user_id: [f.gate for f in m.sheet.facets] for m in members}
    if fpr is None or abs(fpr - GATE_FPR) < 1e-9:
        return stored
    sample = _load_sample(db)
    if sample is None:
        return stored
    out = {}
    for m in members:
        if not m.sheet.facets:
            out[m.user_id] = []
            continue
        pct = 100.0 * (1.0 - fpr / max(1, len(m.sheet.facets)))
        out[m.user_id] = [float(np.percentile(sample @ f.vec, pct)) for f in m.sheet.facets]
    return out


def crew_picks(db: Session, members: list, place_ids: list,
               fpr: Optional[float] = None, per: Optional[dict] = None) -> dict:
    """place_id → 집단 만족도.

    반환: {score, satisfied, total, weakest, per_member{uid: (점수, 통과)}}
    개인 점수는 그대로 비교할 수 없다 — 게이트가 사람마다 다르다. 그래서
    '게이트 대비 여유(margin)'로 환산해 비교 가능하게 만든다.
    fpr을 주면 그 기준으로 통과 여부를 다시 판정한다(기본은 시트의 5%).
    """
    if not members or not place_ids:
        return {}
    if per is None:
        per = crew_scores(db, members, place_ids)
    gates = _member_gates(db, members, fpr)

    def _gate(m, fidx):
        g = gates.get(m.user_id) or []
        return g[fidx] if fidx < len(g) else 0.0

    out = {}
    for pid in place_ids:
        margins, wsum, wacc, sat, detail = [], 0.0, 0.0, 0, {}
        for m in members:
            v = per.get(m.user_id, {}).get(pid)
            if v is None:
                continue
            sc, fidx, _ok = v
            gate = _gate(m, fidx)
            margin = sc - gate           # 양수면 그 사람 취향에 맞다
            ok = sc > gate               # 완화된 기준이면 여기서 다시 갈린다
            margins.append(margin)
            wacc += margin * m.weight
            wsum += m.weight
            if ok:
                sat += 1
            detail[m.user_id] = (round(sc, 4), bool(ok))
        if not margins:
            continue
        mean = wacc / wsum if wsum else 0.0
        worst = min(margins)

        # 가장 안 맞는 사람 — 이 사람이 곧 '참는 사람'이고, 다음 추천에서 우대된다
        wi, wv = None, 1e9
        for m in members:
            v = per.get(m.user_id, {}).get(pid)
            if v is None:
                continue
            g = _gate(m, v[1])
            if (v[0] - g) < wv:
                wv, wi = v[0] - g, m
        weakest = wi.name if wi else None

        out[pid] = {
            # score: 최소만족 중심(0.6×최악 + 0.4×평균). 아무도 희생시키지 않는 순서.
            "score": round(W_MIN * worst + W_MEAN * mean, 4),
            # total: 여유의 총합. '합집합에서 총합이 높은 순'을 쓸 때의 기준.
            # 교집합만 보면 후보가 서너 곳으로 말라서 투표가 성립하지 않는다.
            "total_margin": round(sum(margins), 4),
            "satisfied": sat,
            "total": len(margins),
            "weakest": weakest,
            "weakest_id": (wi.user_id if wi else None),
            "per_member": detail,
        }
    return out


def crew_reason(pick: dict, members: list, strict: bool = True,
                me_id: Optional[int] = None) -> tuple:
    """(문구, 종류). 몇 명이 맞는지 세는 건 구성상 참이다.

    strict=False면 기준을 푼 상태다 — 같은 숫자라도 '취향에 맞아요'가 아니라
    '무난해요'라고 말한다. 상위 20%를 상위 5%인 척하면 그게 거짓말이 된다.

    이름은 '못 넘은 사람이 정확히 한 명'일 때만 부른다. 5명 중 1명만 통과면
    실제로 넷이 양보하는 건데 한 명만 부르면 나머지 셋은 괜찮은 것처럼 읽힌다.
    me_id를 주면 그 사람을 '내가'로 부른다 — 단 이 문구는 저장하면 안 된다
    (옵션 meta는 방 전원이 같은 문자열을 본다).
    """
    if not pick:
        return (None, None)
    sat, tot = pick["satisfied"], pick["total"]
    if tot == 0:
        return (None, None)
    fit = "취향에 맞아요" if strict else "무난한 편이에요"
    if tot == 1:
        return ((fit, "group_all") if sat else ("취향과는 거리가 있어요", "group_none"))

    who = "내가" if (me_id is not None and pick.get("weakest_id") == me_id) \
        else f"{pick.get('weakest')}님이"
    yielders = tot - sat
    if yielders == 0:
        return (f"{tot}명 모두 {fit}", "group_all")
    if sat == 0:
        return (f"{tot}명 다 기준 밖이에요 · {who} 가장 멀어요", "group_none")
    head = f"{tot}명 중 {sat}명 {fit}" if sat >= 2 else f"{tot}명 중 1명만 {fit}"
    tail = f"{who} 양보해야 해요" if yielders == 1 else f"{yielders}명이 양보해야 해요"
    return (f"{head} · {tail}", "group_most" if sat >= 2 else "group_weak")
