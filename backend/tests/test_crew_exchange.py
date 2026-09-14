from datetime import timedelta

import pytest

from core import visit_time as clock
from domain import models as m


@pytest.fixture
def setup_exchange(db):
    db.add_all([
        m.Community(id="a", title="A 크루", host_id=1, member_ids=[2], visibility="public"),
        m.Community(id="b", title="B 크루", host_id=3, member_ids=[], visibility="public"),
        m.Community(id="private", title="비공개 크루", host_id=3, member_ids=[], visibility="private"),
    ])
    db.commit()
    return clock.utc_now()


def folder(db, cid, uid, name, public=True):
    row = m.SaveFolder(
        community_id=cid,
        user_id=uid,
        name=name,
        is_public=public,
        item_count=1,
    )
    db.add(row)
    db.flush()
    db.add(m.SavedItem(
        folder_id=row.id,
        user_id=uid,
        item_type="place",
        place_id=1,
        source="manual",
    ))
    db.commit()
    return row


def copy_event(source, destination, user_id, at, *, added=1, creditable=True):
    return m.ListCopyEvent(
        source_folder_id=source.id,
        source_community_id=source.community_id,
        destination_folder_id=destination.id,
        destination_community_id=destination.community_id,
        user_id=user_id,
        added_count=added,
        creditable=creditable,
        created_at=at,
    )


def test_empty_exchange_is_explicitly_sparse(db, client_for, setup_exchange):
    data = client_for(1).get("/api/groups/a/exchange").json()
    assert data["visible"] is True
    assert data["observed"] is False
    assert data["status"] == "collecting"
    assert data["summary"] == {
        "incoming_crews": 0,
        "outgoing_crews": 0,
        "incoming_places": 0,
        "outgoing_places": 0,
    }


def test_exchange_shows_public_crew_flow_without_user_identity(db, client_for, setup_exchange):
    source_b = folder(db, "b", 3, "B 추천")
    destination_a = folder(db, "a", 1, "A가 담아온 B 리스트")
    source_a = folder(db, "a", 1, "A 추천")
    destination_b = folder(db, "b", 3, "B가 담아온 A 리스트")
    private_source = folder(db, "private", 3, "비공개 추천")
    db.add_all([
        copy_event(source_b, destination_a, 1, setup_exchange, added=3),
        copy_event(source_a, destination_b, 3, setup_exchange + timedelta(minutes=5), added=2),
        copy_event(private_source, destination_a, 1, setup_exchange + timedelta(minutes=10), added=9),
        copy_event(source_b, destination_a, 1, setup_exchange + timedelta(minutes=15), added=4, creditable=False),
    ])
    db.commit()

    data = client_for(1).get("/api/groups/a/exchange").json()
    assert data["observed"] is True
    assert data["summary"]["incoming_crews"] == 1
    assert data["summary"]["outgoing_crews"] == 1
    assert data["summary"]["incoming_places"] == 3
    assert data["summary"]["outgoing_places"] == 2
    assert data["incoming"][0]["crew_title"] == "B 크루"
    assert data["incoming"][0]["list_name"] == "B 추천"
    assert data["outgoing"][0]["crew_title"] == "B 크루"
    assert data["outgoing"][0]["list_name"] == "B가 담아온 A 리스트"
    assert "user_id" not in data["incoming"][0]
    assert "private" not in str(data)

    db.get(m.Community, "a").visibility = "list_only"
    db.commit()
    hidden = client_for(3).get("/api/groups/a/exchange").json()
    assert hidden["visible"] is False
    assert hidden["incoming"] == []
    assert hidden["outgoing"] == []
