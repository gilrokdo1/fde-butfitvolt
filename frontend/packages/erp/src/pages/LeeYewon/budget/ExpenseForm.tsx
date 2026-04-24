import { useEffect, useMemo, useRef, useState } from 'react';
import s from './ExpenseForm.module.css';
import {
  autocompleteProducts,
  createExpense,
  fetchCategories,
  updateExpense,
  type AccountCategory,
  type Expense,
  type ExpensePayload,
  type ProductSuggestion,
} from './api';

interface Props {
  branchId: number;
  branchName: string;
  /** null: 신규 등록 / object: 수정 */
  existing: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}

type FormState = {
  account_code_id: number | null;
  order_date: string;
  accounting_year: number;
  accounting_month: number;
  item_name: string;
  unit_price: string; // 입력 편의 위해 문자열
  quantity: string;
  shipping_fee: string;
  note: string;
  receipt_url: string;
  is_long_delivery: boolean;
  is_pending: boolean;
  pending_reason: string;
};

function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function monthOfDate(dateStr: string): { year: number; month: number } {
  const d = new Date(dateStr);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function initialState(existing: Expense | null): FormState {
  if (!existing) {
    const t = todayStr();
    const { year, month } = monthOfDate(t);
    return {
      account_code_id: null,
      order_date: t,
      accounting_year: year,
      accounting_month: month,
      item_name: '',
      unit_price: '',
      quantity: '1',
      shipping_fee: '0',
      note: '',
      receipt_url: '',
      is_long_delivery: false,
      is_pending: false,
      pending_reason: '',
    };
  }
  return {
    account_code_id: existing.account_code_id,
    order_date: existing.order_date,
    accounting_year: existing.accounting_year,
    accounting_month: existing.accounting_month,
    item_name: existing.item_name,
    unit_price: String(existing.unit_price),
    quantity: String(existing.quantity),
    shipping_fee: String(existing.shipping_fee),
    note: existing.note ?? '',
    receipt_url: existing.receipt_url ?? '',
    is_long_delivery: existing.is_long_delivery,
    is_pending: existing.is_pending,
    pending_reason: existing.pending_reason ?? '',
  };
}

export default function ExpenseForm({ branchId, branchName, existing, onClose, onSaved }: Props) {
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [form, setForm] = useState<FormState>(() => initialState(existing));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dupInfo, setDupInfo] = useState<{ existingCount: number; message: string } | null>(null);

  // 자동완성
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((e) => setError(e instanceof Error ? e.message : '카테고리 로드 실패'));
  }, []);

  // item_name이 바뀌면 자동완성 호출 (250ms debounce)
  useEffect(() => {
    if (existing) return; // 수정 시에는 자동완성 비활성화
    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
    if (form.item_name.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    autocompleteTimer.current = setTimeout(() => {
      autocompleteProducts(branchId, form.item_name)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => {
      if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
    };
  }, [form.item_name, branchId, existing]);

  const pendingCategory = useMemo(
    () => categories.find((c) => c.is_pending),
    [categories],
  );
  const pendingCode = pendingCategory?.codes[0] ?? null;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function pickSuggestion(sug: ProductSuggestion) {
    setForm((prev) => ({
      ...prev,
      item_name: sug.name,
      unit_price: String(sug.default_unit_price),
      account_code_id: sug.default_account_code_id ?? prev.account_code_id,
      receipt_url: sug.default_url ?? prev.receipt_url,
      note: prev.note || (sug.default_note ?? ''),
    }));
    setShowSuggestions(false);
  }

  async function submit(confirmDuplicate = false) {
    setError(null);
    if (!form.account_code_id && !form.is_pending) {
      setError('카테고리를 선택하거나 "미정"을 선택하세요');
      return;
    }
    if (form.is_pending && !form.pending_reason.trim()) {
      setError('미정 카테고리는 사유 입력이 필수입니다');
      return;
    }
    if (form.is_pending && !pendingCode) {
      setError('미정 카테고리 설정이 아직 로드되지 않았습니다');
      return;
    }
    if (!form.item_name.trim()) {
      setError('품목명을 입력하세요');
      return;
    }
    const unitPrice = Number(form.unit_price);
    const quantity = Number(form.quantity);
    const shippingFee = Number(form.shipping_fee || 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError('단가를 올바르게 입력하세요');
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError('수량은 1 이상이어야 합니다');
      return;
    }

    const payload: ExpensePayload = {
      branch_id: branchId,
      account_code_id: form.is_pending
        ? (pendingCode!.id)
        : (form.account_code_id as number),
      order_date: form.order_date,
      accounting_year: form.accounting_year,
      accounting_month: form.accounting_month,
      item_name: form.item_name.trim(),
      unit_price: unitPrice,
      quantity,
      shipping_fee: shippingFee,
      note: form.note.trim() || null,
      receipt_url: form.receipt_url.trim() || null,
      is_long_delivery: form.is_long_delivery,
      is_pending: form.is_pending,
      pending_reason: form.is_pending ? form.pending_reason.trim() : null,
      confirm_duplicate: confirmDuplicate,
    };

    setSaving(true);
    try {
      if (existing) {
        await updateExpense(existing.id, payload);
      } else {
        await createExpense(payload);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      const anyErr = e as { response?: { status?: number; data?: { detail?: unknown } } };
      const detail = anyErr.response?.data?.detail;
      if (anyErr.response?.status === 409 && detail && typeof detail === 'object') {
        const d = detail as { message?: string; existing_count?: number };
        setDupInfo({
          existingCount: d.existing_count ?? 2,
          message: d.message ?? '중복 가능성이 있습니다',
        });
      } else {
        const msg = typeof detail === 'string' ? detail : (e instanceof Error ? e.message : '저장 실패');
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <header className={s.modalHeader}>
          <h3>{existing ? '지출 수정' : '지출 등록'} · {branchName}</h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          <div className={s.row}>
            <label>
              <span>주문일자 *</span>
              <input
                type="date"
                value={form.order_date}
                onChange={(e) => {
                  const v = e.target.value;
                  patch('order_date', v);
                  // 귀속월 기본값도 주문일에 맞춰 업데이트 (사용자 수동 변경 전까지)
                  if (!existing) {
                    const { year, month } = monthOfDate(v);
                    patch('accounting_year', year);
                    patch('accounting_month', month);
                  }
                }}
              />
            </label>

            <label>
              <span>귀속월 *</span>
              <div className={s.yearMonth}>
                <input
                  type="number"
                  value={form.accounting_year}
                  onChange={(e) => patch('accounting_year', Number(e.target.value) || 0)}
                  min={2020}
                  max={2100}
                />
                <span>년</span>
                <input
                  type="number"
                  value={form.accounting_month}
                  onChange={(e) => patch('accounting_month', Number(e.target.value) || 0)}
                  min={1}
                  max={12}
                />
                <span>월</span>
              </div>
            </label>
          </div>

          <div className={s.row}>
            <label className={s.fullWidth}>
              <span>카테고리 *</span>
              <div className={s.categoryGroup}>
                <select
                  value={form.is_pending ? '__pending__' : (form.account_code_id ?? '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__pending__') {
                      patch('is_pending', true);
                      patch('account_code_id', null);
                    } else {
                      patch('is_pending', false);
                      patch('account_code_id', Number(v) || null);
                    }
                  }}
                >
                  <option value="">(선택)</option>
                  {categories
                    .filter((c) => !c.is_pending)
                    .map((c) => (
                      <optgroup key={c.id} label={c.name}>
                        {c.codes.map((ac) => (
                          <option key={ac.id} value={ac.id}>
                            {ac.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  {pendingCategory && <option value="__pending__">🤔 미정 (추후 분류)</option>}
                </select>
              </div>
            </label>
          </div>

          {form.is_pending && (
            <div className={s.row}>
              <label className={s.fullWidth}>
                <span>미정 사유 *</span>
                <input
                  type="text"
                  placeholder="예: 에어컨 미디어필터 구매. 기존 카테고리 매칭 어려움."
                  value={form.pending_reason}
                  onChange={(e) => patch('pending_reason', e.target.value)}
                />
              </label>
            </div>
          )}

          <div className={s.row}>
            <label className={s.fullWidth} style={{ position: 'relative' }}>
              <span>품목명 *</span>
              <input
                type="text"
                value={form.item_name}
                onChange={(e) => patch('item_name', e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                autoComplete="off"
              />
              {!existing && showSuggestions && suggestions.length > 0 && (
                <ul className={s.suggestions}>
                  {suggestions.map((sug) => (
                    <li key={sug.id}>
                      <button type="button" onClick={() => pickSuggestion(sug)}>
                        <span className={s.sugName}>{sug.name}</span>
                        <span className={s.sugMeta}>
                          {sug.default_unit_price.toLocaleString()}원 · {sug.order_count}회 주문
                          {sug.default_account_code_name ? ` · ${sug.default_account_code_name}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
          </div>

          <div className={s.row}>
            <label>
              <span>단가(VAT+) *</span>
              <input
                type="number"
                value={form.unit_price}
                onChange={(e) => patch('unit_price', e.target.value)}
                min={0}
              />
            </label>
            <label>
              <span>수량 *</span>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => patch('quantity', e.target.value)}
                min={1}
              />
            </label>
            <label>
              <span>배송비</span>
              <input
                type="number"
                value={form.shipping_fee}
                onChange={(e) => patch('shipping_fee', e.target.value)}
                min={0}
              />
            </label>
          </div>

          <div className={s.totalLine}>
            <span>총액</span>
            <strong>
              {(
                (Number(form.unit_price) || 0) * (Number(form.quantity) || 0)
                + (Number(form.shipping_fee) || 0)
              ).toLocaleString()}원
            </strong>
          </div>

          <div className={s.row}>
            <label className={s.fullWidth}>
              <span>링크</span>
              <input
                type="text"
                placeholder="https://..."
                value={form.receipt_url}
                onChange={(e) => patch('receipt_url', e.target.value)}
              />
            </label>
          </div>

          <div className={s.row}>
            <label className={s.fullWidth}>
              <span>비고</span>
              <input
                type="text"
                value={form.note}
                onChange={(e) => patch('note', e.target.value)}
              />
            </label>
          </div>

          <label className={s.checkbox}>
            <input
              type="checkbox"
              checked={form.is_long_delivery}
              onChange={(e) => patch('is_long_delivery', e.target.checked)}
            />
            <span>장기 배송 (수령 지연 판정 기준을 7일 → 14일로)</span>
          </label>
        </div>

        <footer className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose} disabled={saving}>
            취소
          </button>
          <button className={s.saveBtn} onClick={() => submit(false)} disabled={saving}>
            {saving ? '저장 중...' : existing ? '수정' : '등록'}
          </button>
        </footer>

        {dupInfo && (
          <div className={s.dupBackdrop} onClick={() => setDupInfo(null)}>
            <div className={s.dupModal} onClick={(e) => e.stopPropagation()}>
              <h4>중복 가능성</h4>
              <p>{dupInfo.message}</p>
              <p className={s.dupHint}>
                오늘 같은 품목·단가·수량으로 이미 {dupInfo.existingCount}건 등록되어 있습니다.
              </p>
              <div className={s.dupFooter}>
                <button onClick={() => setDupInfo(null)}>돌아가기</button>
                <button
                  className={s.dupForce}
                  onClick={() => {
                    setDupInfo(null);
                    submit(true);
                  }}
                >
                  그래도 등록
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
