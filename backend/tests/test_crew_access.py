import pytest

from domain import models
from services.crew_access import public_folder_clause


def seed_crew(db, visibility):
    crew = models.Community(id="crew", host_id=1, member_ids=[2], title="테스트 크루", visibility=visibility)
    db.add(crew)
    # Deliberately keep public=True even for private crews to cover legacy data.
    db.add_all([
        models.SaveFolder(id=1, user_id=1, community_id=crew.id, name="공개 리스트", is_public=True, item_count=1),
        models.SaveFolder(id=2, user_id=1, community_id=crew.id, name="비밀 리스트", is_public=False, item_count=1),
    ])
    db.add(models.SavedItem(folder_id=1, user_id=1, item_type="place", place_id=1))
    db.add(models.PlaceCheckin(user_id=2, place_id=1, community_id=crew.id, date="2026-09-01"))
    db.add_all([
        models.Post(id="public-post", user_id=2, place_id=1, is_public=True, content="공개 후기", image_urls=["https://example.invalid/photo.jpg"]),
        models.Post(id="private-post", user_id=2, place_id=1, is_public=False, content="비밀 후기"),
    ])
    db.add(models.ListComment(folder_id=1, user_id=3, content="좋아요"))
    db.commit()
    from services.checkin_service import record_attendance
    from core.visit_time import UTC
    from datetime import datetime
    at = datetime(2026, 9, 1, 3, tzinfo=UTC)
    for uid in (1, 2):
        record_attendance(db, db.get(models.User, uid), db.get(models.Place, 1), crew.id,
                          at, at, "merchant_approval", "seed")
    db.commit()
    return crew


@pytest.mark.parametrize("visibility", ["private", "list_only", "public", "open", "unknown"])
@pytest.mark.parametrize("uid", [None, 3, 2, 1], ids=["guest", "outsider", "member", "host"])
def test_crew_visibility_matrix(db, client_for, visibility, uid):
    seed_crew(db, visibility)
    client = client_for(uid)
    member = uid in (1, 2)
    visible = member or visibility in ("list_only", "public", "open")
    activity = member or visibility in ("public", "open")

    detail = client.get("/api/groups/crew")
    assert detail.status_code == (200 if visible else 404)
    if visible:
        assert {f["id"] for f in detail.json()["lists"]} == ({1, 2} if member else {1})
        assert bool(detail.json()["members"]) == activity

    kitchen = client.get("/api/groups/crew/kitchen")
    assert kitchen.status_code == (200 if activity else 404)
    if activity:
        assert {u["id"] for u in kitchen.json()["members"]} == {1, 2}

    showcase = client.get("/api/groups/crew/showcase")
    assert showcase.status_code == (200 if visible else 404)
    if visible:
        data = showcase.json()
        assert {f["id"] for f in data["lists"]} == ({1, 2} if member else {1})
        assert bool(data["visits"]) == activity
        assert [p["id"] for p in data["posts"]] == (["public-post"] if activity else [])
        if activity:
            assert data["posts"][0]["image"] == "https://example.invalid/photo.jpg"

    for fid in (1, 2):
        allowed = member or (visible and fid == 1)
        response = client.get(f"/api/lists/{fid}")
        assert response.status_code == (200 if allowed else 404)
        assert client.get(f"/api/lists/{fid}/comments").status_code == (200 if allowed else 404)
        if allowed and not activity:
            assert response.json()["owner"] is None


def test_private_conversion_hides_legacy_public_lists_everywhere(db, client_for):
    crew = seed_crew(db, "public")
    client = client_for(3)
    assert client.get("/api/lists/1").status_code == 200
    crew.visibility = "private"
    db.commit()
    assert db.query(models.SaveFolder).filter(public_folder_clause()).count() == 0
    assert client.get("/api/lists/1").status_code == 404
    assert client.get("/api/lists/1/comments").status_code == 404
    for path, payload in [("like", {}), ("save", {}), ("comments", {"content": "test"})]:
        assert client.post(f"/api/lists/1/{path}", json=payload).status_code == 404
    assert client.get("/api/list-ranking").json()["items"] == []
    assert client.get("/api/users/1/lists").json()["items"] == []
    assert client_for(None).get("/api/home/search").json()["items"] == []


def test_list_only_does_not_identify_owner_via_profile_or_ranking(db, client_for):
    seed_crew(db, "list_only")
    client = client_for(None)
    assert client.get("/api/users/1/lists").json()["items"] == []
    ranking = client.get("/api/list-ranking").json()["items"]
    assert ranking[0]["folder_id"] == 1
    assert ranking[0]["curator"] is None


def test_private_folder_creation_and_host_access(db, client_for):
    seed_crew(db, "private")
    client = client_for(1)  # host intentionally absent from member_ids
    response = client.post("/api/groups/crew/folders", json={"name": "새 폴더"})
    assert response.status_code == 200
    assert response.json()["is_public"] is False
    assert client.get(f'/api/lists/{response.json()["id"]}').status_code == 200


def test_former_member_cannot_read_private_crew_folder_they_created(db, client_for):
    crew = seed_crew(db, "private")
    crew.host_id = 2
    crew.member_ids = [2]
    db.commit()
    client = client_for(1)
    assert client.get("/api/lists/1").status_code == 404
    assert client.patch("/api/folders/1/publish", json={"is_public": True}).status_code == 403
    assert client.get("/api/folders/1/items").status_code == 404
    assert all(f["id"] not in (1, 2) for f in client.get("/api/folders").json())
    assert client.get("/api/me/map-places").json()["folders"] == []


def test_personal_public_and_private_lists(db, client_for):
    db.add_all([
        models.SaveFolder(id=1, user_id=1, name="개인 공개", is_public=True),
        models.SaveFolder(id=2, user_id=1, name="개인 비공개", is_public=False),
    ])
    db.commit()
    client = client_for(None)
    assert client.get("/api/lists/1").status_code == 200
    assert client.get("/api/lists/2").status_code == 404
    assert client_for(1).get("/api/lists/2").status_code == 200
