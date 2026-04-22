import { api } from './client';

// 방문 트래킹
export function recordVisit(pagePath: string) {
  return api.post('/fde-api/tracking/visit', { page_path: pagePath }).catch(() => {
    // 트래킹 실패가 UX를 막으면 안 됨
  });
}

// 방문 통계
export function getVisitStats() {
  return api.get<{ stats: VisitStat[] }>('/fde-api/tracking/stats');
}

// 랭킹
export function getRanking() {
  return api.get<{ ranking: MemberRanking[] }>('/fde-api/ranking');
}

export function getMemberDetail(memberName: string) {
  return api.get<MemberDetail>(`/fde-api/ranking/${encodeURIComponent(memberName)}`);
}

// 일별 점수 (각 멤버의 날짜별 평균)
export function getDailyScores() {
  return api.get<{ today: string; daily_scores: DailyScoreEntry[] }>('/fde-api/ranking/daily-scores');
}

export interface DailyScoreEntry {
  member_name: string;
  date: string; // YYYY-MM-DD
  avg_score: number | null;
}

// GitHub 지표
export function getGithubStats() {
  return api.get<{ stats: GithubStat[] }>('/fde-api/github/stats');
}

// GitHub 커밋 목록
export function getCommits() {
  return api.get<{ commits: CommitEntry[] }>('/fde-api/github/commits');
}

// 타입
export interface VisitStat {
  page_path: string;
  visit_count: number;
  unique_visitors: number;
}

export interface MemberRanking {
  rank: number;
  member_name: string;
  github_username: string | null;
  problem_score: number;
  score_reason: string;
  github_stats: Record<string, unknown>;
  visit_count: number;
  evaluated_at: string | null;
  updated_at: string;
}

export interface ScoreHistoryEntry {
  problem_score: number;
  score_reason: string;
  evaluated_at: string;
}

export interface MemberDetail {
  member: MemberRanking;
  history: ScoreHistoryEntry[];
  visits: { total: number; unique_visitors: number };
}

// 멤버십 이상케이스
export function getAnomalies(params?: { status?: string; anomaly_type?: string }) {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return api.get<AnomalyListResponse>(`/fde-api/soyeon/anomalies${q ? `?${q}` : ''}`);
}

export function resolveAnomaly(id: number) {
  return api.post(`/fde-api/soyeon/anomalies/${id}/resolve`);
}

export function triggerDetect() {
  return api.post<{ case_a: number; case_b: number; inserted: number; auto_resolved: number }>(
    '/fde-api/soyeon/anomalies/detect',
  );
}

export interface Anomaly {
  id: number;
  anomaly_type: 'no_fitness' | 'teamfit_overlap';
  user_id: number;
  phone_number: string;
  place: string;
  user_name: string | null;
  teamfit_mbs_id: number;
  teamfit_mbs_name: string | null;
  teamfit_begin: string;
  teamfit_end: string;
  overlap_mbs_id: number | null;
  overlap_begin: string | null;
  overlap_end: string | null;
  status: 'pending' | 'resolved';
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface AnomalyListResponse {
  total: number;
  pending: number;
  resolved: number;
  data: Anomaly[];
  place_order: string[];
}

// 팀버핏 유효회원
export function getTeamfitActive(date?: string) {
  const params = date ? `?target_date=${date}` : '';
  return api.get<TeamfitActiveResponse>(`/fde-api/soyeon/teamfit-active${params}`);
}

export interface TeamfitActiveRow {
  지점: string;
  유효회원수: number;
}

export interface TeamfitMember {
  지점: string;
  이름: string;
  연락처: string;
  멤버십명: string;
  성별: string;
  나이: number | null;
  시작일: string;
  종료일: string;
  결제금액: number | null;
  결제일: string | null;
  임직원여부: string;
  마케팅동의: string;
}

export interface TeamfitMembersResponse {
  date: string;
  place: string | null;
  count: number;
  members: TeamfitMember[];
}

export function getTeamfitMembers(place: string, date?: string) {
  const params = new URLSearchParams({ place });
  if (date) params.set('target_date', date);
  return api.get<TeamfitMembersResponse>(`/fde-api/soyeon/teamfit-members?${params}`);
}

export interface TeamfitActiveResponse {
  date: string;
  data: TeamfitActiveRow[];
  total: number;
}

export interface CommitEntry {
  sha: string;
  message: string;
  author_login: string | null;
  member_name: string | null;
  date: string;
}

export interface GithubStat {
  member_name: string;
  github_username: string | null;
  pr_count: number;
  commit_count: number;
  prs: { title: string; number: number; state: string; created_at: string }[];
}

// 박민규 — 계약 추적
export type ContractComputedStatus = '미서명' | '갱신필요' | '기한초과' | '완료' | '알수없음';

export interface Contract {
  id: number;
  doc_number: string | null;
  doc_title: string | null;
  signer_name: string;
  signer_contact: string | null;
  signer_email: string | null;
  request_date: string | null;
  sign_date: string | null;
  expiry_date: string | null;
  status: string | null;
  computed_status: ContractComputedStatus;
  uploaded_at: string;
}

export interface ContractSummary {
  미서명: number;
  갱신필요: number;
  기한초과: number;
  완료: number;
  total: number;
}

export interface ContractsResponse {
  contracts: Contract[];
  summary: ContractSummary;
  uploaded_at: string | null;
}

export function getContracts(statusFilter = 'all', search = '') {
  return api.get<ContractsResponse>(
    `/fde-api/parkmingyu/contracts?status_filter=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}`
  );
}

export function uploadContracts(file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post<{ inserted: number; uploaded_at: string }>(
    '/fde-api/parkmingyu/contracts/upload',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
}

// =============================================
// 김동하 실적분석 API
// =============================================

export interface SalesMeta {
  snapshot_date: string | null;
  target_month: string;
  row_count?: number;
}

export interface SalesOverview {
  data: {
    revenue: { ft: number; pt: number; total: number; target: number; rate: number };
    bs1: { count: number; target: number; rate: number };
    rereg: { targets: number; paid: number; pre_paid: number; rate: number };
    churn: { total: number; churn: number; rate: number };
  } | null;
  _meta: SalesMeta;
}

export interface RevenueRow {
  branch: string;
  ft: number; ft_target: number; ft_rate: number;
  pt: number; pt_target: number; pt_rate: number;
  total: number; target: number; total_rate: number;
}

export interface FtNewRow {
  branch: string;
  bs1_count: number; bs1_revenue: number;
  prev_month_same_period: number; prev_year_same_period: number;
  prev_month_full: number; prev_year_full: number;
  target_count: number; target_revenue: number;
}

export interface PtTrialRow {
  branch: string;
  trial_count: number; trial_revenue: number;
  solo_count: number; combo_count: number;
  conversion_target: number; conversion_count: number;
  conversion_revenue: number;
  target_trial: number; target_conversion: number;
}

export interface ReregRow {
  branch: string; category: string; period_type: string;
  target_count: number; pre_paid_count: number; paid_count: number;
  rereg_rate: number; target_rate: number;
}

export interface SubscriptionRow {
  branch: string;
  total_count: number; maintain_count: number; return_count: number;
  term_convert_count: number; churn_count: number;
  pending_cancel_count: number; undecided_count: number;
  churn_rate: number;
}

function donghaSalesParams(month?: string, date?: string) {
  const p: Record<string, string> = {};
  if (month) p.month = month;
  if (date) p.date = date;
  return { params: p };
}

export function getDonghaSalesOverview(month?: string, date?: string) {
  return api.get<SalesOverview>('/fde-api/dongha/sales/overview', donghaSalesParams(month, date));
}

export function getDonghaSalesRevenue(month?: string, date?: string) {
  return api.get<{ data: RevenueRow[]; _meta: SalesMeta }>('/fde-api/dongha/sales/revenue', donghaSalesParams(month, date));
}

export function getDonghaSalesFtNew(month?: string, date?: string) {
  return api.get<{ data: FtNewRow[]; _meta: SalesMeta }>('/fde-api/dongha/sales/ft-new', donghaSalesParams(month, date));
}

export function getDonghaSalesPtTrial(month?: string, date?: string) {
  return api.get<{ data: PtTrialRow[]; _meta: SalesMeta }>('/fde-api/dongha/sales/pt-trial', donghaSalesParams(month, date));
}

export function getDonghaSalesRereg(month?: string, date?: string) {
  return api.get<{ data: ReregRow[]; _meta: SalesMeta }>('/fde-api/dongha/sales/rereg', donghaSalesParams(month, date));
}

export function getDonghaSalesSubscription(month?: string, date?: string) {
  return api.get<{ data: SubscriptionRow[]; _meta: SalesMeta }>('/fde-api/dongha/sales/subscription', donghaSalesParams(month, date));
}

export function getDonghaSalesAvailableDates(month?: string) {
  return api.get<{ month: string; dates: string[] }>('/fde-api/dongha/sales/available-dates', month ? { params: { month } } : {});
}

// =============================================
// 김동하 — 트레이너 평가 대시보드
// =============================================

export interface TrainerCriteria {
  active_members_min: number;
  sessions_min: number;
  conversion_min: number;
  rereg_min: number;
  fail_threshold: number;
  completion_min: number;
  days_per_8_max: number;
  ref_days_per_8: number;
  updated_at: string | null;
  updated_by: string | null;
}

export interface TrainerOverviewRow {
  trainer_name: string | null;
  trainer_user_ids: number[];
  branch: string;
  active_members_avg: number;
  sessions_avg: number;
  conversion_rate: number | null;
  rereg_rate: number | null;
  completion_rate: number | null;
  days_per_8_avg: number | null;
  completion_count: number;
  completion_ontime: number;
  active_sum: number;
  sessions_sum: number;
  trial_end: number;
  trial_convert: number;
  regular_end: number;
  regular_rereg: number;
  data_months: number;
}

export interface TrainerOverviewResponse {
  data: TrainerOverviewRow[];
  _meta: {
    snapshot_date: string | null;
    start: string;
    end: string;
    month_count: number;
    row_count?: number;
    excluded_staff_count?: number;
    inactive_3mo_count?: number;
    inactive_3mo_window?: string;
    ref_days_per_8?: number;
    completion_rows_total?: number;
    completion_rows_in_period?: number;
    completion_latest_snapshot?: string | null;
  };
}

export interface ExcludedTrainer {
  trainer_name: string;
  reason: string | null;
  excluded_by: string | null;
  created_at: string | null;
}

export interface TrainerMonthlyRow {
  target_month: string;
  branch: string;
  trainer_name: string | null;
  active_members: number;
  sessions_done: number;
  trial_end_count: number;
  trial_convert_count: number;
  regular_end_count: number;
  regular_rereg_count: number;
  completion_count: number;
  completion_ontime: number;
  days_per_8_sum: number;
  days_per_8_count: number;
}

export interface TrainerMonthlyResponse {
  data: TrainerMonthlyRow[];
  _meta: {
    snapshot_date: string | null;
    start?: string;
    end?: string;
    trainer_name?: string;
    branch?: string;
  };
}

// ── 상세 모달용 타입 ─────────────────────────────────────────

export interface TrainerSessionRow {
  수업날짜: string;
  시작시간: string;
  회원이름: string | null;
  회원연락처: string | null;
  멤버십명: string | null;
  체험정규: string | null;
  출석여부: string | null;
  예약취소: string | null;
}

export interface TrialMemberRow {
  회원이름: string | null;
  회원연락처: string | null;
  멤버십명: string | null;
  멤버십시작일: string;
  멤버십종료일: string;
  전환재등록: string | null;
  총횟수: number | null;
  사용횟수: number | null;
}

export interface ReregMemberRow {
  회원이름: string | null;
  회원연락처: string | null;
  멤버십명: string | null;
  멤버십시작일: string;
  멤버십종료일: string;
  총횟수: number | null;
  사용횟수: number | null;
  재등록여부: boolean;
}

export interface ActiveMemberRow {
  회원이름: string | null;
  회원연락처: string | null;
  멤버십명: string | null;
  멤버십시작일: string;
  멤버십종료일: string;
  총횟수: number | null;
  사용횟수: number | null;
  잔여횟수: number | null;
}

export interface CompletionMembershipRow {
  trainer_user_id: number;
  trainer_name: string | null;
  branch: string | null;
  contact: string | null;
  membership_name: string | null;
  begin_date: string;
  end_date: string | null;
  last_session_date: string;
  total_sessions: number;
  days_used: number;
  expected_days: number;
  days_per_8_norm: number | null;
  on_time: boolean;
}

export interface MemberPurchaseRow {
  지점명: string | null;
  회원이름: string | null;
  멤버십명: string | null;
  멤버십시작일: string;
  멤버십종료일: string;
  체험정규: string | null;
  담당트레이너: string | null;
  전환재등록: string | null;
  총횟수: number | null;
  사용횟수: number | null;
  잔여횟수: number | null;
  결제상태: string | null;
}

interface DetailResponse<T> {
  data: T[];
  _meta: { start: string; end: string; count: number; trainer_name?: string; branch?: string; contact?: string };
}

function trainerRangeParams(start?: string, end?: string) {
  const p: Record<string, string> = {};
  if (start) p.start = start;
  if (end) p.end = end;
  return { params: p };
}

export function getTrainerOverview(start?: string, end?: string) {
  return api.get<TrainerOverviewResponse>('/fde-api/dongha/trainers/overview', trainerRangeParams(start, end));
}

export function getTrainerMonthly(trainerName: string, branch: string, start?: string, end?: string) {
  const p: Record<string, string> = { trainer_name: trainerName, branch };
  if (start) p.start = start;
  if (end) p.end = end;
  return api.get<TrainerMonthlyResponse>('/fde-api/dongha/trainers/monthly', { params: p });
}

export function getTrainerCriteria() {
  return api.get<TrainerCriteria>('/fde-api/dongha/trainers/criteria');
}

export function updateTrainerCriteria(body: Omit<TrainerCriteria, 'updated_at' | 'updated_by'>) {
  return api.put<{ message: string; updated_by: string }>('/fde-api/dongha/trainers/criteria', body);
}

export function getTrainerAvailableMonths() {
  return api.get<{ months: string[] }>('/fde-api/dongha/trainers/available-months');
}

function detailParams(trainerName: string, branch: string, start?: string, end?: string, trainerUserIds?: number[]) {
  const p: Record<string, string> = { trainer_name: trainerName, branch };
  if (trainerUserIds && trainerUserIds.length > 0) p.trainer_user_ids = trainerUserIds.join(',');
  if (start) p.start = start;
  if (end) p.end = end;
  return { params: p };
}

export function getTrainerSessions(trainerName: string, branch: string, start?: string, end?: string) {
  // 세션은 raw_data_reservation 기반 (trainer_user_id 컬럼 없음) → name 매칭
  return api.get<DetailResponse<TrainerSessionRow>>('/fde-api/dongha/trainers/sessions', detailParams(trainerName, branch, start, end));
}

export function getTrainerTrialMembers(trainerName: string, branch: string, start?: string, end?: string, trainerUserIds?: number[]) {
  return api.get<DetailResponse<TrialMemberRow>>('/fde-api/dongha/trainers/trial-members', detailParams(trainerName, branch, start, end, trainerUserIds));
}

export function getTrainerReregMembers(trainerName: string, branch: string, start?: string, end?: string, trainerUserIds?: number[]) {
  return api.get<DetailResponse<ReregMemberRow>>('/fde-api/dongha/trainers/rereg-members', detailParams(trainerName, branch, start, end, trainerUserIds));
}

export function getTrainerActiveMembers(trainerName: string, branch: string, start?: string, end?: string, trainerUserIds?: number[]) {
  return api.get<DetailResponse<ActiveMemberRow>>('/fde-api/dongha/trainers/active-members', detailParams(trainerName, branch, start, end, trainerUserIds));
}

export function getTrainerCompletionMemberships(trainerName: string, branch: string, start?: string, end?: string, trainerUserIds?: number[]) {
  return api.get<{ data: CompletionMembershipRow[]; _meta: { count: number; ref_days_per_8: number; start: string; end: string } }>(
    '/fde-api/dongha/trainers/completion-memberships',
    detailParams(trainerName, branch, start, end, trainerUserIds),
  );
}

export interface InactiveCandidate {
  trainer_name: string;
  last_active_month: string | null;
  prior_sessions: number;
  recent_sessions: number;
}

export function getInactiveCandidates(months = 6) {
  return api.get<{ data: InactiveCandidate[]; _meta: { months: number; window: string | null; snapshot_date?: string; count: number } }>(
    '/fde-api/dongha/trainers/inactive-candidates',
    { params: { months: String(months) } },
  );
}

export function getMemberPurchases(contact: string, start?: string, end?: string) {
  const p: Record<string, string> = { contact };
  if (start) p.start = start;
  if (end) p.end = end;
  return api.get<DetailResponse<MemberPurchaseRow>>('/fde-api/dongha/trainers/member-purchases', { params: p });
}

// ── 직원 등 수동 제외 트레이너 ──────────────────────────────
export function getExcludedTrainers() {
  return api.get<{ data: ExcludedTrainer[]; count: number }>('/fde-api/dongha/trainers/excluded');
}

export function addExcludedTrainer(trainerName: string, reason?: string) {
  return api.post<{ message: string; trainer_name: string }>(
    '/fde-api/dongha/trainers/excluded',
    { trainer_name: trainerName, reason: reason ?? null },
  );
}

export function removeExcludedTrainer(trainerName: string) {
  return api.delete<{ message: string; trainer_name: string }>(
    `/fde-api/dongha/trainers/excluded/${encodeURIComponent(trainerName)}`,
  );
}

export function refreshTrainerSnapshot() {
  return api.post<{ message: string }>('/fde-api/dongha/trainers/refresh');
}

export interface CompletionRefreshResult {
  ok: boolean;
  start: string;
  end: string;
  snap_date: string;
  fetched: number;
  inserted: number;
  stage: string | null;
  error: string | null;
  traceback?: string;
  message?: string;
}

export function refreshCompletion(start?: string, end?: string) {
  const p: Record<string, string> = {};
  if (start) p.start = start;
  if (end) p.end = end;
  return api.post<CompletionRefreshResult>('/fde-api/dongha/trainers/refresh-completion', null, { params: p });
}

export interface CompletionDebug {
  replica: {
    candidates: number;
    fully_used: number;
    usage_distribution: {
      null_used: number;
      zero_used: number;
      used_ge_total: number;
      total_candidates: number;
    };
    samples: Array<Record<string, unknown>>;
  };
  fde: {
    total_rows: number;
    latest_snapshot: string | null;
  };
  period: { start: string; end: string };
}

export function getCompletionDebug(start?: string, end?: string) {
  const p: Record<string, string> = {};
  if (start) p.start = start;
  if (end) p.end = end;
  return api.get<CompletionDebug>('/fde-api/dongha/trainers/debug/completion', { params: p });
}

// ── 도길록: 인스타 해시태그 수집기 ───────────────────────────────────────────

export interface InstaHashtag {
  id: number;
  tag: string;
  is_active: boolean;
  created_at: string;
  last_collected_at: string | null;
}

export interface InstaPost {
  id: number;
  post_pk: string;
  shortcode: string;
  post_url: string;
  author_username: string | null;
  author_full_name: string | null;
  author_profile_pic_url: string | null;
  caption: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  like_count: number;
  comment_count: number;
  posted_at: string | null;
  matched_tags: string[];
  collected_at: string;
}

export interface InstaCollectResult {
  tag: string;
  fetched: number;
  inserted: number;
  updated: number;
  elapsed_sec: number;
}

export function getInstaHashtags() {
  return api.get<{ hashtags: InstaHashtag[] }>('/fde-api/dogilrok/insta/hashtags');
}

export function createInstaHashtag(tag: string) {
  return api.post<InstaHashtag>('/fde-api/dogilrok/insta/hashtags', { tag });
}

export function patchInstaHashtag(id: number, is_active: boolean) {
  return api.patch<InstaHashtag>(`/fde-api/dogilrok/insta/hashtags/${id}`, { is_active });
}

export function deleteInstaHashtag(id: number) {
  return api.delete(`/fde-api/dogilrok/insta/hashtags/${id}`);
}

export function collectInstaNow(tag: string, limit = 30) {
  return api.post<InstaCollectResult>('/fde-api/dogilrok/insta/collect', { tag, limit });
}

export function getInstaPosts(params: {
  tag?: string;
  search?: string;
  sort?: 'posted_at_desc' | 'posted_at_asc' | 'like_desc';
  offset?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params.tag) q.set('tag', params.tag);
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  if (params.offset !== undefined) q.set('offset', String(params.offset));
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  const qs = q.toString();
  return api.get<{ total: number; offset: number; limit: number; posts: InstaPost[] }>(
    `/fde-api/dogilrok/insta/posts${qs ? `?${qs}` : ''}`,
  );
}

export function instaPostsExportPath(params: { tag?: string; search?: string; sort?: string }) {
  const q = new URLSearchParams();
  if (params.tag) q.set('tag', params.tag);
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  const qs = q.toString();
  return `/fde-api/dogilrok/insta/posts/export.csv${qs ? `?${qs}` : ''}`;
}

/** CSV 다운로드 — Bearer 토큰 첨부 위해 axios 사용 후 blob 트리거 */
export async function downloadInstaPostsCsv(params: { tag?: string; search?: string; sort?: string }) {
  const path = instaPostsExportPath(params);
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'insta_posts.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── 최치환: 유효회원 추출 ──────────────────────────────────────────────────────

export interface ActiveMember {
  user_id: number;
  place_id: number;
  지점: string;
  회원이름: string;
  연락처: string;
  멤버십명: string;
  카테고리: string | null;
  시작일: string;
  종료일: string;
  결제금액: number;
}

export interface ActiveMembersResponse {
  total: number;
  data: ActiveMember[];
}

export interface PlaceItem {
  place_id: number;
  place_name: string;
}

export function getActiveMemberPlaces() {
  return api.get<{ places: PlaceItem[] }>('/fde-api/choi-chihwan/places');
}

export function getActiveMembers(params: {
  place_id?: number;
  sort_by?: string;
  sort_order?: string;
}) {
  const q = new URLSearchParams();
  if (params.place_id) q.set('place_id', String(params.place_id));
  if (params.sort_by) q.set('sort_by', params.sort_by);
  if (params.sort_order) q.set('sort_order', params.sort_order);
  return api.get<ActiveMembersResponse>(`/fde-api/choi-chihwan/active-members?${q}`);
}

export interface BranchSummaryRow {
  place: string;
  place_id: number;
  유효회원수: number;
}

export function getBranchSummary() {
  return api.get<{ total: number; data: BranchSummaryRow[] }>('/fde-api/choi-chihwan/branch-summary');
}

export interface MonthlyTrendRow {
  month: string; // YYYY-MM
  place: string;
  유효회원수: number;
}

export function getMonthlyTrend(place_id?: number) {
  const q = new URLSearchParams();
  if (place_id) q.set('place_id', String(place_id));
  return api.get<{ data: MonthlyTrendRow[] }>(`/fde-api/choi-chihwan/monthly-trend?${q}`);
}

export async function downloadActiveMembersCsv(place_id?: number) {
  const q = new URLSearchParams();
  if (place_id) q.set('place_id', String(place_id));
  const res = await api.get(`/fde-api/choi-chihwan/active-members/export.csv?${q}`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'active_members.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
