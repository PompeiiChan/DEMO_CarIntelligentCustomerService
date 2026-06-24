"""
auto-cs 应用配置。

使用 pydantic-settings 从 .env 文件读取配置。
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM
    llm_api_key: str = ""
    llm_base_url: str = "https://api.siliconflow.cn/v1"
    llm_model: str = "Qwen/Qwen3-32B"

    # Embedding
    embedding_api_key: str = ""
    embedding_base_url: str = "https://api.siliconflow.cn/v1"
    embedding_model: str = "Qwen/Qwen3-Embedding-8B"

    # Rerank
    rerank_api_key: str = ""
    rerank_base_url: str = "https://api.siliconflow.cn/v1"
    rerank_model: str = "Qwen/Qwen3-Reranker-8B"
    rerank_top_n: int = 5

    # DB
    database_path: str = "./data/auto_cs.db"
    chroma_persist_dir: str = "./data/chroma"

    # Server
    backend_port: int = 8199
    backend_host: str = "0.0.0.0"

    # Upload
    upload_dir: str = "./data/uploads"
    max_upload_size_mb: int = 10


def get_settings() -> Settings:
    return Settings()
