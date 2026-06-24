"""
数据库迁移脚本。

自动建表，应在应用启动时调用。
"""

from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from pycore.core.settings import get_settings
from pycore.integrations.db.models import Base


async def run_migrations() -> None:
    """创建所有业务表（幂等，表已存在时跳过）。"""
    settings = get_settings()
    db_path = settings.database_path

    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 幂等补列：pipeline_steps（documents 表已存在时用 ALTER TABLE 添加）
        try:
            await conn.execute(
                text("ALTER TABLE documents ADD COLUMN pipeline_steps TEXT")
            )
        except Exception:  # noqa: BLE001
            # 列已存在时 SQLite 会报 OperationalError，静默忽略
            pass
    await engine.dispose()


if __name__ == "__main__":
    import asyncio

    asyncio.run(run_migrations())
    print("Migrations completed.")
