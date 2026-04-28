import os
import json
import urllib.request
from fastapi import APIRouter
from pydantic import BaseModel
from utils.db import safe_db

router = APIRouter()

NOTION_API_KEY = os.getenv("NOTION_API_KEY", "")
NOTION_MANUAL_DB_ID = os.getenv("NOTION_MANUAL_DB_ID", "3494dda05af58037a4a3fe31164fefe0")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


def notion_request(url: str, method="GET", body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url, data=data,
        headers={
            "Authorization": f"Bearer {NOTION_API_KEY}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
        method=method,
    )
    r = urllib.request.urlopen(req)
    return json.loads(r.read())


def extract_text_from_blocks(blocks: list) -> str:
    lines = []
    for b in blocks:
        btype = b["type"]
        content = b.get(btype, {})
        if "rich_text" in content:
            text = "".join(t["plain_text"] for t in content["rich_text"])
            if text.strip():
                prefix = ""
                if btype == "heading_1": prefix = "# "
                elif btype == "heading_2": prefix = "## "
                elif btype == "heading_3": prefix = "### "
                elif btype == "bulleted_list_item": prefix = "• "
                elif btype == "numbered_list_item": prefix = "- "
                lines.append(f"{prefix}{text}")
    return "\n".join(lines)


def fetch_page_content(page_id: str) -> str:
    try:
        data = notion_request(f"https://api.notion.com/v1/blocks/{page_id}/children")
        return extract_text_from_blocks(data.get("results", []))
    except:
        return ""


def fetch_all_manuals() -> list[dict]:
    manuals = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        data = notion_request(
            f"https://api.notion.com/v1/databases/{NOTION_MANUAL_DB_ID}/query",
            method="POST", body=body,
        )
        for page in data.get("results", []):
            props = page["properties"]
            title = ""
            for v in props.values():
                if v["type"] == "title" and v.get("title"):
                    title = v["title"][0]["plain_text"]
                    break
            대분류 = (props.get("대분류", {}).get("select") or {}).get("name", "")
            중분류 = (props.get("중분류", {}).get("select") or {}).get("name", "")
            content = fetch_page_content(page["id"])
            manuals.append({
                "id": page["id"],
                "title": title,
                "대분류": 대분류,
                "중분류": 중분류,
                "content": content,
            })
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return manuals


def search_relevant_manuals(query: str, manuals: list[dict], top_k=5) -> list[dict]:
    query_words = set(query.lower().split())
    scored = []
    for m in manuals:
        text = f"{m['title']} {m['대분류']} {m['중분류']} {m['content']}".lower()
        score = sum(1 for w in query_words if w in text)
        if score > 0:
            scored.append((score, m))
    scored.sort(key=lambda x: -x[0])
    return [m for _, m in scored[:top_k]]


class ChatRequest(BaseModel):
    message: str


class SyncResponse(BaseModel):
    count: int


@router.post("/sync")
def sync_manuals():
    """노션 DB에서 매뉴얼을 읽어 캐시로 저장"""
    manuals = fetch_all_manuals()
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            CREATE TABLE IF NOT EXISTS manual_cache (
                id TEXT PRIMARY KEY,
                title TEXT,
                category1 TEXT,
                category2 TEXT,
                content TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("DELETE FROM manual_cache")
        for m in manuals:
            cur.execute(
                "INSERT INTO manual_cache (id, title, category1, category2, content) VALUES (%s,%s,%s,%s,%s)",
                (m["id"], m["title"], m["대분류"], m["중분류"], m["content"])
            )
        conn.commit()
    return {"count": len(manuals)}


@router.get("/manuals")
def get_manuals():
    """저장된 매뉴얼 목록 반환"""
    with safe_db("fde") as (_, cur):
        try:
            cur.execute("SELECT id, title, category1, category2 FROM manual_cache ORDER BY category1, category2, title")
            rows = cur.fetchall()
            return {"manuals": [dict(r) for r in rows]}
        except:
            return {"manuals": []}


@router.post("/chat")
def chat(req: ChatRequest):
    """매뉴얼 기반 챗봇"""
    with safe_db("fde") as (_, cur):
        try:
            cur.execute("SELECT title, category1, category2, content FROM manual_cache")
            rows = cur.fetchall()
            manuals = [dict(r) for r in rows]
        except:
            manuals = []

    if not manuals:
        return {"reply": "매뉴얼이 아직 동기화되지 않았습니다. 먼저 동기화를 실행해주세요."}

    # 관련 문서 검색
    relevant = search_relevant_manuals(req.message, [
        {"title": m["title"], "대분류": m["category1"], "중분류": m["category2"], "content": m["content"]}
        for m in manuals
    ])

    if not relevant:
        context = "\n\n".join([
            f"[{m['category1']} > {m['category2']}] {m['title']}\n{m['content'][:500]}"
            for m in manuals[:3]
        ])
    else:
        context = "\n\n".join([
            f"[{m['대분류']} > {m['중분류']}] {m['title']}\n{m['content']}"
            for m in relevant
        ])

    system_prompt = """당신은 버핏서울 지점장을 돕는 현장 경영 코치입니다.
제공된 매뉴얼을 참고해 질문자가 지금 당장 실행할 수 있는 행동 지침을 주는 것이 목표입니다.

답변 원칙:
1. 매뉴얼 문장을 그대로 옮기지 마세요. 질문 맥락에 맞게 재해석해 핵심만 전달하세요.
2. 가능하면 "① ② ③" 형태의 단계별 행동으로 답하세요.
3. 주의해야 할 함정이나 자주 틀리는 포인트가 있으면 짧게 짚어주세요.
4. 매뉴얼에 없는 내용은 솔직하게 "매뉴얼에 해당 내용이 없습니다"라고 하세요.
5. 답변 마지막에 참고한 매뉴얼 문서명을 한 줄로 표시하세요.
6. 불필요한 서론 없이 바로 답변으로 시작하세요."""

    body = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": f"[참고 매뉴얼]\n{context}\n\n[질문]\n{req.message}"}
        ]
    }).encode()

    api_req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
    )
    resp = urllib.request.urlopen(api_req)
    result = json.loads(resp.read())
    reply = result["content"][0]["text"]
    return {"reply": reply}
