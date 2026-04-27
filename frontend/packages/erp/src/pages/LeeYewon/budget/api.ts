import { api } from '../../../api/client';

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

export interface Branch {
  id: number;
  code: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface AccountCode {
  id: number;
  category_id: number;
  code: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface AccountCategory {
  id: number;
  code: string;
  name: string;
  display_order: number;
  is_pending: boolean;
  is_fixed_cost: boolean;
  codes: AccountCode[];
}

export interface BudgetHealth {
  ok: boolean;
  phase: number;
  branches: number;
  categories: number;
  account_codes: number;
  sindorim_active: boolean;
}

export type ExpenseStatus = 'completed' | 'partially_refunded' | 'fully_refunded';

export interface Expense {
  id: number;
  branch_id: number;
  account_code_id: number;
  account_code_name: string | null;
  status: ExpenseStatus;
  order_date: string;
  accounting_year: number;
  accounting_month: number;
  receipt_confirmed: boolean;
  receipt_confirmed_at: string | null;
  is_long_delivery: boolean;
  created_by: number;
  created_by_name: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
  shipping_fee: number;
  total_amount: number;
  note: string | null;
  receipt_url: string | null;
  is_pending: boolean;
  pending_reason: string | null;
  refunded_amount: number;
  refund_reason: string | null;
  is_migrated: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductSuggestion {
  id: number;
  name: string;
  default_unit_price: number;
  default_account_code_id: number | null;
  default_account_code_name: string | null;
  default_url: string | null;
  default_note: string | null;
  order_count: number;
  last_ordered_at: string | null;
}

export interface ExpensePayload {
  branch_id: number;
  account_code_id: number;
  order_date: string; // YYYY-MM-DD
  accounting_year: number;
  accounting_month: number;
  item_name: string;
  unit_price: number;
  quantity: number;
  shipping_fee: number;
  note?: string | null;
  receipt_url?: string | null;
  is_long_delivery?: boolean;
  is_pending?: boolean;
  pending_reason?: string | null;
  confirm_duplicate?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 마스터 조회
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchBudgetHealth() {
  const { data } = await api.get<BudgetHealth>('/fde-api/yewon/budget/health');
  return data;
}

export async function fetchBranches() {
  const { data } = await api.get<Branch[]>('/fde-api/yewon/budget/branches');
  return data;
}

export async function fetchCategories() {
  const { data } = await api.get<AccountCategory[]>('/fde-api/yewon/budget/categories');
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 자동완성
// ─────────────────────────────────────────────────────────────────────────────

export async function autocompleteProducts(branchId: number, q: string) {
  if (q.trim().length < 2) return [];
  const { data } = await api.get<ProductSuggestion[]>(
    `/fde-api/yewon/budget/branches/${branchId}/products`,
    { params: { q, limit: 10 } },
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 지출 CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpenseListParams {
  year?: number;
  month?: number;
  account_code_id?: number;
  include_pending?: boolean;
  limit?: number;
}

export async function fetchExpenses(branchId: number, params: ExpenseListParams = {}) {
  const { data } = await api.get<Expense[]>(
    `/fde-api/yewon/budget/branches/${branchId}/expenses`,
    { params },
  );
  return data;
}

export async function createExpense(payload: ExpensePayload) {
  const { data } = await api.post<{ ok: boolean; id: number }>(
    '/fde-api/yewon/budget/expenses',
    payload,
  );
  return data;
}

export async function updateExpense(id: number, patch: Partial<ExpensePayload>) {
  const { data } = await api.patch<{ ok: boolean }>(
    `/fde-api/yewon/budget/expenses/${id}`,
    patch,
  );
  return data;
}

export async function deleteExpense(id: number, reason: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/fde-api/yewon/budget/expenses/${id}`,
    { params: { reason } },
  );
  return data;
}

export async function refundExpense(id: number, refunded_amount: number, refund_reason: string) {
  const { data } = await api.post<{ ok: boolean; status: ExpenseStatus }>(
    `/fde-api/yewon/budget/expenses/${id}/refund`,
    { refunded_amount, refund_reason },
  );
  return data;
}

export async function cancelRefund(id: number) {
  const { data } = await api.post<{ ok: boolean }>(
    `/fde-api/yewon/budget/expenses/${id}/refund/cancel`,
  );
  return data;
}

export async function toggleReceiptConfirmed(id: number, confirmed: boolean) {
  const { data } = await api.patch<{ ok: boolean; confirmed: boolean }>(
    `/fde-api/yewon/budget/expenses/${id}/receipt`,
    { confirmed },
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 이관 + 검증 (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

export interface MigrationStatus {
  branch_code: string;
  migrated_expenses: number;
  manual_expenses: number;
  annual_budget_rows: number;
  ready: boolean;
}

export interface MigrationResult {
  ok: boolean;
  branch: string;
  budget_rows_inserted: number;
  expenses_inserted: number;
  pending_expenses: number;
  writers_registered: number;
}

export interface ValidationAggregate {
  year: number;
  by_month: { month: number; total: number; count: number }[];
  by_category: { account_name: string; total: number; count: number }[];
  by_month_category: { month: number; account_name: string; total: number; count: number }[];
  pending: { count: number; total: number };
}

export async function fetchMigrationStatus(branchCode: string) {
  const { data } = await api.get<MigrationStatus>(
    `/fde-api/yewon/budget/migrate/${branchCode}/status`,
  );
  return data;
}

export async function runMigration(branchCode: string, payload: unknown) {
  const { data } = await api.post<MigrationResult>(
    `/fde-api/yewon/budget/migrate/${branchCode}`,
    payload,
  );
  return data;
}

export async function fetchValidation(branchId: number, year: number) {
  const { data } = await api.get<ValidationAggregate>(
    `/fde-api/yewon/budget/branches/${branchId}/validate`,
    { params: { year } },
  );
  return data;
}

export interface FixedCostMigrationResult {
  ok: boolean;
  branch: string;
  fixed_costs_inserted: number;
  skipped_existing: string[];
}

export async function runFixedCostMigration(branchCode: string, payload: unknown) {
  const { data } = await api.post<FixedCostMigrationResult>(
    `/fde-api/yewon/budget/migrate/${branchCode}/fixed-costs`,
    payload,
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 집계 (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardAccount {
  account_code_id: number;
  account_name: string;
  category_name: string;
  is_fixed_cost: boolean;
  month_budget: number;
  month_spend: number;
  month_ratio: number;
  quarter_budget: number;
  quarter_spend: number;
  quarter_ratio: number;
  quarter_remaining: number;
}

export interface DashboardResponse {
  year: number;
  month: number;
  quarter: number;
  quarter_months: number[];
  month_progress: { days_passed: number; days_total: number; ratio: number };
  accounts: DashboardAccount[];
  totals: {
    month_budget: number;
    month_spend: number;
    month_remaining: number;
    month_ratio: number;
    quarter_budget: number;
    quarter_spend: number;
    quarter_remaining: number;
  };
  pending: { count: number; total: number };
  previous_quarter: {
    quarter: number;
    over_budget: { account_name: string; over_amount: number }[];
  } | null;
}

export async function fetchDashboard(branchId: number, year: number, month: number) {
  const { data } = await api.get<DashboardResponse>(
    `/fde-api/yewon/budget/branches/${branchId}/dashboard`,
    { params: { year, month } },
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 미정 재분류 (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingExpense {
  id: number;
  order_date: string;
  accounting_year: number;
  accounting_month: number;
  item_name: string;
  unit_price: number;
  quantity: number;
  shipping_fee: number;
  total_amount: number;
  note: string | null;
  receipt_url: string | null;
  pending_reason: string | null;
  is_migrated: boolean;
  created_at: string;
  created_by_name: string | null;
}

export async function fetchPendingExpenses(branchId: number) {
  const { data } = await api.get<PendingExpense[]>(
    `/fde-api/yewon/budget/branches/${branchId}/pending-expenses`,
  );
  return data;
}

export async function reclassifyExpense(
  expenseId: number,
  targetAccountCodeId: number,
  reason?: string,
) {
  const { data } = await api.patch<{ ok: boolean }>(
    `/fde-api/yewon/budget/expenses/${expenseId}/reclassify`,
    { target_account_code_id: targetAccountCodeId, reason: reason ?? null },
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 연간 매트릭스 (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnualCode {
  id: number;
  name: string;
  budgets: Record<string, number>;  // {"1":..., ..., "12":...}
  spends: Record<string, number>;
  annual_budget: number;
  annual_spend: number;
  annual_ratio: number;
  over_months: number[];
}

export interface AnnualCategory {
  name: string;
  code: string;
  is_pending: boolean;
  is_fixed_cost: boolean;
  codes: AnnualCode[];
  group_annual_budget: number;
  group_annual_spend: number;
  group_annual_ratio: number;
}

export interface AnnualResponse {
  year: number;
  ytd_progress: { months_passed: number; ratio: number };
  categories: AnnualCategory[];
  totals: {
    annual_budget: number;
    annual_spend: number;
    annual_remaining: number;
    annual_ratio: number;
  };
  pending: {
    count: number;
    total: number;
    by_month: Record<string, { total: number; count: number }>;
  };
}

export async function fetchAnnual(branchId: number, year: number) {
  const { data } = await api.get<AnnualResponse>(
    `/fde-api/yewon/budget/branches/${branchId}/annual`,
    { params: { year } },
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 지점 활성화 (Phase 7)
// ─────────────────────────────────────────────────────────────────────────────

export async function activateBranch(branchCode: string) {
  const { data } = await api.post<{ ok: boolean; branch: string; already_active: boolean }>(
    `/fde-api/yewon/budget/branches/${branchCode}/activate`,
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 본사 통합 뷰 (Phase 8)
// ─────────────────────────────────────────────────────────────────────────────

export interface HqBranchRow {
  id: number;
  code: string;
  name: string;
  display_order: number;
  month_budget: number;
  month_spend: number;
  month_ratio: number;
  quarter_budget: number;
  quarter_spend: number;
  quarter_ratio: number;
  pending_count: number;
  pending_total: number;
  warn_count: number;
  danger_count: number;
}

export interface HqHeatmapAccount {
  id: number;
  name: string;
  category_name: string;
}

export interface HqHeatmapCell {
  branch_id: number;
  account_code_id: number;
  ratio: number | null;  // null = 예산 없음
}

export interface HqDashboardResponse {
  year: number;
  month: number;
  quarter: number;
  quarter_months: number[];
  month_progress: { ratio: number; days_passed: number; days_total: number };
  branches: HqBranchRow[];
  heatmap: { accounts: HqHeatmapAccount[]; cells: HqHeatmapCell[] };
  totals: {
    month_budget: number;
    month_spend: number;
    month_remaining: number;
    month_ratio: number;
    warn_branches: number;
    danger_branches: number;
    pending_count: number;
    pending_total: number;
  };
}

export async function fetchHqDashboard(year: number, month: number) {
  const { data } = await api.get<HqDashboardResponse>(
    '/fde-api/yewon/budget/hq/dashboard',
    { params: { year, month } },
  );
  return data;
}

export async function checkHqAccess(): Promise<boolean> {
  try {
    await api.get('/fde-api/yewon/budget/hq/can-access');
    return true;
  } catch {
    return false;
  }
}

export interface HqPendingItem {
  id: number;
  order_date: string;
  accounting_year: number;
  accounting_month: number;
  item_name: string;
  unit_price: number;
  quantity: number;
  shipping_fee: number;
  total_amount: number;
  refunded_amount: number;
  effective: number;
  note: string | null;
  receipt_url: string | null;
  pending_reason: string | null;
  is_migrated: boolean;
  created_by_name: string | null;
}

export interface HqPendingGroup {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  count: number;
  total: number;
  items: HqPendingItem[];
}

export interface HqPendingResponse {
  year: number;
  month: number;
  groups: HqPendingGroup[];
  grand_count: number;
  grand_total: number;
}

export async function fetchHqPending(year: number, month: number) {
  const { data } = await api.get<HqPendingResponse>(
    '/fde-api/yewon/budget/hq/pending-expenses',
    { params: { year, month } },
  );
  return data;
}

export interface HqWarningItem {
  account_code_id: number;
  account_name: string;
  category_name: string;
  month_budget: number;
  month_spend: number;
  month_ratio: number;
  tone: 'danger' | 'warn';
}

export interface HqWarningGroup {
  branch_id: number;
  branch_name: string;
  danger_count: number;
  warn_count: number;
  items: HqWarningItem[];
}

export interface HqWarningResponse {
  year: number;
  month: number;
  groups: HqWarningGroup[];
}

export async function fetchHqWarnings(year: number, month: number) {
  const { data } = await api.get<HqWarningResponse>(
    '/fde-api/yewon/budget/hq/warnings',
    { params: { year, month } },
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 지점 수령 지연 드릴다운
// ─────────────────────────────────────────────────────────────────────────────

export interface ReceiptDelayItem {
  id: number;
  order_date: string;
  accounting_year: number;
  accounting_month: number;
  item_name: string;
  unit_price: number;
  quantity: number;
  shipping_fee: number;
  total_amount: number;
  refunded_amount: number;
  note: string | null;
  receipt_url: string | null;
  is_long_delivery: boolean;
  account_code_name: string | null;
  category_name: string | null;
  created_by_name: string | null;
  days_passed: number;
  threshold: number;
}

export interface ReceiptDelayResponse {
  year: number;
  month: number;
  items: ReceiptDelayItem[];
}

export async function fetchReceiptDelays(branchId: number, year: number, month: number) {
  const { data } = await api.get<ReceiptDelayResponse>(
    `/fde-api/yewon/budget/branches/${branchId}/receipt-delays`,
    { params: { year, month } },
  );
  return data;
}
