"""Record copy provenance in the same transaction as the copied places."""
from core import visit_time as clock
from domain import models
from services.crew_access import is_member, public_folder_clause, VISIBLE


def record_copy(db, user, source, target, added):
    if not added:
        return
    previous = db.query(models.ListCopyEvent).filter_by(
        source_folder_id=source.id, destination_folder_id=target.id, user_id=user.id).first()
    if previous:
        # Updating a previously copied list does not farm new weekly credit.
        previous.added_count += added
        return
    source_crew = db.get(models.Community, source.community_id) if source.community_id else None
    public = db.query(models.SaveFolder.id).filter(
        models.SaveFolder.id == source.id, public_folder_clause()).first() is not None
    credited = db.query(models.ListCopyEvent.id).filter_by(
        source_folder_id=source.id, destination_community_id=target.community_id,
        user_id=user.id, creditable=True).first() is not None
    creditable = bool(not credited and public and source_crew and target.community_id
                      and source.community_id != target.community_id and not is_member(source_crew, user))
    db.add(models.ListCopyEvent(
        source_folder_id=source.id, source_community_id=source.community_id,
        destination_folder_id=target.id, destination_community_id=target.community_id,
        user_id=user.id, added_count=added, creditable=creditable, created_at=clock.utc_now()))


def borrow_options(db, user, cid):
    # Do not expose membership in the response, including list-only crews.
    rows = (db.query(models.SaveFolder, models.Community)
            .join(models.Community, models.Community.id == models.SaveFolder.community_id)
            .filter(models.SaveFolder.is_public.is_(True), models.Community.visibility.in_(VISIBLE), models.Community.id != cid)
            .filter(models.SaveFolder.items.any(models.SavedItem.place_id.isnot(None)))
            .order_by(models.SaveFolder.id.desc()).limit(200).all())
    return [{"id": f.id, "name": f.name, "crew_title": c.title,
             "community_id": c.id, "count": f.item_count}
            for f, c in rows if not is_member(c, user)][:30]
