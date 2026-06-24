"""
auto-cs 业务数据库模型。

包含 5 张核心业务表：sessions, messages, tickets, bad_cases, documents。
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """SQLAlchemy 声明式基类。"""

    pass


class Session(Base):
    """会话表。"""

    __tablename__ = "sessions"

    session_id: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[str] = mapped_column(String(32), default="ai_serving")
    ticket_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    round: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class Message(Base):
    """消息表。"""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("sessions.session_id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    intent: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    intent_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    emotion: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    emotion_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Ticket(Base):
    """工单表。"""

    __tablename__ = "tickets"

    ticket_id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    priority: Mapped[str] = mapped_column(String(32), default="medium")
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    emotion: Mapped[str] = mapped_column(String(32), default="neutral")
    transfer_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    preview: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    wait_seconds: Mapped[int] = mapped_column(Integer, default=0)
    round: Mapped[int] = mapped_column(Integer, default=0)
    agent_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    assigned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BadCase(Base):
    """差评/坏案例标记表。"""

    __tablename__ = "bad_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[str] = mapped_column(String, nullable=False)
    agent_id: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    marked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Document(Base):
    """知识库文档表。"""

    __tablename__ = "documents"

    doc_id: Mapped[str] = mapped_column(String, primary_key=True)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="processing")
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    qa_count: Mapped[int] = mapped_column(Integer, default=0)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    error_msg: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pipeline_steps: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
