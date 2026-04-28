import os
import re
import json
import math
import urllib.request
from collections import Counter
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


_STOPWORDS = {
    '이', '가', '을', '를', '은', '는', '에', '의', '로', '과', '와', '도',
    '에서', '으로', '에게', '하고', '이나', '랑', '까지', '부터', '만',
    '하다', '있다', '없다', '되다', '것', '수', '때', '중', '및', '또는',
    '그리고', '하지만', '그래서', '따라서', '즉', '또한', '만약', '위해',
    '통해', '대한', '관한', '위한', '대해', '관련', '경우', '방법', '내용',
}


def _tokenize(text: str) -> list[str]:
    """한국어 바이그램 + 단어 토크나이저 (외부 의존성 없음)"""
    text = re.sub(r'[^\w가-힣]', ' ', text.lower())
    words = [w for w in text.split() if w not in _STOPWORDS and len(w) > 1]
    tokens = list(words)
    for word in words:
        for i in range(len(word) - 1):
            tokens.append(word[i:i + 2])
    return tokens


def _doc_weighted_text(m: dict) -> str:
    """제목 3×, 분류 2×, 본문 1× 비율로 필드 부스팅"""
    title = m.get('title', '')
    c1 = m.get('대분류', '')
    c2 = m.get('중분류', '')
    content = m.get('content', '')
    return f"{title} {title} {title} {c1} {c1} {c2} {c2} {content}"


def search_relevant_manuals(query: str, manuals: list[dict], top_k=5) -> list[dict]:
    """BM25 + 한국어 바이그램 검색"""
    if not manuals:
        return []

    query_tokens = set(_tokenize(query))
    if not query_tokens:
        return manuals[:top_k]

    # 문서별 토큰 목록 캐시
    doc_tokens = [_tokenize(_doc_weighted_text(m)) for m in manuals]

    N = len(manuals)
    avg_dl = sum(len(t) for t in doc_tokens) / N

    # IDF: 각 쿼리 토큰이 몇 개 문서에 등장하는지
    df: Counter = Counter()
    for tokens in doc_tokens:
        for t in set(tokens):
            df[t] += 1

    k1, b = 1.5, 0.75
    scored = []
    for m, tokens in zip(manuals, doc_tokens):
        tf = Counter(tokens)
        dl = len(tokens)
        score = 0.0
        for t in query_tokens:
            if df[t] == 0:
                continue
            idf = math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1)
            tf_val = tf.get(t, 0)
            tf_norm = tf_val * (k1 + 1) / (tf_val + k1 * (1 - b + b * dl / avg_dl))
            score += idf * tf_norm
        if score > 0:
            scored.append((score, m))

    scored.sort(key=lambda x: -x[0])
    return [m for _, m in scored[:top_k]]


class ChatMessage(BaseModel):
    role: str     # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class SyncResponse(BaseModel):
    count: int


def _rewrite_query(message: str, history: list[ChatMessage], api_key: str) -> str:
    """Haiku로 대화 맥락을 반영해 BM25 검색 키워드 추출"""
    context = "\n".join(
        f"{h.role}: {h.content[:150]}" for h in history[-4:]
    )
    user_content = (
        f"대화 맥락:\n{context}\n\n현재 질문: {message}"
        if context else f"질문: {message}"
    )
    body = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 80,
        "system": (
            "주어진 질문과 대화 맥락을 분석해 매뉴얼 검색에 쓸 핵심 키워드를 "
            "공백으로 구분해 5개 이내로만 출력하세요. 키워드 외 다른 말은 하지 마세요."
        ),
        "messages": [{"role": "user", "content": user_content}],
    }).encode()
    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        resp = urllib.request.urlopen(req, timeout=5)
        return json.loads(resp.read())["content"][0]["text"].strip()
    except Exception:
        return message  # 실패 시 원본 질문으로 폴백


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

    # ③ 질문 의도 재작성 → BM25 검색 품질 향상
    search_query = (
        _rewrite_query(req.message, req.history, ANTHROPIC_API_KEY)
        if ANTHROPIC_API_KEY else req.message
    )
    relevant = search_relevant_manuals(search_query, [
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

    system_prompt = """당신은 버핏서울 지점 운영을 10년 넘게 해온 베테랑 경영 코치입니다.
후배 지점장이 물어보면 매뉴얼을 보고 직접 설명해주듯 자연스럽게 대화하세요.

절대 하면 안 되는 것:
- 매뉴얼 문장을 그대로 복사하거나 인용하지 마세요
- "매뉴얼에 따르면", "문서에 명시된" 같은 표현을 쓰지 마세요
- 목차나 항목 나열식으로 답하지 마세요

반드시 지킬 것:
- 후배에게 설명하듯 구어체로 자연스럽게 답하세요
- 핵심 행동 순서가 있으면 "먼저 ~ 하고, 그 다음엔 ~ 해" 식으로 흐름을 이어서 말하세요
- 실수하기 쉬운 포인트가 있으면 "이거 주의해야 해" 식으로 짚어주세요
- 매뉴얼에 없는 내용이면 "그건 매뉴얼에 없는데" 라고 솔직하게 말하세요
- 답변 끝에 "(참고: 문서명)" 형태로 출처 한 줄만 표시하세요
- 서론 없이 바로 본론부터 시작하세요"""

    # ④ 멀티턴: 최근 3턴(6메시지) 히스토리 포함
    claude_messages = [
        {"role": h.role, "content": h.content}
        for h in req.history[-6:]
    ]
    claude_messages.append({
        "role": "user",
        "content": f"[참고 매뉴얼]\n{context}\n\n[질문]\n{req.message}",
    })

    body = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": claude_messages,
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
