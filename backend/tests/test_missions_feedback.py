from datetime import timedelta
import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text

from core import visit_time as clock
from core.request_metrics import RequestMetricsMiddleware
from domain import models as m
from services import checkin_service, crew_kitchen_service, feedback_service, taste_service
from schemas.feedback import FeedbackRequest, ReviewRequest


@pytest.fixture
def setup(db, monkeypatch):
    now = clock.utc_now()
    monkeypatch.setattr(clock, "utc_now", lambda: now)
    db.add_all([m.Community(id="a", title="A", host_id=1, member_ids=[2], visibility="public"),
                m.Community(id="b", title="B", host_id=3, member_ids=[], visibility="public"),
                m.Community(id="self", title="Self", host_id=1, member_ids=[], visibility="public")])
    db.commit()
    return now


def folder(db, cid, uid=1, source="manual", public=True):
    row = m.SaveFolder(community_id=cid, user_id=uid, name="테스트 리스트", is_public=public)
    db.add(row); db.flush()
    db.add(m.SavedItem(folder_id=row.id, user_id=uid, item_type="place", place_id=1, source=source))
    db.commit()
    return row


def mission(db, key, cid="a", uid=1, weekly=False):
    result = crew_kitchen_service.get_missions(db, cid, uid)
    return next(x for x in result["weekly" if weekly else "steps"] if x["key"] == key)


@pytest.mark.parametrize("cid,source,done", [(None,"manual",False),("self","manual",False),
                                             ("a","copy",False),("a","import",False),("a","manual",True)])
def test_manual_save_mission_scope(db, setup, cid, source, done):
    folder(db, cid, source=source)
    assert mission(db,"save")["done"] is done


@pytest.mark.parametrize("cid,owner,credit", [("self",1,False),("a",2,False),(None,3,False),("b",3,True)])
def test_copy_uses_actual_source_and_destination(db, client_for, setup, cid, owner, credit):
    src = folder(db, cid, uid=owner)
    client = client_for(1)
    first = client.post(f"/api/lists/{src.id}/save", json={"community_id":"a"})
    assert first.status_code == 200, first.text
    second = client.post(f"/api/lists/{src.id}/save", json={"community_id":"a"})
    assert second.json()["added"] == 0
    assert first.json()["folder_id"] == second.json()["folder_id"]
    assert db.query(m.ListCopyEvent).count() == 1
    assert mission(db,"borrow")["done"] is credit
    assert mission(db,"borrow",cid="self")["done"] is False
    assert mission(db,"save")["done"] is False


def test_old_saves_and_personal_copies_do_not_complete_crew_mission(db, client_for, setup):
    src = folder(db,"b",uid=3)
    db.add(m.ListSave(folder_id=src.id,user_id=1)); db.commit()
    assert not mission(db,"borrow")["done"]
    assert client_for(1).post(f"/api/lists/{src.id}/save",json={}).status_code == 200
    assert not mission(db,"borrow")["done"]


def test_weekly_copy_uses_kst_week_and_does_not_renew_on_update(db, client_for, setup):
    src = folder(db,"b",uid=3)
    client_for(1).post(f"/api/lists/{src.id}/save",json={"community_id":"a"})
    event = db.query(m.ListCopyEvent).one()
    event.created_at = clock.week_start() - timedelta(microseconds=1); db.commit()
    assert mission(db,"borrow")["done"]
    assert not mission(db,"borrow",weekly=True)["done"]
    event.created_at = clock.week_start(); db.commit()
    assert mission(db,"borrow",weekly=True)["done"]


def test_private_sources_and_former_members_fail(db, client_for, setup):
    src = folder(db,"b",uid=3,public=False)
    client = client_for(1)
    assert client.post(f"/api/lists/{src.id}/save",json={"community_id":"a"}).status_code == 404
    src.is_public = True
    target = folder(db,"b",uid=1)
    assert client.post(f"/api/lists/{src.id}/save",json={"target_folder_id":target.id}).status_code == 404
    assert db.query(m.ListCopyEvent).count() == 0


def test_mission_options_and_actions(db, client_for, setup):
    other, own = folder(db,"b",uid=3), folder(db,"self")
    client = client_for(1)
    data = client.get("/api/groups/a/mission-options").json()
    assert [x["id"] for x in data["lists"]] == [other.id]
    assert client_for(3).get("/api/groups/a/mission-options").status_code == 404
    data = client.get("/api/groups/a/missions")  # identity remains 3 until changed
    assert data.status_code == 404
    data = client_for(1).get("/api/groups/a/missions").json()
    assert all(x["action"]["href"].startswith("/crew/a/missions?") for x in data["steps"] + data["weekly"])


def attended(db, now, uid=1, cid="a", age=3):
    row, _ = checkin_service.record_attendance(db, db.get(m.User,uid),db.get(m.Place,1),cid,
                   now-timedelta(hours=age), now-timedelta(hours=age), "merchant_approval", "test")
    db.commit()
    return row


def test_pending_feedback_delay_and_pending_joint_attendee(db, client_for, setup):
    event = attended(db,setup,age=2)
    client=client_for(1)
    assert event.status == "pending"
    assert client.get("/api/feedback/pending").json()["count"] == 0
    req={"visit_id":event.id,"place_id":1,"personal_revisit":True}
    assert client.post("/api/feedback",json=req).status_code == 409
    participant=db.query(m.VisitParticipant).one()
    participant.occurred_at=setup-timedelta(hours=3); db.commit()
    assert client.get("/api/feedback/pending").json()["items"][0]["visit_id"] == event.id
    assert client.post("/api/feedback",json=req).json()["status"] == "ok"
    assert client.post("/api/feedback",json=req).json()["status"] == "already"
    assert client.get("/api/feedback/pending").json()["count"] == 0
    assert db.query(m.VerifiedVisitFeedback).count() == 1


@pytest.mark.parametrize("patch,status", [({"place_id":2},404),({"personal_revisit":"false"},422),
    ({"visit_id":None,"reservation_id":"made-up"},422),({"checkin_id":123},422)])
def test_feedback_rejects_forged_evidence_and_untyped_answers(db,client_for,setup,patch,status):
    event=attended(db,setup)
    req={"visit_id":event.id,"place_id":1,"personal_revisit":True,**patch}
    assert client_for(1).post("/api/feedback",json=req).status_code == status
    assert db.query(m.VerifiedVisitFeedback).count() == 0


def test_another_member_cannot_answer_and_departed_member_cannot_answer_for_crew(db,client_for,setup):
    event=attended(db,setup)
    req={"visit_id":event.id,"place_id":1,"personal_revisit":False,"group_revisit":True}
    assert client_for(2).post("/api/feedback",json=req).status_code == 404
    crew=db.get(m.Community,"a"); crew.host_id=2; crew.member_ids=[]; db.commit()
    client=client_for(1)
    assert client.get("/api/feedback/pending").json()["items"][0]["room_id"] is None
    assert client.post("/api/feedback",json=req).status_code == 400
    req["group_revisit"]=None
    assert client.post("/api/feedback",json=req).status_code == 200


def test_review_requires_feedback_and_preserves_one_review(db,client_for,setup):
    event=attended(db,setup)
    client=client_for(1)
    req={"visit_id":event.id,"place_id":1,"rating":4,"comment":"좋았어요"}
    assert client.post("/api/feedback/review",json=req).status_code == 409
    client.post("/api/feedback",json={"visit_id":event.id,"place_id":1,"personal_revisit":True})
    first=client.post("/api/feedback/review",json=req)
    assert first.status_code == 200,first.text
    assert client.post("/api/feedback/review",json=req).json()["id"] == first.json()["id"]
    assert client_for(2).post("/api/feedback/review",json=req).status_code == 404
    assert db.query(m.Review).count() == 1


def test_legacy_feedback_requires_own_checkin(db,client_for,setup):
    c=m.PlaceCheckin(user_id=1,place_id=1,date=clock.kst_date(setup).isoformat(),created_at=(setup-timedelta(hours=4)).replace(tzinfo=None))
    db.add(c);db.commit()
    req={"checkin_id":c.id,"place_id":1,"personal_revisit":True,"room_id":"forged"}
    assert client_for(2).post("/api/feedback",json=req).status_code == 404
    assert client_for(1).post("/api/feedback",json=req).status_code == 200
    assert db.query(m.PlaceVisitFeedback).one().room_id is None


def test_attendance_taste_signal_deduplicates_place_day_and_invalidates_cache(db,setup):
    a=attended(db,setup)
    attended(db,setup,cid=None)
    assert db.execute(text("select computed_at from user_embeddings where user_id=1")).scalar() is None
    signals,excluded=taste_service.collect_signals(db,1)
    assert len(signals)==1 and signals[0].weight <= taste_service.W_CHECKIN[0]
    assert not excluded
    feedback_service.submit(db,db.get(m.User,1),FeedbackRequest(visit_id=a.id,place_id=1,personal_revisit=False))
    signals,excluded=taste_service.collect_signals(db,1)
    assert not signals and excluded == {1}


def test_feedback_badges_count_people_and_hide_private_crew_activity(db,client_for,setup):
    for uid in (1,2,3):
        db.add(m.PlaceVisitFeedback(user_id=uid,place_id=1,personal_revisit=True,group_revisit=True,room_id="self"))
    db.get(m.Community,"self").visibility="private";db.commit()
    stats=client_for(None).get("/api/feedback/place/1").json()
    assert stats["personal_revisit_yes"]==3 and stats["group_revisit_yes"]==0
    db.add(m.PlaceVisitFeedback(user_id=1,place_id=1,personal_revisit=True));db.commit()
    assert client_for(None).get("/api/feedback/place/1").json()["personal_revisit_yes"]==3


def test_metrics_log_route_template_without_private_data(caplog):
    app=FastAPI();app.add_middleware(RequestMetricsMiddleware)
    @app.get("/visits/{visit_id}")
    def visit(visit_id:str):return {"ok":True}
    caplog.set_level(logging.INFO,logger="uvicorn.error")
    response=TestClient(app).get("/visits/private-id?qr=secret",headers={"Authorization":"Bearer secret"})
    assert response.headers["x-request-id"]
    item=json.loads(caplog.records[-1].message)
    assert item["route"]=="/visits/{visit_id}" and item["status"]==200 and item["duration_ms"]>=0
    assert "private-id" not in caplog.text and "secret" not in caplog.text
