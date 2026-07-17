# -*- coding: utf-8 -*-
"""모임 예약금 분담 결제 — 요청 카드 → 각자 수락(탭)하면 본인 캐시 차감 → 전원 완료 시 예약 생성.
- 대신 내기: 다른 멤버 몫도 납부 가능(paid_by 기록)
- 잔액 부족: 402 + 부족액 안내(자동 차감 없음 — 수락이 곧 동의)
- 만료(24h)/취소: 낸 사람(paid_by)에게 각자 자동 환불
- 완료 후 예약이 취소되면 reservation_service가 분담 납부자 기준으로 환불(전액 담당자 환불 방지)
"""
import json
import math
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user
from api.routers.chat import manager, _require_member_helper, kst_hhmm

router = APIRouter()

DEPOSIT_PER_PERSON = 5000  # 예약금 = 인원 × 5,000 (기존 예약 규칙과 동일)
EXPIRE_HOURS = 24


def _serialize_split(db: Session, req: models.ChatSplitRequest) -> dict:
    shares = (
        db.query(models.ChatSplitShare)
        .filter(models.ChatSplitShare.request_id == req.id)
        .order_by(models.ChatSplitShare.id)
        .all()
    )
    uids = {s.user_id for s in shares} | {s.paid_by for s in shares if s.paid_by} | {req.creator_id}
    names = {u.id: u.name for u in db.query(models.User).filter(models.User.id.in_(list(uids))).all()}
    paid = sum(1 for s in shares if s.paid_at)
    return {
        "id": req.id,
        "room_id": req.room_id,
        "place_id": req.place_id,
        "place_name": req.place_name,
        "date": req.date,
        "time": req.time,
        "party_size": req.party_size,
        "total_amount": req.total_amount,
        "per_amount": req.per_amount,
        "status": req.status,
        "reservation_id": req.reservation_id,
        "creator_id": req.creator_id,
        "creator_name": names.get(req.creator_id, ""),
        "expires_at": req.expires_at.isoformat() if req.expires_at else None,
        "paid_count": paid,
        "share_count": len(shares),
        "shares": [
            {
                "user_id": s.user_id,
                "name": names.get(s.user_id, ""),
                "amount": s.amount,
                "paid": bool(s.paid_at),
                "paid_by": s.paid_by,
                "paid_by_name": names.get(s.paid_by) if s.paid_by else None,
            }
            for s in shares
        ],
    }


async def _broadcast_split(db: Session, req: models.ChatSplitRequest):
    await manager.broadcast({"type": "split_update", "split": _serialize_split(db, req)}, req.room_id)


def _refund_paid_shares(db: Session, req: models.ChatSplitRequest, reason: str) -> int:
    """낸 몫을 납부자(paid_by)에게 각자 환불. 반환=환불 건수. (커밋은 호출자)"""
    shares = db.query(models.ChatSplitShare).filter(
        models.ChatSplitShare.request_id == req.id,
        models.ChatSplitShare.paid_at.isnot(None),
    ).all()
    n = 0
    for s in shares:
        payer = db.query(models.User).filter(models.User.id == (s.paid_by or s.user_id)).first()
        if payer is None:
            continue
        payer.wallet_balance = (payer.wallet_balance or 0) + int(s.amount or 0)
        db.add(models.CoinHistory(
            user_id=payer.id, amount=int(s.amount or 0), type="refund",
            description=f"{reason} · {req.place_name}",
        ))
        s.paid_at = None
        s.paid_by = None
        n += 1
    return n


def _lazy_expire(db: Session, req: models.ChatSplitRequest) -> bool:
    """만료 시간이 지났으면 자동 취소+환불. True면 만료 처리됨."""
    if req.status == "open" and req.expires_at and datetime.now() > req.expires_at:
        _refund_paid_shares(db, req, "분담 요청 만료 환불")
        req.status = "expired"
        db.commit()
        return True
    return False


def _push_members(db: Session, room_id: str, title_room: str, body: str, exclude: Optional[int] = None, only_ids=None):
    try:
        from services import push_service
        if not push_service.push_enabled():
            return
        member_ids = only_ids if only_ids is not None else [
            m.user_id for m in db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()
        ]
        push_service.notify_users_async(member_ids, title_room, body, {"room_id": str(room_id)}, exclude_user_id=exclude)
    except Exception as e:
        print(f"[Push] split hook skip: {e}")


def _room_title(db: Session, room_id: str) -> str:
    room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
    return (room.title if room else "랑데부").replace("[모임] ", "")


@router.post("/api/chat/rooms/{room_id}/splits")
async def create_split(
    room_id: str,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    _require_member_helper(db, room_id, current_user.id)

    place_name = str(req.get("place_name") or "").strip()
    if not place_name:
        raise HTTPException(status_code=400, detail="장소를 선택해주세요.")
    try:
        party_size = max(1, min(int(req.get("party_size") or 2), 50))
    except (TypeError, ValueError):
        party_size = 2

    # 진행 중 분담 요청은 방당 1건
    dup = db.query(models.ChatSplitRequest).filter(
        models.ChatSplitRequest.room_id == room_id,
        models.ChatSplitRequest.status == "open",
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="이미 진행 중인 분담 요청이 있어요. 완료하거나 취소한 뒤 만들어주세요.")

    member_ids = [m.user_id for m in db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()]
    if not member_ids:
        raise HTTPException(status_code=400, detail="멤버가 없어요.")

    deposit = party_size * DEPOSIT_PER_PERSON
    per = math.ceil(deposit / len(member_ids) / 100) * 100  # 100원 단위 올림
    total = per * len(member_ids)

    split = models.ChatSplitRequest(
        room_id=room_id,
        creator_id=current_user.id,
        place_id=req.get("place_id"),
        place_name=place_name[:60],
        date=str(req.get("date") or "")[:10],
        time=str(req.get("time") or "19:00")[:5],
        party_size=party_size,
        total_amount=total,
        per_amount=per,
        expires_at=datetime.now() + timedelta(hours=EXPIRE_HOURS),
    )
    db.add(split)
    db.flush()
    for uid in member_ids:
        db.add(models.ChatSplitShare(request_id=split.id, user_id=uid, amount=per))

    content = json.dumps({"type": "split", "split_id": split.id}, ensure_ascii=False)
    msg = models.Message(room_id=room_id, user_id=current_user.id, content=content)
    db.add(msg)
    db.commit()

    await manager.broadcast(
        {"id": msg.id, "user_id": current_user.id, "name": current_user.name,
         "content": content, "timestamp": kst_hhmm()},
        room_id,
    )
    _push_members(
        db, room_id, _room_title(db, room_id),
        f"💳 {current_user.name}님의 예약금 분담 요청 — 1인 {per:,}원 ({place_name})",
        exclude=current_user.id,
    )
    return _serialize_split(db, split)


@router.get("/api/chat/splits/{split_id}")
def get_split(
    split_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    split = db.query(models.ChatSplitRequest).filter(models.ChatSplitRequest.id == split_id).first()
    if not split:
        raise HTTPException(status_code=404, detail="분담 요청을 찾을 수 없어요.")
    _lazy_expire(db, split)
    return _serialize_split(db, split)


@router.post("/api/chat/splits/{split_id}/pay")
async def pay_split(
    split_id: int,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    split = db.query(models.ChatSplitRequest).filter(models.ChatSplitRequest.id == split_id).first()
    if not split:
        raise HTTPException(status_code=404, detail="분담 요청을 찾을 수 없어요.")
    if _lazy_expire(db, split):
        await _broadcast_split(db, split)
        raise HTTPException(status_code=400, detail="기한이 지나 만료된 요청이에요. (낸 금액은 환불됨)")
    if split.status != "open":
        raise HTTPException(status_code=400, detail="이미 종료된 요청이에요.")
    _require_member_helper(db, split.room_id, current_user.id)

    # 내 몫(기본) 또는 대신 내기(target_user_id)
    target_id = req.get("target_user_id") or current_user.id
    try:
        target_id = int(target_id)
    except (TypeError, ValueError):
        target_id = current_user.id
    share = db.query(models.ChatSplitShare).filter(
        models.ChatSplitShare.request_id == split.id,
        models.ChatSplitShare.user_id == target_id,
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="해당 멤버의 몫이 없어요.")
    if share.paid_at:
        raise HTTPException(status_code=409, detail="이미 납부된 몫이에요.")

    amount = int(share.amount or 0)
    balance = int(current_user.wallet_balance or 0)
    if balance < amount:
        raise HTTPException(
            status_code=402,
            detail=f"캐시가 부족해요 (부족액 {amount - balance:,}원). 마이페이지에서 충전해주세요.",
        )

    current_user.wallet_balance = balance - amount
    who = "내 몫" if target_id == current_user.id else "대신 납부"
    db.add(models.CoinHistory(
        user_id=current_user.id, amount=-amount, type="use",
        description=f"예약금 분담({who}) · {split.place_name}",
    ))
    share.paid_by = current_user.id
    share.paid_at = datetime.now()
    db.commit()

    # 전원 완료 → 예약 생성 + 확정
    unpaid = db.query(models.ChatSplitShare).filter(
        models.ChatSplitShare.request_id == split.id,
        models.ChatSplitShare.paid_at.is_(None),
    ).count()
    if unpaid == 0:
        resv = models.Reservation(
            user_id=split.creator_id,
            place_id=split.place_id,
            place_name=split.place_name,
            date=split.date,
            time=split.time,
            party_size=split.party_size,
            deposit_amount=split.total_amount,
            status="confirmed",
        )
        db.add(resv)
        db.flush()
        split.status = "completed"
        split.reservation_id = resv.id

        content = json.dumps(
            {"type": "split_completed", "split_id": split.id, "place_name": split.place_name,
             "place_id": split.place_id, "date": split.date, "time": split.time},
            ensure_ascii=False,
        )
        msg = models.Message(room_id=split.room_id, user_id=current_user.id, content=content)
        db.add(msg)
        db.commit()
        await manager.broadcast(
            {"id": msg.id, "user_id": current_user.id, "name": current_user.name,
             "content": content, "timestamp": kst_hhmm()},
            split.room_id,
        )
        _push_members(db, split.room_id, _room_title(db, split.room_id),
                      f"🎉 예약 확정! {split.place_name} · {split.date} {split.time}")

    await _broadcast_split(db, split)
    return _serialize_split(db, split)


@router.post("/api/chat/splits/{split_id}/remind")
async def remind_split(
    split_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    split = db.query(models.ChatSplitRequest).filter(models.ChatSplitRequest.id == split_id).first()
    if not split or split.status != "open":
        raise HTTPException(status_code=400, detail="진행 중인 요청이 아니에요.")
    if split.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="요청을 만든 사람만 리마인드할 수 있어요.")
    unpaid_ids = [
        s.user_id for s in db.query(models.ChatSplitShare).filter(
            models.ChatSplitShare.request_id == split.id,
            models.ChatSplitShare.paid_at.is_(None),
        ).all()
    ]
    if not unpaid_ids:
        return {"ok": True, "reminded": 0}
    _push_members(db, split.room_id, _room_title(db, split.room_id),
                  f"⏰ 예약금 분담이 기다리고 있어요 — 1인 {split.per_amount:,}원 ({split.place_name})",
                  only_ids=unpaid_ids)
    return {"ok": True, "reminded": len(unpaid_ids)}


@router.post("/api/chat/splits/{split_id}/cancel")
async def cancel_split(
    split_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    split = db.query(models.ChatSplitRequest).filter(models.ChatSplitRequest.id == split_id).first()
    if not split:
        raise HTTPException(status_code=404, detail="분담 요청을 찾을 수 없어요.")
    if split.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="요청을 만든 사람만 취소할 수 있어요.")
    if split.status != "open":
        raise HTTPException(status_code=400, detail="이미 종료된 요청이에요.")

    n = _refund_paid_shares(db, split, "분담 요청 취소 환불")
    split.status = "cancelled"

    content = json.dumps({"type": "split_cancelled", "split_id": split.id, "place_name": split.place_name}, ensure_ascii=False)
    msg = models.Message(room_id=split.room_id, user_id=current_user.id, content=content)
    db.add(msg)
    db.commit()
    await manager.broadcast(
        {"id": msg.id, "user_id": current_user.id, "name": current_user.name,
         "content": content, "timestamp": kst_hhmm()},
        split.room_id,
    )
    await _broadcast_split(db, split)
    return {"ok": True, "refunded_shares": n}
