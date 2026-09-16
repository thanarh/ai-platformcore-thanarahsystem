import asyncio
import json

from app.backends.base import AIRequest
from app.backends.fallback import FallbackBackend


async def main() -> None:
    backend = FallbackBackend()

    greeting = await backend.chat(AIRequest(messages=[{"role": "user", "content": "هلا"}]))
    assert "هلا بك" in greeting.content, greeting.content
    assert "قيد الاستعادة" not in greeting.content, greeting.content

    unclear = await backend.chat(AIRequest(messages=[{"role": "user", "content": "لتلت"}]))
    assert "لم أفهم" in unclear.content, unclear.content
    assert "قيد الاستعادة" not in unclear.content, unclear.content

    marker = "THANARAH-KNOWLEDGE-CHECK"
    grounded = await backend.chat(
        AIRequest(
            messages=[{"role": "user", "content": "ما رمز التحقق؟"}],
            context=f"## Relevant Knowledge\n\n1. رمز التحقق هو {marker}",
        )
    )
    assert marker in grounded.content, grounded.content

    print(json.dumps({
        "status": "ok",
        "greeting": greeting.content,
        "unclear": unclear.content,
        "knowledgeGrounded": marker in grounded.content,
    }, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
