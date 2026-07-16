# -*- coding: utf-8 -*-
"""FCM 푸시 발송 — HTTP v1 API (서비스 계정).
env `FCM_SERVICE_ACCOUNT_JSON`(Firebase 서비스 계정 키 JSON 통짜)이 없으면 전부 no-op.
발송은 데몬 스레드에서(요청 지연 없음), 무효 토큰(UNREGISTERED)은 자동 삭제.
"""
import json
import os
import threading
from datetime import datetime
from typing import List, Optional

import requests

_SA_RAW = os.getenv("FCM_SERVICE_ACCOUNT_JSON", "")
_creds = None
_project_id = None

if _SA_RAW:
    try:
        from google.oauth2 import service_account

        _sa_info = json.loads(_SA_RAW)
        _project_id = _sa_info.get("project_id")
        _creds = service_account.Credentials.from_service_account_info(
            _sa_info, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
        )
        print(f"[Push] FCM enabled (project={_project_id})")
    except Exception as e:
        print(f"[Push] FCM init failed: {e}")
        _creds = None


def push_enabled() -> bool:
    return _creds is not None and _project_id is not None


def _access_token() -> Optional[str]:
    try:
        from google.auth.transport.requests import Request as GoogleRequest

        if not _creds.valid:
            _creds.refresh(GoogleRequest())
        return _creds.token
    except Exception as e:
        print(f"[Push] token refresh failed: {e}")
        return None


def _send_one(token: str, title: str, body: str, data: dict) -> str:
    """반환: 'ok' | 'invalid'(토큰 삭제 대상) | 'error'"""
    at = _access_token()
    if not at:
        return "error"
    msg = {
        "message": {
            "token": token,
            "notification": {"title": title[:100], "body": body[:200]},
            "data": {k: str(v) for k, v in (data or {}).items()},
            "android": {"priority": "HIGH", "notification": {"channel_id": "rendezvous"}},
        }
    }
    try:
        res = requests.post(
            f"https://fcm.googleapis.com/v1/projects/{_project_id}/messages:send",
            headers={"Authorization": f"Bearer {at}", "Content-Type": "application/json"},
            json=msg,
            timeout=10,
        )
        if res.status_code == 200:
            return "ok"
        body_text = res.text or ""
        if res.status_code in (400, 404) and ("UNREGISTERED" in body_text or "INVALID_ARGUMENT" in body_text):
            return "invalid"
        print(f"[Push] send fail {res.status_code}: {body_text[:200]}")
        return "error"
    except Exception as e:
        print(f"[Push] send error: {e}")
        return "error"


def _notify_worker(user_ids: List[int], title: str, body: str, data: dict, exclude_user_id: Optional[int]):
    from core.database import SessionLocal
    from domain import models

    db = SessionLocal()
    try:
        targets = [uid for uid in dict.fromkeys(user_ids) if uid and uid != exclude_user_id]
        if not targets:
            return
        rows = (
            db.query(models.UserPushToken)
            .filter(models.UserPushToken.user_id.in_(targets))
            .all()
        )
        sent = 0
        for r in rows:
            result = _send_one(r.token, title, body, data)
            if result == "ok":
                sent += 1
            elif result == "invalid":
                db.delete(r)
        db.commit()
        if rows:
            print(f"[Push] '{title}' → {sent}/{len(rows)} 기기")
    except Exception as e:
        print(f"[Push] worker error: {e}")
    finally:
        db.close()


def notify_users_async(user_ids: List[int], title: str, body: str, data: dict = None, exclude_user_id: int = None):
    """비동기(데몬 스레드) 푸시 — FCM 미설정이면 조용히 no-op."""
    if not push_enabled() or not user_ids:
        return
    t = threading.Thread(
        target=_notify_worker,
        args=(list(user_ids), title, body, data or {}, exclude_user_id),
        daemon=True,
    )
    t.start()


def register_token(db, user_id: int, token: str, platform: str = "android"):
    from domain import models

    row = db.query(models.UserPushToken).filter(models.UserPushToken.token == token).first()
    if row:
        row.user_id = user_id  # 기기 주인이 바뀐 경우(재로그인) 재귀속
        row.platform = platform or row.platform
        row.last_seen_at = datetime.now()
    else:
        db.add(models.UserPushToken(user_id=user_id, token=token, platform=platform))
    db.commit()
    return {"ok": True}


def unregister_token(db, token: str):
    from domain import models

    db.query(models.UserPushToken).filter(models.UserPushToken.token == token).delete()
    db.commit()
    return {"ok": True}
