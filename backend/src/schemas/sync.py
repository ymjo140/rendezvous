from pydantic import BaseModel

class SyncRequest(BaseModel):
    url: str
    source_name: str  # "구글", "에브리타임" 등