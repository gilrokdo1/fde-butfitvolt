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
