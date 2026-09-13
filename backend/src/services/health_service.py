"""Read-only probes. Never expose DB errors, URLs, or row contents."""
import os
import re

from sqlalchemy import select, text

from domain import models as m


def release():
    revision = os.getenv("RENDER_GIT_COMMIT") or os.getenv("APP_REVISION", "")
    return revision.lower() if re.fullmatch(r"[a-fA-F0-9]{7,40}", revision) else "unknown"


def probe_database(db):
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SET LOCAL statement_timeout = '3000ms'"))
    db.execute(text("SELECT 1"))
    for model in (m.ActionLog, m.VisitEvent, m.VisitParticipant, m.VisitApprovalRequest,
                  m.PartnershipRedemption, m.ListCopyEvent, m.VerifiedVisitFeedback):
        db.execute(select(model).limit(0))
    db.execute(select(m.UserEmbedding.computed_at).limit(0))
