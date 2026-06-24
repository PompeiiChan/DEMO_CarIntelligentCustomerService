# app/routers/mock.py
import json
from pathlib import Path

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/v1/mock", tags=["mock"])

DATA_DIR = Path(__file__).parent.parent.parent / "pycore" / "data" / "mock"

def _load(filename: str) -> list:
    with open(DATA_DIR / filename, encoding="utf-8") as f:
        return json.load(f)

@router.get("/cars")
async def get_cars(q: str | None = Query(None)):
    items = _load("cars.json")
    if q:
        items = [c for c in items if q.lower() in c["model"].lower()]
    return {"code": 200, "message": "success", "data": {"items": items}}

@router.get("/stores")
async def get_stores(city: str | None = Query(None)):
    items = _load("stores.json")
    if city:
        items = [s for s in items if s["city"] == city]
    return {"code": 200, "message": "success", "data": {"items": items}}
