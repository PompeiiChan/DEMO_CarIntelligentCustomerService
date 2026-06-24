"""
通义千问 / SiliconFlow LLM 提供商。

继承 OpenAIProvider，添加：
- Qwen3 thinking mode 强制禁用（enable_thinking=False）
- trust_env=False 禁用环境代理
- 从 settings 读取配置的便捷工厂函数
- API key 缺失时自动降级 Mock
"""

from typing import Any, AsyncIterator, Optional

import httpx
from openai import AsyncOpenAI

from pycore.integrations.llm.base import LLMConfig, LLMResponse, Message, ToolDefinition
from pycore.integrations.llm.openai_provider import OpenAIProvider


class QwenProvider(OpenAIProvider):
    """
    通义千问 / SiliconFlow LLM 提供商。

    相对 OpenAIProvider 的差异：
    - 创建 AsyncOpenAI 时传入 trust_env=False 的自定义 httpx 客户端，避免环境代理干扰
    - _build_params 强制写入 extra_body={"enable_thinking": False}，禁用 Qwen3 thinking mode

    用法：
        config = LLMConfig(
            api_key="sk-...",
            base_url="https://api.siliconflow.cn/v1",
            model="Qwen/Qwen3-8B",
        )
        provider = QwenProvider(config)
        response = await provider.chat([Message.user("你好")])
    """

    @property
    def client(self) -> AsyncOpenAI:
        """获取或创建禁用代理的 OpenAI 客户端。"""
        if self._client is None:
            http_client = httpx.AsyncClient(trust_env=False)
            self._client = AsyncOpenAI(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
                timeout=self.config.timeout,
                max_retries=0,
                http_client=http_client,
            )
        return self._client

    def _build_params(
        self,
        messages: list[Message],
        tools: Optional[list[ToolDefinition]] = None,
        **kwargs,
    ) -> dict[str, Any]:
        """构建 API 请求参数，强制禁用 Qwen3 thinking mode。"""
        params = super()._build_params(messages, tools, **kwargs)
        params["extra_body"] = {"enable_thinking": False}
        return params


class MockLLMProvider:
    """API key 缺失时的 mock 回退，返回预设固定值。"""

    async def chat(self, messages, **kwargs) -> LLMResponse:
        """返回固定 mock 响应，格式匹配 LLMResponse。"""
        return LLMResponse(
            content="您好！我是智能客服（Mock模式），请问有什么可以帮您？",
            tool_calls=[],
            model="mock",
            finish_reason="stop",
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
        )

    async def chat_stream(self, messages, **kwargs) -> AsyncIterator[str]:
        """逐字符 yield mock 回复。"""
        mock_reply = "您好！我是智能客服（Mock模式），请问有什么可以帮您？"
        for char in mock_reply:
            yield char

    async def close(self):
        pass


def get_llm_client():
    """
    根据环境变量返回真实或 Mock LLM 客户端。

    优先尝试从 pycore.core.settings 读取配置；
    settings 模块不存在时回退到直接读取 .env 文件。
    LLM_API_KEY 为空时返回 MockLLMProvider。
    """
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None

    try:
        from pycore.core.settings import get_settings

        settings = get_settings()
        api_key = settings.llm_api_key
        base_url = settings.llm_base_url
        model = settings.llm_model
    except (ImportError, AttributeError):
        # settings 模块尚未就绪，直接从 .env 读取
        import os

        try:
            from dotenv import load_dotenv

            load_dotenv()
        except ImportError:
            pass

        api_key = os.environ.get("LLM_API_KEY", "")
        base_url = os.environ.get("LLM_BASE_URL", "")
        model = os.environ.get("LLM_MODEL", "Qwen/Qwen3-8B")

    if not api_key:
        return MockLLMProvider()

    config = LLMConfig(
        api_key=api_key,
        base_url=base_url or None,
        model=model or "Qwen/Qwen3-8B",
    )
    return QwenProvider(config)
