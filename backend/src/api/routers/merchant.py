from fastapi import APIRouter

router = APIRouter()


@router.get("/stores")
async def list_merchant_stores():
    return {
        "stores": [
            {
                "id": "dev-store-1",
                "name": "\uB799\uB9BD \uB370\uBAA8 \uB9E4\uC7A5",
                "location": "\uC11C\uC6B8 \uC131\uBD81\uAD6C \uC548\uC554\uB85C",
                "owner_id": "dev-owner",
            },
            {
                "id": "dev-store-2",
                "name": "\uC548\uC554 2\uD638\uC810",
                "location": "\uC11C\uC6B8 \uC131\uBD81\uAD6C \uC548\uC554\uB3D9",
                "owner_id": "dev-owner",
            },
        ]
    }
