import json
import os
import time
import uuid

import requests


API = os.environ.get("E2E_API_URL", "http://127.0.0.1:3401/api")
EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "").strip().lower()
PASSWORD_FILE = os.environ.get("E2E_ADMIN_PASSWORD_FILE", "/tmp/thanarah_e2e_admin_password")


def request(method: str, path: str, **kwargs):
    response = requests.request(method, f"{API}{path}", timeout=45, **kwargs)
    if not response.ok:
        raise RuntimeError(f"{method} {path} failed: {response.status_code} {response.text[:500]}")
    if response.status_code == 204:
        return None
    return response.json()


def main():
    if not EMAIL:
        raise RuntimeError("E2E_ADMIN_EMAIL is required")
    password = open(PASSWORD_FILE, encoding="utf-8").read().strip()
    login = request("POST", "/auth/login", json={"email": EMAIL, "password": password})
    token = login["accessToken"]
    assert login["user"]["role"] == "OWNER", login["user"]
    headers = {"Authorization": f"Bearer {token}"}

    # Remove leftovers from interrupted earlier regression runs.
    for existing_source in request("GET", "/knowledge", headers=headers):
        if str(existing_source.get("name", "")).startswith("اختبار THANARAH-E2E-"):
            request("DELETE", f"/knowledge/{existing_source['_id']}", headers=headers)
    for existing_conversation in request("GET", "/conversations", headers=headers):
        if existing_conversation.get("title") == "اختبار النظام":
            request("DELETE", f"/conversations/{existing_conversation['_id']}", headers=headers)

    capabilities = request("GET", "/ai/capabilities", headers=headers)
    assert capabilities["generation"]["enabled"] is True, capabilities
    assert capabilities["rag"]["enabled"] is True, capabilities

    marker = f"THANARAH-E2E-{uuid.uuid4().hex[:10]}"
    knowledge_text = f"رمز التحقق الخاص بمنصة ثنارة هو {marker}. هذه معلومة اختبارية مؤقتة."
    source = request(
        "POST",
        "/knowledge",
        headers=headers,
        json={"name": f"اختبار {marker}", "type": "document", "text": knowledge_text},
    )
    source_id = source["_id"]
    assert source["status"] == "ready", source
    assert source.get("chunkCount", 0) >= 1, source

    search = request(
        "POST",
        "/knowledge/search",
        headers=headers,
        json={"query": marker, "limit": 5},
    )
    assert search.get("results"), search
    assert any(marker in item.get("content", "") for item in search["results"]), search

    conversation = request("POST", "/conversations", headers=headers, json={"title": "اختبار النظام"})
    conversation_id = conversation["_id"]

    with requests.post(
        f"{API}/ai/chat/stream",
        headers={**headers, "Content-Type": "application/json"},
        json={"conversationId": conversation_id, "content": f"ما رمز التحقق {marker}؟"},
        stream=True,
        timeout=60,
    ) as response:
        if not response.ok:
            raise RuntimeError(f"stream failed: {response.status_code} {response.text[:500]}")
        response.encoding = "utf-8"
        content = []
        done = False
        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if raw == "[DONE]":
                done = True
                break
            try:
                event = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"malformed SSE event: {raw!r}") from exc
            if event.get("delta"):
                content.append(event["delta"])
            if event.get("error"):
                raise RuntimeError(event.get("content") or "stream returned error")

    answer = "".join(content).strip()
    assert done, "stream did not emit DONE"
    assert answer, "stream returned empty assistant content"
    assert marker in answer, answer

    request("DELETE", f"/knowledge/{source_id}", headers=headers)
    request("DELETE", f"/conversations/{conversation_id}", headers=headers)

    print(json.dumps({
        "status": "ok",
        "role": login["user"]["role"],
        "capabilities": {
            "generation": capabilities["generation"]["enabled"],
            "rag": capabilities["rag"]["enabled"],
        },
        "knowledgeChunks": source.get("chunkCount"),
        "searchResults": len(search["results"]),
        "streamAnswerChars": len(answer),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
