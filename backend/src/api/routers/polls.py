# -*- coding: utf-8 -*-
"""채팅방 투표 카드 API — 장소/일정 조율.
- 생성: 만든 사람이 옵션 시드(AI 추천 상위 N)와 함께 생성 → 채팅에 poll 메시지 발행
- 후보: 멤버 누구나 실시간 추가, 내가 추가한 건 삭제 가능(만든 사람은 전부 삭제 가능)
- 투표: 1인 1표(변경 가능)
- 확정: 만든 사람만. 확정 시 카드 잠금 + 시스템 메시지
모든 변경은 기존 채팅 WS로 poll_update 브로드캐스트 → 전원 실시간 반영.
"""
import json
import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user
from services import taste_service
from api.routers.chat import manager, _sync_room_members_from_community, kst_hhmm

router = APIRouter()


def _require_member(db: Session, room_id: str, user_id: int):
    _sync_room_members_from_community(db, room_id)
    ok = (
        db.query(models.ChatRoomMember)
        .filter(models.ChatRoomMember.room_id == room_id, models.ChatRoomMember.user_id == user_id)
        .first()
    )
    if not ok:
        raise HTTPException(status_code=403, detail="채팅방 멤버만 가능합니다.")


def _serialize_poll(db: Session, poll: models.ChatPoll, me_id: Optional[int] = None) -> dict:
    options = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.poll_id == poll.id)
        .order_by(models.ChatPollOption.created_at)
        .all()
    )
    votes = db.query(models.ChatPollVote).filter(models.ChatPollVote.poll_id == poll.id).all()
    vote_count: dict = {}
    my_vote = None
    for v in votes:
        vote_count[v.option_id] = vote_count.get(v.option_id, 0) + 1
        if me_id is not None and v.user_id == me_id:
            my_vote = v.option_id

    uids = {o.added_by for o in options if o.added_by} | {poll.creator_id}
    users = {u.id: u.name for u in db.query(models.User).filter(models.User.id.in_(list(uids))).all()}

    opts = [
        {
            "id": o.id,
            "label": o.label,
            "place_id": o.place_id,
            "meta": o.meta or {},
            "added_by": o.added_by,
            "added_by_name": None if o.added_by is None else users.get(o.added_by, ""),
            "votes": vote_count.get(o.id, 0),
            "voted_by_me": my_vote == o.id,
        }
        for o in options
    ]
    # 표 많은 순 → 먼저 담긴 순
    opts.sort(key=lambda x: (-x["votes"], x["id"]))
    return {
        "id": poll.id,
        "room_id": poll.room_id,
        "kind": poll.kind,
        "title": poll.title or ("어디서 만날까요?" if poll.kind == "place" else "언제 만날까요?"),
        "meta": poll.meta or {},
        "status": poll.status,
        "confirmed_option_id": poll.confirmed_option_id,
        "creator_id": poll.creator_id,
        "creator_name": users.get(poll.creator_id, ""),
        "is_creator": me_id == poll.creator_id,
        "total_votes": len(votes),
        "options": opts,
    }


async def _broadcast_poll(db: Session, poll: models.ChatPoll):
    await manager.broadcast({"type": "poll_update", "poll": _serialize_poll(db, poll)}, poll.room_id)


# 목적 → main_category. meeting_service의 매핑과 같은 기준을 쓴다(같은 말이 두 곳에서
# 다른 곳을 가리키면 안 된다). 없는 목적(데이트 등)은 안 좁힌다.
_PURPOSE_MAIN_CATEGORIES = {
    "식사": ("RESTAURANT", "FOOD"),
    "카페": ("CAFE",),
    "술": ("PUB",),
    "술집": ("PUB",),
    "주점": ("PUB",),
    "술/회식": ("PUB",),
    "회식": ("PUB",),
}
_ALL_MAIN_CATEGORIES = ("FOOD", "RESTAURANT", "CAFE", "PUB")

# 같은 방·같은 지점·같은 목적이면 잠깐 재사용한다.
# 이 엔드포인트는 요청 안에서 멤버 수만큼 취향 시트를 다시 만들 수 있다(체크인 한 번이면
# dirty가 찍힌다). 그래서 첫 호출이 초 단위로 튀는데, 화면은 같은 조건을 연달아 부른다
# (후보 추가 시트, 목적 바꾸기, 동네 다시 고르기). TTL은 짧게 — 후보가 달라지는 건
# 취향이 바뀔 때뿐이고 그게 2분 안에 급한 경우는 없다.
_SUGGEST_TTL = 120.0
_SUGGEST_MAX = 200
_suggest_cache: dict = {}


def _cache_get(key):
    hit = _suggest_cache.get(key)
    if not hit:
        return None
    at, val = hit
    if time.monotonic() - at > _SUGGEST_TTL:
        _suggest_cache.pop(key, None)
        return None
    return val


def _cache_put(key, val):
    if len(_suggest_cache) >= _SUGGEST_MAX:
        # 가장 오래된 것부터 버린다(요청량이 적어 정렬 비용은 무시할 수준)
        for k, _ in sorted(_suggest_cache.items(), key=lambda kv: kv[1][0])[:_SUGGEST_MAX // 4]:
            _suggest_cache.pop(k, None)
    _suggest_cache[key] = (time.monotonic(), val)


@router.get("/api/chat/rooms/{room_id}/polls/suggest")
def suggest_poll_places(
    room_id: str,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: float = 2.0,
    limit: int = 5,
    purpose: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """투표를 열 때 후보를 미리 채운다 — 크루가 아무것도 안 해도 추천이 작동한다.

    후보는 '멤버 취향의 평균'이 아니라 집단 합성으로 고른다. 평균을 내면 아무도
    좋아하지 않는 중간이 나온다 — 실측으로 취향이 갈리는 크루에서 평균은 상위
    20곳 중 7곳에서 누군가를 희생시켰다.
    """
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    _require_member(db, room_id, current_user.id)

    # 캐시 키에 유저를 넣는 이유: reason_me('내가 양보해야 해요')가 보는 사람마다 다르다.
    ckey = (room_id, current_user.id, round(lat or 0, 3), round(lng or 0, 3),
            (purpose or "").strip(), round(radius_km, 2), limit)
    cached = _cache_get(ckey)
    if cached is not None:
        return cached

    members = taste_service.crew_members(db, room_id)
    if not members:
        return {"items": [], "members": 0,
                "note": "아직 멤버 취향을 모으지 못했어요. 저장 목록을 가져오면 추천이 시작돼요."}

    if lat is None or lng is None:
        lat, lng = (current_user.lat or 37.5665), (current_user.lng or 126.9780)
    import math as _m
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(0.2, _m.cos(_m.radians(lat))))

    # 후보는 거리로 좁힌다 — 평점이 12만 행 전부 0이라 다른 기준이 없다.
    # 폐업은 뺀다(NULL은 '대조 못 함'이라 유지).
    box = {"la1": lat - dlat, "la2": lat + dlat, "ln1": lng - dlng, "ln2": lng + dlng,
           "la0": lat, "ln0": lng}

    def _nearby(cats: tuple):
        keys = {f"mc{i}": c for i, c in enumerate(cats)}
        in_sql = ", ".join(f":{k}" for k in keys)
        return db.execute(text(f"""
            SELECT p.id, p.name, COALESCE(p.uptae, p.cuisine_type, ''), COALESCE(p.address,''),
                   p.hero_image, p.opened_at, p.lat, p.lng
            FROM places p
            WHERE p.main_category IN ({in_sql})
              AND (p.biz_status IS NULL OR p.biz_status <> '폐업')
              AND p.lat BETWEEN :la1 AND :la2 AND p.lng BETWEEN :ln1 AND :ln2
            ORDER BY ((p.lat - :la0)*(p.lat - :la0) + (p.lng - :ln0)*0.79*(p.lng - :ln0)*0.79) ASC,
                     p.id ASC
            LIMIT 250
        """), {**box, **keys}).all()

    cats = _PURPOSE_MAIN_CATEGORIES.get((purpose or "").strip(), _ALL_MAIN_CATEGORIES)
    rows = _nearby(cats)
    # 목적으로 좁혔더니 근처에 하나도 없으면 좁히기를 푼다 — 빈 투표보다 낫고,
    # 대신 어떤 기준으로 골랐는지 note에 밝힌다.
    relaxed = False
    if not rows and cats != _ALL_MAIN_CATEGORIES:
        rows = _nearby(_ALL_MAIN_CATEGORIES)
        relaxed = bool(rows)
    if not rows:
        return {"items": [], "members": len(members), "note": "근처에 후보가 없어요."}

    # 제외·중복은 홈 추천(home.py)이 이미 거르는 것들인데 여기만 빠져 있었다.
    # ① 누가 '다신 안 가'라고 한 곳(재방문 아니요·별점 2 이하·블랙리스트)은 후보가 아니다.
    #    임베딩 점수는 그 거부를 모른다 — 오히려 비슷한 집을 좋아하는 사람일수록 통과시켜서,
    #    본인이 퇴짜 놓은 집에 "모두 무난해요"가 붙을 수 있다.
    # ② 이름+좌표가 같은 중복 행이 447그룹 있다(실측). 투표에선 표가 갈려 1등이 뒤집힌다.
    excluded = set()
    for m in members:
        excluded |= set(m.sheet.excluded or ())

    meta, seen, dropped = {}, set(), 0
    for r in rows:
        if r[0] in excluded:
            dropped += 1
            continue
        key = (r[1], round(float(r[6] or 0), 5), round(float(r[7] or 0), 5))
        if key in seen:
            continue
        seen.add(key)
        meta[r[0]] = r
    if not meta:
        return {"items": [], "members": len(members),
                "note": "근처 후보가 전부 '안 맞았던 곳'이라 뺐어요."}
    ids = list(meta.keys())

    # 게이트를 단계적으로 푼다. 5%는 개인 배지용 문턱이라 5명 전원에게 동시에
    # 요구하면 통과가 거의 안 나온다 — 아무도 못 넘으면 상위 10%·20%로 넓혀 보고,
    # 어느 기준으로 봤는지는 note에 밝힌다. 점수(=순위)는 어차피 상대적이라
    # 기준을 풀어도 순서가 크게 바뀌지 않고, 바뀌는 건 '맞다'고 부를지 여부다.
    top_n = max(1, min(limit, 30))
    scores = taste_service.crew_scores(db, members, ids)
    ranked, gate_fpr, matched = [], taste_service.GATE_LEVELS[0], 0
    def _order(kv):
        return (-kv[1]["total_margin"], -kv[1]["score"])

    for lv in taste_service.GATE_LEVELS:
        picks = taste_service.crew_picks(db, members, ids, fpr=lv, per=scores)
        gate_fpr = lv
        # 합집합 = 한 명이라도 자기 기준을 넘은 곳. 여유 총합이 높은 순으로 위에 둔다.
        # 기준 밖은 '빼는' 게 아니라 '아래로 내린다' — 추천만 남기면 그게 마음에
        # 안 들 때 크루가 다른 걸 볼 방법이 없다. 대신 추천 여부를 플래그로 넘겨
        # 화면이 구분하고, 자동 선택은 추천에서만 집는다.
        hit = sorted([kv for kv in picks.items() if kv[1]["satisfied"] > 0], key=_order)
        rest = sorted([kv for kv in picks.items() if kv[1]["satisfied"] == 0], key=_order)
        matched = len(hit)
        # 순서는 유지하되 자르는 건 마지막에 — 먼저 자르면 통과한 곳이 그 안에 몇 개
        # 없다는 이유로 추천이 서너 곳으로 말라버린다(실제로 그랬다).
        ranked = (hit + rest)[:top_n]
        if matched:
            break
    strict = abs(gate_fpr - taste_service.GATE_FPR) < 1e-9

    items = []
    for pid, p in ranked:
        r = meta[pid]
        # reason은 저장·공유용(이름), reason_me는 지금 보는 사람용('내가').
        # 옵션 meta에 박히는 건 반드시 reason이어야 한다 — 방 전원이 같은 문자열을 본다.
        reason, kind = taste_service.crew_reason(p, members, strict=strict)
        reason_me, _k = taste_service.crew_reason(p, members, strict=strict,
                                                  me_id=current_user.id)
        items.append({
            "place_id": pid, "name": r[1], "cuisine": r[2], "address": r[3], "image": r[4],
            "satisfied": p["satisfied"], "total": p["total"], "weakest": p["weakest"],
            "weakest_id": p.get("weakest_id"),
            "recommended": p["satisfied"] > 0,
            "reason": reason, "reason_kind": kind,
            "reason_me": (reason_me if reason_me != reason else None),
            "years_open": ((datetime.now().year - r[5].year) if r[5] else None),
        })
    note = f"{len(members)}명 취향을 함께 봤어요"
    if not strict:
        note += f" · 상위 {int(round(gate_fpr * 100))}% 기준까지 넓혀서 봤어요"
    if relaxed:
        note += f" · 근처에 '{purpose}' 후보가 없어 전체에서 골랐어요"
    if dropped:
        note += f" · 안 맞았던 곳 {dropped}곳은 뺐어요"
    if matched:
        note += f" · 추천 {min(matched, len(items))}곳"
        if matched > len(items):
            note += f"(전체 {matched}곳)"
    out = {
        "items": items,
        "members": len(members),
        "member_names": [m.name for m in members],
        "purpose": (purpose or None),
        "purpose_relaxed": relaxed,
        "gate_fpr": gate_fpr,
        "gate_strict": strict,
        "note": note,
    }
    _cache_put(ckey, out)
    return out


@router.post("/api/chat/rooms/{room_id}/polls")
async def create_poll(
    room_id: str,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    _require_member(db, room_id, current_user.id)

    kind = str(req.get("kind") or "place")
    if kind not in ("place", "schedule"):
        raise HTTPException(status_code=400, detail="kind는 place|schedule")

    poll = models.ChatPoll(
        room_id=room_id,
        creator_id=current_user.id,
        kind=kind,
        title=req.get("title"),
        meta=req.get("meta") or {},
    )
    db.add(poll)
    db.flush()

    # 시드 옵션(프론트가 AI 추천 상위 N 전달; added_by_ai=True면 AI 뱃지)
    for o in (req.get("options") or [])[:10]:
        if not o.get("label"):
            continue
        db.add(models.ChatPollOption(
            poll_id=poll.id,
            added_by=None if o.get("added_by_ai") else current_user.id,
            place_id=o.get("place_id"),
            label=str(o["label"])[:80],
            meta=o.get("meta") or {},
        ))

    # 채팅 스트림에 poll 메시지 발행
    content = json.dumps({"type": "poll", "poll_id": poll.id, "kind": kind}, ensure_ascii=False)
    msg = models.Message(room_id=room_id, user_id=current_user.id, content=content)
    db.add(msg)
    db.commit()

    await manager.broadcast(
        {
            "id": msg.id,
            "user_id": current_user.id,
            "name": current_user.name,
            "content": content,
            "timestamp": kst_hhmm(),
        },
        room_id,
    )

    # 🔔 푸시: 멤버들에게 투표 시작 알림
    try:
        from services import push_service
        if push_service.push_enabled():
            member_ids = [m.user_id for m in db.query(models.ChatRoomMember).filter(
                models.ChatRoomMember.room_id == room_id).all()]
            room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
            what = "장소" if kind == "place" else "일정"
            push_service.notify_users_async(
                member_ids,
                (room.title if room else "랑데부").replace("[모임] ", ""),
                f"🗳️ {current_user.name}님이 {what} 투표를 올렸어요 — 후보를 담고 투표해보세요!",
                {"room_id": str(room_id), "poll_id": str(poll.id)},
                exclude_user_id=current_user.id,
            )
    except Exception as _e:
        print(f"[Push] poll hook skip: {_e}")

    return _serialize_poll(db, poll, current_user.id)


@router.get("/api/chat/polls/active")
def my_active_polls(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """내가 속한 방들의 진행 중(open) 장소 투표 — 탐색/추천 탭 '투표에 담기' 입구용."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    room_ids = [
        r[0]
        for r in db.query(models.ChatRoomMember.room_id)
        .filter(models.ChatRoomMember.user_id == current_user.id)
        .all()
    ]
    if not room_ids:
        return {"items": []}
    polls = (
        db.query(models.ChatPoll)
        .filter(
            models.ChatPoll.room_id.in_(room_ids),
            models.ChatPoll.status == "open",
            models.ChatPoll.kind == "place",
        )
        .order_by(models.ChatPoll.created_at.desc())
        .limit(10)
        .all()
    )
    rooms = {r.id: r for r in db.query(models.ChatRoom).filter(models.ChatRoom.id.in_([p.room_id for p in polls])).all()}
    out = []
    for p in polls:
        cnt = db.query(models.ChatPollOption).filter(models.ChatPollOption.poll_id == p.id).count()
        room = rooms.get(p.room_id)
        out.append({
            "poll_id": p.id,
            "room_id": p.room_id,
            "room_title": (room.title if room else "").replace("[모임] ", ""),
            "option_count": cnt,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return {"items": out}


@router.get("/api/chat/rooms/{room_id}/polls")
def room_polls(
    room_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """방의 투표 목록 — status=confirmed면 확정 히스토리(방문 히스토리 카드용)."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    _require_member(db, room_id, current_user.id)
    q = db.query(models.ChatPoll).filter(models.ChatPoll.room_id == room_id)
    if status:
        q = q.filter(models.ChatPoll.status == status)
    polls = q.order_by(models.ChatPoll.created_at.desc()).limit(30).all()
    out = []
    for p in polls:
        item = {
            "poll_id": p.id,
            "kind": p.kind,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "confirmed": None,
        }
        if p.confirmed_option_id:
            opt = db.query(models.ChatPollOption).filter(models.ChatPollOption.id == p.confirmed_option_id).first()
            if opt:
                item["confirmed"] = {"label": opt.label, "place_id": opt.place_id, "meta": opt.meta or {}}
        out.append(item)
    return {"items": out}


@router.get("/api/chat/polls/{poll_id}")
def get_poll(
    poll_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없어요.")
    return _serialize_poll(db, poll, current_user.id if current_user else None)


@router.post("/api/chat/polls/{poll_id}/options")
async def add_option(
    poll_id: int,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없어요.")
    if poll.status != "open":
        raise HTTPException(status_code=400, detail="이미 확정된 투표예요.")
    _require_member(db, poll.room_id, current_user.id)

    label = str(req.get("label") or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="후보 이름이 필요해요.")
    # 같은 장소 중복 방지
    place_id = req.get("place_id")
    dup = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.poll_id == poll_id)
        .filter(
            (models.ChatPollOption.place_id == place_id)
            if place_id
            else (models.ChatPollOption.label == label)
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="이미 후보에 있어요.")
    opt = models.ChatPollOption(
        poll_id=poll_id,
        added_by=current_user.id,
        place_id=place_id,
        label=label[:80],
        meta=req.get("meta") or {},
    )
    db.add(opt)
    db.commit()
    await _broadcast_poll(db, poll)
    return _serialize_poll(db, poll, current_user.id)


@router.delete("/api/chat/polls/{poll_id}/options/{option_id}")
async def remove_option(
    poll_id: int,
    option_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll or poll.status != "open":
        raise HTTPException(status_code=400, detail="삭제할 수 없는 투표예요.")
    opt = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.id == option_id, models.ChatPollOption.poll_id == poll_id)
        .first()
    )
    if not opt:
        raise HTTPException(status_code=404, detail="후보를 찾을 수 없어요.")
    # 내가 추가한 후보 or 투표 만든 사람만
    if opt.added_by != current_user.id and poll.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="내가 추가한 후보만 뺄 수 있어요.")
    db.query(models.ChatPollVote).filter(
        models.ChatPollVote.poll_id == poll_id, models.ChatPollVote.option_id == option_id
    ).delete()
    db.delete(opt)
    db.commit()
    await _broadcast_poll(db, poll)
    return _serialize_poll(db, poll, current_user.id)


@router.delete("/api/chat/polls/{poll_id}")
async def delete_poll(
    poll_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """투표 삭제 — 만든 사람만, 진행 중(open)일 때만(확정된 건 기록 유지).
    카드 메시지도 함께 지우고 message_deleted 브로드캐스트로 전원 화면에서 제거."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없어요.")
    if poll.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="투표를 만든 사람만 삭제할 수 있어요.")
    if poll.status != "open":
        raise HTTPException(status_code=400, detail="확정된 투표는 삭제할 수 없어요.")

    room_id = poll.room_id
    # 카드 메시지 제거
    deleted_msg_ids = []
    for m in db.query(models.Message).filter(models.Message.room_id == room_id).all():
        content = m.content or ""
        if '"type": "poll"' in content and f'"poll_id": {poll_id}' in content:
            deleted_msg_ids.append(m.id)
            db.delete(m)
    db.query(models.ChatPollVote).filter(models.ChatPollVote.poll_id == poll_id).delete()
    db.query(models.ChatPollOption).filter(models.ChatPollOption.poll_id == poll_id).delete()
    db.delete(poll)
    db.commit()

    for mid in deleted_msg_ids:
        await manager.broadcast({"type": "message_deleted", "message_id": mid}, room_id)
    return {"ok": True, "deleted": True}


@router.post("/api/chat/polls/{poll_id}/vote")
async def vote(
    poll_id: int,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll or poll.status != "open":
        raise HTTPException(status_code=400, detail="투표할 수 없는 상태예요.")
    _require_member(db, poll.room_id, current_user.id)

    option_id = req.get("option_id")
    opt = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.id == option_id, models.ChatPollOption.poll_id == poll_id)
        .first()
    )
    if not opt:
        raise HTTPException(status_code=404, detail="후보를 찾을 수 없어요.")

    existing = (
        db.query(models.ChatPollVote)
        .filter(models.ChatPollVote.poll_id == poll_id, models.ChatPollVote.user_id == current_user.id)
        .first()
    )
    if existing and existing.option_id == option_id:
        db.delete(existing)  # 같은 옵션 다시 누르면 투표 취소
    elif existing:
        existing.option_id = option_id  # 표 옮기기
    else:
        db.add(models.ChatPollVote(poll_id=poll_id, option_id=option_id, user_id=current_user.id))
    db.commit()
    await _broadcast_poll(db, poll)
    return _serialize_poll(db, poll, current_user.id)


@router.post("/api/chat/polls/{poll_id}/confirm")
async def confirm_poll(
    poll_id: int,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없어요.")
    if poll.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="투표를 만든 사람만 확정할 수 있어요.")
    if poll.status != "open":
        raise HTTPException(status_code=400, detail="이미 확정된 투표예요.")

    option_id = req.get("option_id")
    if option_id is None:
        # 기본: 최다 득표(동률이면 먼저 담긴 후보)
        s = _serialize_poll(db, poll)
        if not s["options"]:
            raise HTTPException(status_code=400, detail="후보가 없어요.")
        option_id = s["options"][0]["id"]
    opt = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.id == option_id, models.ChatPollOption.poll_id == poll_id)
        .first()
    )
    if not opt:
        raise HTTPException(status_code=404, detail="후보를 찾을 수 없어요.")

    poll.status = "confirmed"
    poll.confirmed_option_id = opt.id

    # 확정 → 예약으로 이어지도록 방의 '계획'을 맞춰 둔다.
    # 장소 투표와 일정 투표가 서로를 몰라서, 둘 다 확정하고도 예약 화면에서 날짜를
    # 처음부터 다시 골라야 했다. 어느 쪽을 나중에 확정하든 장소 투표 meta에
    # plan_date/plan_time이 남게 한다(카드의 예약 버튼이 그걸 그대로 넘긴다).
    # JSON 컬럼이라 제자리 수정 대신 새 dict를 대입한다(안 그러면 갱신이 안 잡힌다).
    other = None
    try:
        other = (
            db.query(models.ChatPoll)
            .filter(models.ChatPoll.room_id == poll.room_id,
                    models.ChatPoll.kind == ("schedule" if poll.kind == "place" else "place"),
                    models.ChatPoll.status == "confirmed")
            .order_by(models.ChatPoll.id.desc())
            .first()
        )
        if other is not None:
            if poll.kind == "place":
                o = (db.query(models.ChatPollOption)
                     .filter(models.ChatPollOption.id == other.confirmed_option_id).first())
                m = (o.meta or {}) if o else {}
                poll.meta = {**(poll.meta or {}),
                             "plan_date": m.get("date"), "plan_time": m.get("time")}
            else:
                m = opt.meta or {}
                other.meta = {**(other.meta or {}),
                              "plan_date": m.get("date"), "plan_time": m.get("time")}
    except Exception as _e:
        print(f"[poll] plan link skip: {_e}")
        other = None

    # 확정 시스템 메시지
    verb = "장소" if poll.kind == "place" else "일정"
    content = json.dumps(
        {"type": "poll_confirmed", "poll_id": poll.id, "kind": poll.kind,
         "label": opt.label, "place_id": opt.place_id, "meta": opt.meta or {}},
        ensure_ascii=False,
    )
    msg = models.Message(room_id=poll.room_id, user_id=current_user.id, content=content)
    db.add(msg)
    db.commit()

    await _broadcast_poll(db, poll)
    if other is not None and poll.kind == "schedule":
        await _broadcast_poll(db, other)   # 장소 카드에 날짜가 붙었으니 같이 갱신
    await manager.broadcast(
        {
            "id": msg.id,
            "user_id": current_user.id,
            "name": current_user.name,
            "content": content,
            "timestamp": kst_hhmm(),
        },
        poll.room_id,
    )

    # 🔔 푸시: 확정 알림
    try:
        from services import push_service
        if push_service.push_enabled():
            member_ids = [m.user_id for m in db.query(models.ChatRoomMember).filter(
                models.ChatRoomMember.room_id == poll.room_id).all()]
            room = db.query(models.ChatRoom).filter(models.ChatRoom.id == poll.room_id).first()
            emoji = "📍" if poll.kind == "place" else "📅"
            push_service.notify_users_async(
                member_ids,
                (room.title if room else "랑데부").replace("[모임] ", ""),
                f"{emoji} '{opt.label}'(으)로 확정됐어요!",
                {"room_id": str(poll.room_id), "poll_id": str(poll.id)},
                exclude_user_id=current_user.id,
            )
    except Exception as _e:
        print(f"[Push] confirm hook skip: {_e}")

    return _serialize_poll(db, poll, current_user.id)
