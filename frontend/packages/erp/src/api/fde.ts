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

// GitHub 지표
export function getGithubStats() {
  return api.get<{ stats: GithubStat[] }>('/fde-api/github/stats');
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

export interface GithubStat {
  member_name: string;
  github_username: string | null;
  pr_count: number;
  commit_count: number;
  prs: { title: string; number: number; state: string; created_at: string }[];
}

// =============================================
// 실적분석 API (김동하)
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

function salesParams(month?: string, date?: string) {
  const p: Record<string, string> = {};
  if (month) p.month = month;
  if (date) p.date = date;
  return { params: p };
}

export function getSalesOverview(month?: string, date?: string) {
  return api.get<SalesOverview>('/fde-api/sales/overview', salesParams(month, date));
}

export function getSalesRevenue(month?: string, date?: string) {
  return api.get<{ data: RevenueRow[]; _meta: SalesMeta }>('/fde-api/sales/revenue', salesParams(month, date));
}

export function getSalesFtNew(month?: string, date?: string) {
  return api.get<{ data: FtNewRow[]; _meta: SalesMeta }>('/fde-api/sales/ft-new', salesParams(month, date));
}

export function getSalesPtTrial(month?: string, date?: string) {
  return api.get<{ data: PtTrialRow[]; _meta: SalesMeta }>('/fde-api/sales/pt-trial', salesParams(month, date));
}

export function getSalesRereg(month?: string, date?: string) {
  return api.get<{ data: ReregRow[]; _meta: SalesMeta }>('/fde-api/sales/rereg', salesParams(month, date));
}

export function getSalesSubscription(month?: string, date?: string) {
  return api.get<{ data: SubscriptionRow[]; _meta: SalesMeta }>('/fde-api/sales/subscription', salesParams(month, date));
}

export function getSalesAvailableDates(month?: string) {
  return api.get<{ month: string; dates: string[] }>('/fde-api/sales/available-dates', month ? { params: { month } } : {});
}
