from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from utils.db import safe_db

router = APIRouter()

BRANCHES = [
    "역삼ARC", "도곡", "신도림", "논현", "판교", "강변",
    "가산", "삼성", "광화문", "한티", "마곡", "판벤타",
    "역삼GFC", "합정",
]

# 전체 체크리스트 템플릿
CHECKLIST_TEMPLATE = [
    # ── Biz ──────────────────────────────────────────────────────────────
    ("Biz", "KRKA", "월 단위 KRKA가 수립되어 있다."),
    ("Biz", "KRKA", "KR은 지점의 핵심 성과와 연결되어 있다."),
    ("Biz", "KRKA", "KA는 KR 달성을 위해 실제 행동으로 이어질 수 있게 구체적이다."),
    ("Biz", "KRKA", "주간 회의를 통해 진행률을 점검한다."),
    ("Biz", "KRKA", "실행 결과에 따라 KA를 수정, 보완한다."),
    ("Biz", "KRKA", "월/분기 회고를 통해 무엇이 유효했고 무엇이 비효율적이었는지 정리한다."),

    ("Biz", "P&L", "GM 이상 관리자는 담당 지점 또는 권역의 P&L 구조를 이해하고 있다."),
    ("Biz", "P&L", "주요 매출 항목과 비용 항목을 구분할 수 있다."),
    ("Biz", "P&L", "손익 변동의 원인을 논리적으로 설명할 수 있다."),
    ("Biz", "P&L", "운영 판단이 손익 관점과 연결된다."),
    ("Biz", "P&L", "관리자가 단순 매출만 보는 것이 아니라, 비용과 수익성을 함께 본다."),
    ("Biz", "P&L", '"왜 이번 달 손익이 이렇게 나왔는지"를 구조적으로 설명할 수 있다.'),

    ("Biz", "예산", "예산 항목과 사용 가능 범위를 알고 있다."),
    ("Biz", "예산", "예산 범위 내에서 지출한다."),
    ("Biz", "예산", "초과가 예상되면 사후 보고가 아니라 사전 공유 및 추경 확보를 진행한다."),
    ("Biz", "예산", "예산 사용 내역이 불명확하지 않다."),

    ("Biz", "노출관리", "지점 주변에서 활용 가능한 비공식 매체가 무엇인지 파악하고 있다."),
    ("Biz", "노출관리", "인근 상권, 제휴 가능 매장, 지역 커뮤니티 등과의 협업 가능성을 탐색하고 있다."),
    ("Biz", "노출관리", "게시 위치, 게시물 내용, 노출 기간이 관리되고 있다."),
    ("Biz", "노출관리", "노후되거나 훼손된 게시물, 오래된 홍보물은 방치하지 않는다."),
    ("Biz", "노출관리", "지점의 브랜드 이미지와 맞지 않는 방식으로 노출하지 않는다."),
    ("Biz", "노출관리", "주변 상권과의 관계를 활용해 지속 가능한 현장 노출 자산을 만든다."),
    ("Biz", "노출관리", "게시 자체가 목적이 아니라 실제 인지와 유입을 만드는 방향으로 관리된다."),
    ("Biz", "노출관리", "현재 운영 중인 공식 매체가 무엇인지 정리돼 있다."),
    ("Biz", "노출관리", "각 매체별 위치, 비용, 계약 기간을 파악하고 있다."),
    ("Biz", "노출관리", "지점 특성과 상권에 맞는 신규 매체를 지속적으로 발굴하고 있다."),
    ("Biz", "노출관리", "운영 중인 매체의 콘텐츠가 최신 상태로 관리되고 있다."),
    ("Biz", "노출관리", "노출 효과가 낮은 매체는 유지 여부를 재검토한다."),
    ("Biz", "노출관리", "공식 채널(블로그, 플레이스 등)에 최신 정보가 반영되어 있다."),
    ("Biz", "노출관리", "최신 게시물 업로드가 일정 주기로 이루어진다."),
    ("Biz", "노출관리", "공지, 프로모션, 이달의 혜택 등 주요 정보가 적시에 노출된다."),
    ("Biz", "노출관리", "'지점명 + 서비스' 검색 시 고객이 필요한 정보에 도달할 수 있다."),
    ("Biz", "노출관리", "블로그 제목과 본문에 핵심 키워드가 반영되어 있다."),
    ("Biz", "노출관리", "예약, 지도, 블로그 등 채널 간 정보가 일치한다."),
    ("Biz", "노출관리", "운영시간, 가격, 문의 방식 등의 정보가 통일되어 있다."),
    ("Biz", "노출관리", "온라인 메시지와 오프라인 메시지가 충돌하지 않는다."),
    ("Biz", "노출관리", "현장 외부 배너, 포스터, 안내물, 광고판의 메시지가 통일되어 있다."),
    ("Biz", "노출관리", "프로모션, 혜택, 서비스 설명이 채널마다 다르게 전달되지 않는다."),
    ("Biz", "노출관리", "각 채널의 메시지가 하나의 지점 전략으로 연결된다."),
    ("Biz", "노출관리", '고객이 어디서 접하든 "같은 브랜드, 같은 지점"이라는 인상을 받는다.'),

    ("Biz", "세일즈", "전 직원이 세일즈 프로세스를 알고 있다."),
    ("Biz", "세일즈", "상담이 실제 프로세스에 맞춰 진행된다."),
    ("Biz", "세일즈", "단계별 스크립트, material, 매뉴얼이 존재한다."),
    ("Biz", "세일즈", "현장에서 이를 실제로 사용한다."),
    ("Biz", "세일즈", "개인 역량 차이가 있어도 최소 기준 이하로 무너지지 않는다."),

    ("Biz", "고객케어(PT)", "워킹톡, 시팅톡이 진행된다."),
    ("Biz", "고객케어(PT)", "내몸변화설계서 등 핵심 안내 자료가 전달된다."),
    ("Biz", "고객케어(PT)", "정규권 미전환 고객에 대한 후속 케어가 있다."),
    ("Biz", "고객케어(PT)", "중간 회차 구간에 별도 케어가 진행된다."),
    ("Biz", "고객케어(PT)", "고객 목표 기반으로 만족도를 점검한다."),
    ("Biz", "고객케어(PT)", "트레이너 만족도를 점검한다."),
    ("Biz", "고객케어(PT)", "불만족 감지 시 교체, 개선 제안 등의 대응 프로세스가 있다."),
    ("Biz", "고객케어(PT)", "만료 전 재등록 가능성에 대한 사전 파악이 이루어진다."),
    ("Biz", "고객케어(PT)", "이탈 고객 히스토리가 문서화되어 있다."),
    ("Biz", "고객케어(PT)", "이탈 고객 재컨택 루틴이 있다."),

    # ── BX ───────────────────────────────────────────────────────────────
    ("BX", "기구", "기구 관리 프로세스가 문서화되어 있다."),
    ("BX", "기구", "고장 대응 매뉴얼이 있다."),
    ("BX", "기구", "수리 방법과 이력을 아카이빙한다."),
    ("BX", "기구", "정기 매인터넌스가 실행된다."),
    ("BX", "기구", "고장 접수 및 처리 히스토리가 정리되어 있다."),

    ("BX", "물", "고장 난 수전, 샤워기 헤드는 3일 내 처리된다."),
    ("BX", "물", "피크타임에 온수 용량 문제가 없다."),
    ("BX", "물", "배수 문제가 없다."),
    ("BX", "물", "설비 이슈가 방치되지 않고 빠르게 처리된다."),

    ("BX", "온습도", "온도는 18~22도 범위에서 관리한다."),
    ("BX", "온습도", "습도는 40~60% 범위에서 관리한다."),
    ("BX", "온습도", "계절, 시간대, 밀집도에 따라 점검, 조정이 이루어진다."),

    ("BX", "친절", "고객 입장 시 즉각적인 인사를 한다."),
    ("BX", "친절", "아이컨택하고 솔 톤으로 인사한다."),
    ("BX", "친절", "바쁜 상황에서도 인사를 놓치지 않는다."),
    ("BX", "친절", "웰컴데스크에서 장시간 고객을 방치하지 않는다."),
    ("BX", "친절", "친절이 특정 직원의 성향이 아니라 지점의 기본 태도로 유지된다."),
    ("BX", "친절", "질문에 친절하고 명확하게 안내한다."),
    ("BX", "친절", "요청 및 특이사항을 기록한다."),
    ("BX", "친절", "VOC, 컴플레인에 대해 후속 조치가 있다."),
    ("BX", "친절", "고객은 같은 질문을 여러 번 반복하지 않아도 된다."),

    ("BX", "어메니티", "운동복, 수건에서 악취가 나지 않는다."),
    ("BX", "어메니티", "운동복, 수건 수량이 부족하지 않다."),
    ("BX", "어메니티", "샤워 어메니티 재고가 관리되며 부족 전에 발주한다."),
    ("BX", "어메니티", "모니터링 시 샤워 어메니티 잔여분 파악하고 교체한다."),

    ("BX", "청결/향", "청결 관리 프로세스가 문서화되어 있다."),
    ("BX", "청결/향", "모니터링 표가 세팅되어 있다."),
    ("BX", "청결/향", "일간/주간 청소 계획과 담당자가 명확하다."),
    ("BX", "청결/향", "워크쓰루 항목이 정의되어 있고 daily로 수행된다."),
    ("BX", "청결/향", "모니터링 표가 실제 작성된다."),
    ("BX", "청결/향", "워크쓰루 점검 기록이 누락되지 않는다."),
    ("BX", "청결/향", "일간 청소가 매일 수행된다."),
    ("BX", "청결/향", "브랜드 점검이 주기적으로 수행된다."),
    ("BX", "청결/향", "루틴에 중복되거나 불필요한 작업이 없다."),
    ("BX", "청결/향", "투입 시간 대비 실제 청결 상태가 양호하다."),
    ("BX", "청결/향", "시간대, 공간별 인력 배치가 적절하다."),
    ("BX", "청결/향", "자주 놓치는 구역을 인지하고 있다."),
    ("BX", "청결/향", "그레이존 책임자가 있다."),
    ("BX", "청결/향", "점검 방식과 관리 방법이 정의돼 있다."),
    ("BX", "청결/향", "입장 후 3초 내 시각·후각적으로 쾌적하다."),
    ("BX", "청결/향", "기구 및 가구 위생 상태가 양호하다."),
    ("BX", "청결/향", "고객 동선에 먼지, 쓰레기, 방치물이 없다."),

    ("BX", "VM", "외부 광고물과 내부 안내물이 최신화되어 있다."),
    ("BX", "VM", "프로모션과 혜택 안내물이 잘 보이게 비치되어 있다."),
    ("BX", "VM", "POSM의 디자인, 문구, 구성이 브랜드 가이드에 맞다."),
    ("BX", "VM", "고객 동선상 자연스럽게 접촉 가능한 위치에 있다."),
    ("BX", "VM", "오래되거나 낡은 자료가 방치되어 있지 않다."),

    ("BX", "음악", "정해진 플레이리스트로만 재생한다."),
    ("BX", "음악", "고객 컴플레인 발생 시 운영지원팀과 협의해 보완한다."),

    # ── HR ───────────────────────────────────────────────────────────────
    ("HR", "크루", "크루의 페르소나가 정의되어 있고, 이를 명확하게 인지하고 있다."),
    ("HR", "크루", "직수별 필요 역할에 맞는 채용 기준이 구분되어 있다."),
    ("HR", "크루", "면접 시 확인해야 할 질문과 판단 포인트가 있다."),
    ("HR", "크루", "급한 공백을 이유로 기준 이하 채용을 하지 않는다."),
    ("HR", "크루", "근태, 태도, 업무 누락, 책임 회피 등 주요 이슈 항목이 정의돼 있다."),
    ("HR", "크루", "반복 이슈에 대해 구두 피드백 → 경고 → 후속 판단의 흐름이 있다."),
    ("HR", "크루", "감정적으로 대응하지 않고 기록 기반으로 판단한다."),
    ("HR", "크루", "개선 기회를 줄 것인지, 종료를 검토할 것인지 기준이 있다."),
    ("HR", "크루", "문제를 오래 참고 방치하다가 갑자기 정리하지 않는다."),
    ("HR", "크루", "크루의 기본 역할과 금지 사항이 명확하다."),
    ("HR", "크루", "오픈/미들/마감 등 시간대별 핵심 업무가 정리되어 있다."),
    ("HR", "크루", "누가 근무하더라도 기본적인 공간 상태와 고객 응대 품질이 크게 흔들리지 않는다."),

    ("HR", "트레이너", "지점이 함께하고자 하는 트레이너의 페르소나가 정의돼 있다."),
    ("HR", "트레이너", "경력, 전문성, 수업 품질뿐 아니라 고객 응대 태도, 협업 태도, 커뮤니케이션 성향을 함께 본다."),
    ("HR", "트레이너", "단순히 운동을 잘 가르치는 사람보다 운영 방향과 맞는 사람을 우선한다."),
    ("HR", "트레이너", "트레이너의 기본 품질이 우연이 아니라 선별 기준에서 시작된다."),
    ("HR", "트레이너", "고객 불만, 태도 이슈, 협업 이슈, 운영 혼선 등 주요 판단 항목이 정의돼 있다."),
    ("HR", "트레이너", "문제 발생 시 즉흥적으로 반응하지 않고 사실관계를 확인한다."),
    ("HR", "트레이너", "구두 안내, 경고, 협업 재검토 등 단계적 판단 흐름이 있다."),
    ("HR", "트레이너", "반복 이슈가 발생할 경우 신규 회원 배정 조정, 협업 범위 조정 등의 프로세스가 있다."),
    ("HR", "트레이너", "종료 판단 기준이 명확하다."),
    ("HR", "트레이너", "종료 확정 시 신규 회원 배정 중단 기준이 있다."),
    ("HR", "트레이너", "기존 회원 인수인계와 고객 이탈 최소화 방안이 있다."),
    ("HR", "트레이너", "고객에게 필요한 안내와 내부 공유가 정리돼 있다."),
    ("HR", "트레이너", "종료 과정에서 불필요한 갈등과 리스크를 최소화한다."),
    ("HR", "트레이너", "종료 판단이 늦어져 더 큰 운영 리스크를 만들지 않는다."),
    ("HR", "트레이너", "종료 이후에도 지점의 고객 경험과 운영 품질이 무너지지 않는다."),

    ("HR", "CM", "CM의 핵심 역할(세일즈, 고객 응대, account 관리, 현장 커뮤니케이션)이 명확하다."),
    ("HR", "CM", "세일즈 프로세스 및 운영 기준을 이해하고 실행한다."),
    ("HR", "CM", "일/주/월 단위로 성과와 태도를 함께 점검한다."),
    ("HR", "CM", "부족한 CM에 대해서는 구체적인 피드백과 보완 액션이 있다."),
    ("HR", "CM", "성장 가능한 CM에 대해서는 다음 역할(GM/ADM 등)로 이어질 수 있는 육성 관점이 있다."),
    ("HR", "CM", "CM이 단순 응대자가 아니라 지점 운영의 핵심 포지션으로 기능한다."),

    ("HR", "평가/피드백", "성과와 태도를 구분해서 본다."),
    ("HR", "평가/피드백", "관찰 기반으로 피드백한다."),
    ("HR", "평가/피드백", "구체적인 개선 요구와 기대 수준이 명확하다."),
    ("HR", "평가/피드백", "피드백 이후 추적이 있다."),
    ("HR", "평가/피드백", "반복 이슈에 대해서는 공식 경고 또는 후속 조치 기준이 있다."),
    ("HR", "평가/피드백", "피드백이 말로 끝나지 않고 행동 변화로 이어지도록 관리된다."),
    ("HR", "평가/피드백", "잘하는 사람은 인정받고, 부족한 사람은 명확한 개선 요청을 받는다."),
    ("HR", "평가/피드백", "조직 내 기준이 사람마다 다르게 적용되지 않는다."),

    # ── Operation ────────────────────────────────────────────────────────
    ("Operation", "퓨얼바", "판매 상품의 운영 기준과 진열 기준이 있다."),
    ("Operation", "퓨얼바", "재고를 파악하고 부족 전에 발주 또는 보충한다."),
    ("Operation", "퓨얼바", "유통기한, 보관 상태, 위생 상태를 점검한다."),
    ("Operation", "퓨얼바", "품절, 방치, 오진열 상태가 반복되지 않는다."),
    ("Operation", "퓨얼바", "고객 응대 및 결제 흐름이 매끄럽다."),

    ("Operation", "안전", "기본 안전 점검 항목이 정의되어 있다."),
    ("Operation", "안전", "위험 요소 발견 시 즉시 조치 및 공유 기준이 있다."),
    ("Operation", "안전", "사고/부상/시설 이상 발생 시 대응 프로세스가 있다."),
    ("Operation", "안전", "직원들이 기본 안전 대응 기준을 알고 있다."),
    ("Operation", "안전", "반복되는 위험 구간과 이슈가 관리되고 있다."),
    ("Operation", "안전", "안전이 특정인의 민감도에만 달려 있지 않다."),
    ("Operation", "안전", "작은 위험 신호도 방치하지 않는다."),
    ("Operation", "안전", "고객과 직원 모두에게 기본적인 안전 신뢰를 준다."),

    ("Operation", "업무관리", "반복 업무와 비반복 업무가 구분되어 있다."),
    ("Operation", "업무관리", "일간/주간/월간 단위 업무가 정리되어 있다."),
    ("Operation", "업무관리", "담당자와 완료 기준이 명확하다."),
    ("Operation", "업무관리", "인수인계와 공유 방식이 정리되어 있다."),
    ("Operation", "업무관리", "긴급 이슈와 일반 업무의 우선순위 판단 기준이 있다."),

    ("Operation", "이슈대응/보고", "어떤 이슈를 누구에게 공유해야 하는지 기준이 있다."),
    ("Operation", "이슈대응/보고", "고객 이슈, 시설 이슈, 인력 이슈, 안전 이슈를 구분해 대응한다."),
    ("Operation", "이슈대응/보고", "구두 공유로 끝나지 않고 필요한 경우 기록이 남는다."),
    ("Operation", "이슈대응/보고", "해결 여부와 후속 조치가 추적된다."),
    ("Operation", "이슈대응/보고", "경미한 이슈와 중대한 이슈를 구분해 대응할 수 있다."),
    ("Operation", "이슈대응/보고", "보고가 책임 회피용이 아니라 해결 중심으로 이루어진다."),
    ("Operation", "이슈대응/보고", "같은 문제가 반복되어도 축적된 대응 기준이 생긴다."),
]

CATEGORY_ORDER = ["Biz", "BX", "HR", "Operation"]


# ── 헬퍼 ──────────────────────────────────────────────────────────────────

def _category_stats(items: list[dict]) -> dict:
    stats: dict[str, dict] = {}
    for item in items:
        cat = item["category"]
        if cat not in stats:
            stats[cat] = {"total": 0, "checked": 0}
        stats[cat]["total"] += 1
        if item["checked"]:
            stats[cat]["checked"] += 1
    return stats


# ── 모델 ──────────────────────────────────────────────────────────────────

class ItemPatch(BaseModel):
    id: int
    checked: bool
    link: Optional[str] = ""
    note: Optional[str] = ""
    담당자: Optional[str] = ""
    개선예정일: Optional[str] = ""

class ItemsBatchPatch(BaseModel):
    items: list[ItemPatch]

class AchieveBody(BaseModel):
    achieved: bool

class StartBody(BaseModel):
    created_by: Optional[str] = None


# ── 엔드포인트 ────────────────────────────────────────────────────────────

@router.get("/branches")
def get_branches():
    return {"branches": BRANCHES}


@router.get("/summary")
def get_summary():
    """전체 지점 최신 진단 요약"""
    with safe_db("fde") as (_, cur):
        cur.execute("""
            SELECT DISTINCT ON (branch_name)
                id, branch_name, diagnosed_at, achieved,
                (SELECT COUNT(*) FROM diagnosis_items WHERE diagnosis_id = bd.id) AS total,
                (SELECT COUNT(*) FROM diagnosis_items WHERE diagnosis_id = bd.id AND checked = TRUE) AS checked_count
            FROM branch_diagnosis bd
            ORDER BY branch_name, diagnosed_at DESC, id DESC
        """)
        rows = cur.fetchall()

    by_branch = {r["branch_name"]: dict(r) for r in rows}

    result = []
    for b in BRANCHES:
        if b in by_branch:
            r = by_branch[b]
            result.append({
                "branch_name": b,
                "has_diagnosis": True,
                "diagnosis_id": r["id"],
                "diagnosed_at": str(r["diagnosed_at"]),
                "achieved": r["achieved"],
                "total": r["total"],
                "checked_count": r["checked_count"],
                "rate": round(r["checked_count"] / r["total"] * 100) if r["total"] else 0,
            })
        else:
            result.append({
                "branch_name": b,
                "has_diagnosis": False,
                "diagnosis_id": None,
                "diagnosed_at": None,
                "achieved": False,
                "total": len(CHECKLIST_TEMPLATE),
                "checked_count": 0,
                "rate": 0,
            })

    return {"summary": result}


@router.get("/{branch}/latest")
def get_latest(branch: str):
    """지점 최신 진단 항목 전체"""
    if branch not in BRANCHES:
        raise HTTPException(404, "지점을 찾을 수 없습니다.")
    with safe_db("fde") as (_, cur):
        cur.execute("""
            SELECT id, diagnosed_at, achieved, note, created_by
            FROM branch_diagnosis
            WHERE branch_name = %s
            ORDER BY diagnosed_at DESC, id DESC
            LIMIT 1
        """, (branch,))
        diag = cur.fetchone()
        if not diag:
            return {"diagnosis": None, "items": []}

        cur.execute("""
            SELECT id, category, sub_category, item_text, sort_order, checked, link, note, 담당자, 개선예정일
            FROM diagnosis_items
            WHERE diagnosis_id = %s
            ORDER BY sort_order
        """, (diag["id"],))
        items = [dict(r) for r in cur.fetchall()]

    return {"diagnosis": dict(diag), "items": items}


@router.post("/{branch}/start")
def start_diagnosis(branch: str, body: StartBody):
    """새 진단 시작 — 템플릿 항목 자동 생성"""
    if branch not in BRANCHES:
        raise HTTPException(404, "지점을 찾을 수 없습니다.")
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            INSERT INTO branch_diagnosis (branch_name, created_by)
            VALUES (%s, %s) RETURNING id
        """, (branch, body.created_by))
        diag_id = cur.fetchone()["id"]

        for i, (cat, sub, text) in enumerate(CHECKLIST_TEMPLATE):
            cur.execute("""
                INSERT INTO diagnosis_items
                    (diagnosis_id, category, sub_category, item_text, sort_order)
                VALUES (%s, %s, %s, %s, %s)
            """, (diag_id, cat, sub, text, i))

    return {"diagnosis_id": diag_id, "total": len(CHECKLIST_TEMPLATE)}


@router.patch("/{diagnosis_id}/items")
def patch_items(diagnosis_id: int, body: ItemsBatchPatch):
    """항목 일괄 저장"""
    with safe_db("fde") as (_, cur):
        cur.execute("SELECT id FROM branch_diagnosis WHERE id = %s", (diagnosis_id,))
        if not cur.fetchone():
            raise HTTPException(404, "진단을 찾을 수 없습니다.")
        for item in body.items:
            cur.execute("""
                UPDATE diagnosis_items
                SET checked = %s, link = %s, note = %s, 담당자 = %s, 개선예정일 = %s
                WHERE id = %s AND diagnosis_id = %s
            """, (item.checked, item.link or "", item.note or "", item.담당자 or "", item.개선예정일 or "", item.id, diagnosis_id))
    return {"ok": True}


@router.get("/{branch}/previous")
def get_previous(branch: str):
    """이전 진단 항목 (최신 제외 두 번째) — 비교용"""
    if branch not in BRANCHES:
        raise HTTPException(404, "지점을 찾을 수 없습니다.")
    with safe_db("fde") as (_, cur):
        cur.execute("""
            SELECT id FROM branch_diagnosis
            WHERE branch_name = %s
            ORDER BY diagnosed_at DESC, id DESC
            LIMIT 2
        """, (branch,))
        rows = cur.fetchall()
        if len(rows) < 2:
            return {"items": []}
        prev_id = rows[1]["id"]
        cur.execute("""
            SELECT item_text, checked FROM diagnosis_items
            WHERE diagnosis_id = %s
        """, (prev_id,))
        return {"items": [dict(r) for r in cur.fetchall()]}


@router.patch("/{diagnosis_id}/achieve")
def patch_achieve(diagnosis_id: int, body: AchieveBody):
    """80점 달성 여부 확정"""
    with safe_db("fde") as (_, cur):
        cur.execute("""
            UPDATE branch_diagnosis
            SET achieved = %s, diagnosed_at = CURRENT_DATE
            WHERE id = %s
        """, (body.achieved, diagnosis_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "진단을 찾을 수 없습니다.")
    return {"ok": True}
