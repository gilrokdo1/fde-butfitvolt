import { api } from '../../../api/client';

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
