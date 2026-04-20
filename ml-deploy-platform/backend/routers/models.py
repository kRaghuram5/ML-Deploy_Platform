from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_models() -> dict:
    # Hackathon placeholder for future persistence layer.
    return {"items": []}
