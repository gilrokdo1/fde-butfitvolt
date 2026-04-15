import csv
import io
import re
from datetime import date, datetime
from fastapi import APIRouter, Query, HTTPException, UploadFile, File
from utils.db import safe_db

router = APIRouter()

# ── 모두싸인 CSV 컬럼명 (실제 추출 파일 기준) ─────────────────────
_COL_DOCID    = '문서ID'
_COL_TITLE    = '문서 제목'
_COL_STATUS   = '문서 상태'
_COL_ORDER    = '서명 순서'      # 1=코치, 2=버핏서울 → 1만 처리
_COL_NAME     = '서명자 이름'
_COL_CONTACT  = '서명자 연락처'
_COL_REQDATE  = '서명 요청 시각'
_COL_ACTDATE  = '마지막 활동 시각'

# 갱신 대상 계약 제목 키워드
_CONTRACT_KEYWORD = '프리랜서 코치 계약'


def _pick(row: dict, col: str) -> str | None:
    v = row.get(col, '')
    return str(v).strip() or None


def _parse_korean_date(val: str | None) -> date | None:
    """'2026년 3월 19일 오후 5:25' → date(2026, 3, 19)"""
    if not val:
        return None
    val = val.strip()
    # 표준 형식 먼저 시도
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d'):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            pass
    # 한국어 형식: "YYYY년 M월 D일 오전/오후 H:MM"
    m = re.match(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', val)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    return None


def _normalize_status(raw: str | None) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    mapping = {
        '완료': '완료', '서명 완료': '완료', '서명완료': '완료',
        '서명 대기': '서명 대기', '대기': '서명 대기', '서명대기': '서명 대기',
        '만료': '만료', '기한 초과': '만료', '기한초과': '만료',
        '거절': '거절', '반려': '거절',
    }
    return mapping.get(raw, raw)


@router.get("/members")
def get_members(
    place: str = Query("all"),
    status: str = Query("all"),
    category: str = Query("all"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    offset = (page - 1) * limit

    conditions = ["place_id NOT IN (3,4,5,6,7,8,12,23)"]
    params: list = []

    if place != "all":
        conditions.append("place = %s")
        params.append(place)

    if status != "all":
        conditions.append("이용상태 = %s")
        params.append(status)

    if category != "all":
        conditions.append("category_depth2 = %s")
        params.append(category)

    where = " AND ".join(conditions)

    try:
        with safe_db("replica") as (conn, cur):
            # 전체 수
            cur.execute(f"SELECT COUNT(*) FROM raw_data_mbs WHERE {where}", params)
            total = cur.fetchone()["count"]

            # 요약 카드
            cur.execute(
                f"""
                SELECT
                    COUNT(*) FILTER (WHERE 이용상태 = '이용중') AS active_count,
                    COUNT(*) FILTER (WHERE 이용상태 IN ('만료','완료') AND 멤버십종료일 >= CURRENT_DATE - INTERVAL '30 days') AS recently_expired,
                    COUNT(*) FILTER (WHERE 이용상태 = '환불') AS refund_count
                FROM raw_data_mbs WHERE {where}
                """,
                params,
            )
            summary_row = dict(cur.fetchone())
            summary_row["total"] = total

            # 데이터
            cur.execute(
                f"""
                SELECT
                    회원이름,
                    연락처,
                    place          AS 지점,
                    category_depth2 AS 카테고리대분류,
                    category_name  AS 카테고리,
                    멤버십명       AS 상품명,
                    payment_amount AS 가격,
                    멤버십시작일   AS 시작일,
                    멤버십종료일   AS 종료일,
                    이용상태,
                    체험정규,
                    ses_count      AS 출석수,
                    payment_status AS 결제상태
                FROM raw_data_mbs
                WHERE {where}
                ORDER BY 멤버십시작일 DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            members = [dict(r) for r in cur.fetchall()]

        # 지점 목록
        with safe_db("replica") as (conn, cur):
            cur.execute(
                """
                SELECT DISTINCT place FROM raw_data_mbs
                WHERE place IS NOT NULL
                  AND place_id NOT IN (3,4,5,6,7,8,12,23)
                ORDER BY place
                """
            )
            places = [r["place"] for r in cur.fetchall() if r["place"]]

        # 카테고리 목록
        with safe_db("replica") as (conn, cur):
            cur.execute(
                """
                SELECT DISTINCT category_depth2 FROM raw_data_mbs
                WHERE category_depth2 IS NOT NULL
                  AND place_id NOT IN (3,4,5,6,7,8,12,23)
                ORDER BY category_depth2
                """
            )
            categories = [r["category_depth2"] for r in cur.fetchall() if r["category_depth2"]]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 오류: {str(e)}")

    return {
        "members": members,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": summary_row,
        "places": places,
        "categories": categories,
    }


# ── 계약 추적 ─────────────────────────────────────────────────

@router.post("/contracts/upload")
async def upload_contracts(file: UploadFile = File(...)):
    """모두싸인 CSV를 업로드하면 FDE DB에 통째로 교체 저장한다."""
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="CSV 파일만 업로드 가능합니다.")

    raw_bytes = await file.read()
    # BOM 제거 후 디코딩 (UTF-8-SIG → 한글 CSV 대응)
    try:
        text = raw_bytes.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw_bytes.decode('cp949', errors='replace')

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV에 데이터가 없습니다.")

    records = []
    for row in rows:
        # 1) '[TB지점] 프리랜서 코치 계약' 문서만 처리
        title = _pick(row, _COL_TITLE) or ''
        if _CONTRACT_KEYWORD not in title:
            continue
        # 2) 코치 서명자 행만 처리 (서명 순서=1), 버핏서울 행 제외
        order = _pick(row, _COL_ORDER) or ''
        if order != '1':
            continue

        name = _pick(row, _COL_NAME)
        if not name:
            continue

        records.append((
            _pick(row, _COL_DOCID),
            title,
            name,
            _pick(row, _COL_CONTACT),
            None,   # 이메일 없음
            _parse_korean_date(_pick(row, _COL_REQDATE)),
            _parse_korean_date(_pick(row, _COL_ACTDATE)),  # 마지막 활동 = 서명일 근사값
            None,   # 별도 만료일 없음
            _normalize_status(_pick(row, _COL_STATUS)),
        ))

    if not records:
        raise HTTPException(
            status_code=400,
            detail=f"'{_CONTRACT_KEYWORD}' 계약이 없거나 CSV 형식이 다릅니다. "
                   f"모두싸인 기본추출 CSV를 확인해 주세요."
        )

    now = datetime.now()
    try:
        with safe_db("fde") as (conn, cur):
            cur.execute("DELETE FROM parkmingyu_contracts")
            cur.executemany(
                """INSERT INTO parkmingyu_contracts
                   (doc_number, doc_title, signer_name, signer_contact, signer_email,
                    request_date, sign_date, expiry_date, status, uploaded_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [r + (now,) for r in records],
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 저장 오류: {str(e)}")

    return {"inserted": len(records), "uploaded_at": now.isoformat()}


@router.get("/contracts")
def get_contracts(
    status_filter: str = Query("all"),
    search: str = Query(""),
):
    """계약 목록 조회. computed_status 포함."""
    try:
        with safe_db("fde") as (conn, cur):
            # 업로드 일시
            cur.execute("SELECT MAX(uploaded_at) AS last_upload FROM parkmingyu_contracts")
            uploaded_at_row = cur.fetchone()
            uploaded_at = uploaded_at_row["last_upload"].isoformat() if uploaded_at_row["last_upload"] else None

            # computed_status CASE
            status_case = """
                CASE
                  WHEN status IN ('서명 대기', '거절') THEN '미서명'
                  WHEN status = '만료'                 THEN '기한초과'
                  WHEN status = '완료'
                       AND sign_date <= CURRENT_DATE - INTERVAL '80 days' THEN '갱신필요'
                  WHEN status = '완료'                 THEN '완료'
                  ELSE COALESCE(status, '알수없음')
                END
            """

            # 요약 (필터 없이 전체)
            cur.execute(f"""
                SELECT
                  COUNT(*) FILTER (WHERE {status_case} = '미서명')   AS 미서명,
                  COUNT(*) FILTER (WHERE {status_case} = '갱신필요') AS 갱신필요,
                  COUNT(*) FILTER (WHERE {status_case} = '기한초과') AS 기한초과,
                  COUNT(*) FILTER (WHERE {status_case} = '완료')     AS 완료,
                  COUNT(*)                                             AS total
                FROM parkmingyu_contracts
            """)
            summary = dict(cur.fetchone())

            # 목록 (필터 + 검색)
            conditions = []
            params: list = []

            if status_filter != "all":
                conditions.append(f"({status_case}) = %s")
                params.append(status_filter)

            if search:
                conditions.append("(signer_name ILIKE %s OR signer_contact ILIKE %s)")
                params += [f"%{search}%", f"%{search}%"]

            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

            cur.execute(f"""
                SELECT
                  id,
                  doc_number,
                  doc_title,
                  signer_name,
                  signer_contact,
                  signer_email,
                  request_date,
                  sign_date,
                  expiry_date,
                  status,
                  ({status_case}) AS computed_status,
                  uploaded_at
                FROM parkmingyu_contracts
                {where}
                ORDER BY
                  CASE ({status_case})
                    WHEN '미서명'  THEN 1
                    WHEN '갱신필요' THEN 2
                    WHEN '기한초과' THEN 3
                    ELSE 4
                  END,
                  request_date DESC NULLS LAST
            """, params)
            contracts = [dict(r) for r in cur.fetchall()]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 오류: {str(e)}")

    # date 직렬화
    for c in contracts:
        for key in ('request_date', 'sign_date', 'expiry_date'):
            if c[key] and hasattr(c[key], 'isoformat'):
                c[key] = c[key].isoformat()
        if c['uploaded_at'] and hasattr(c['uploaded_at'], 'isoformat'):
            c['uploaded_at'] = c['uploaded_at'].isoformat()

    return {"contracts": contracts, "summary": summary, "uploaded_at": uploaded_at}
