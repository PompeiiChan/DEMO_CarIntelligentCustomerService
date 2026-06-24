"""
auto-cs FastAPI 应用入口。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.agent import ws_router as agent_ws_router
from app.routers.chat import router as chat_router
from app.routers.chat import ws_router as chat_ws_router
from app.routers.knowledge import router as knowledge_router
from app.routers.mock import router as mock_router
from app.routers.tickets import router as tickets_router
from pycore.core.settings import get_settings
from pycore.integrations.db.migrations import run_migrations

settings = get_settings()

app = FastAPI(title="auto-cs API", version="1.0.0", docs_url="/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5185", "http://localhost:5175", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    await run_migrations()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "1.0.0"}


app.include_router(mock_router)
app.include_router(chat_router)
app.include_router(chat_ws_router)
app.include_router(agent_ws_router)
app.include_router(tickets_router)
app.include_router(knowledge_router)
