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
