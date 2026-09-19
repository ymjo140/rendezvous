from domain import models


def seed_mail_data(db):
    db.add(models.Friendship(requester_id=2, receiver_id=1, status="pending"))
    crew = models.Community(
        id="mail-crew",
        host_id=1,
        member_ids=[2],
        title="빵 탐방 크루",
        icon="🥐",
    )
    db.add(crew)
    db.add(models.ChatRoom(id="mail-crew", title="[크루] 빵 탐방 크루", is_group=True))
    db.add(models.ChatRoomMember(room_id="mail-crew", user_id=1))
    db.add(models.Message(room_id="mail-crew", user_id=2, content="이번 주말에 새 제휴 가게 가볼까요?"))
    deal = models.CrewPartnership(
        place_id=1,
        title="크루 방문 혜택",
        benefit="대표 메뉴 10% 할인",
        discount_pct=10,
        conditions={"days": ["sat", "sun"], "min_party": 2},
    )
    db.add(deal)
    db.flush()
    db.add(models.CrewPartnershipApp(
        partnership_id=deal.id,
        community_id=crew.id,
        applicant_id=0,
        direction="store_invite",
        status="pending",
        message="이번 달 크루 방문을 기다리고 있어요.",
    ))
    db.add(models.CoinHistory(user_id=1, amount=30, type="reward", description="리뷰 작성 보상"))
    db.commit()


def test_mail_inbox_aggregates_existing_records_and_respects_crew_access(db, client_for):
    seed_mail_data(db)
    client = client_for(1)

    response = client.get("/api/mail/inbox")
    assert response.status_code == 200
    data = response.json()
    assert {item["category"] for item in data["items"]} >= {"friend", "crew", "partnership", "reward"}
    assert data["counts"]["partnership"] == 1
    assert data["unread_count"] >= 2

    partnership = next(item for item in data["items"] if item["category"] == "partnership")
    assert partnership["terms"]["discount_pct"] == 10
    assert partnership["conversation_room_id"] == "mail-crew"

    read = client.post(f"/api/mail/partnership/{partnership['app_id']}/read")
    assert read.status_code == 200
    assert db.get(models.CrewPartnershipApp, partnership["app_id"]).seen_at is not None

    outsider = client_for(3)
    outsider_data = outsider.get("/api/mail/inbox").json()
    assert not any(item["category"] == "partnership" for item in outsider_data["items"])
    assert outsider.post(f"/api/mail/partnership/{partnership['app_id']}/read").status_code == 403


def test_mail_friend_accept_creates_a_direct_chat(db, client_for):
    db.add(models.Friendship(requester_id=2, receiver_id=1, status="pending"))
    db.commit()
    friendship_id = db.query(models.Friendship).one().id

    response = client_for(1).post(f"/api/mail/friend/{friendship_id}/accept")
    assert response.status_code == 200
    assert response.json()["room_id"]
    assert db.get(models.Friendship, friendship_id).status == "accepted"
    room_id = response.json()["room_id"]
    member_ids = {row.user_id for row in db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()}
    assert member_ids == {1, 2}
