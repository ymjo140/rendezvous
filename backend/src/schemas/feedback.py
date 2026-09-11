from typing import Annotated
from pydantic import BaseModel, Field, StrictBool, model_validator


class FeedbackEvidence(BaseModel):
    place_id: int = Field(gt=0)
    visit_id: str | None = Field(default=None, min_length=1, max_length=100)
    checkin_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def exactly_one_proof(self):
        if bool(self.visit_id) == bool(self.checkin_id):
            raise ValueError("방문 인증 기록 하나를 선택해주세요.")
        return self


class FeedbackRequest(FeedbackEvidence):
    personal_revisit: StrictBool
    group_revisit: StrictBool | None = None
    dislike_reason: str | None = Field(default=None, max_length=32)


class ReviewRequest(FeedbackEvidence):
    rating: float = Field(ge=1, le=5, allow_inf_nan=False)
    comment: str | None = Field(default=None, max_length=2000)
    tags: list[Annotated[str, Field(max_length=50)]] = Field(default_factory=list, max_length=8)
    image_urls: list[Annotated[str, Field(max_length=2800000)]] = Field(default_factory=list, max_length=3)
