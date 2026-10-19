import React, { useEffect, useState, useMemo } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Search,
  Filter,
  X,
  Layers,
  Table as TableIcon,
  ReceiptText
} from 'lucide-react';
import api from '../services/api';

interface BudgetTransactionsViewProps {
  onOpenNewTransaction: (category?: string, subcategory?: string, type?: 'income' | 'expense') => void;
  globalSearchQuery?: string;
  initialViewMode?: 'combined' | 'budget' | 'transactions';
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PAYMENT_MODES = [
  { value: 'upi', label: 'UPI' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'debit', label: 'Debit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'neft_rtgs', label: 'NEFT/RTGS' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'auto_debit', label: 'Auto Debit' },
];

const DEFAULT_CATEGORIES = {
  income: ['Salary', 'Bonus & Incentives', 'Other Income'],
  savings: ['Investments', 'Emergency Fund', 'Mutual Funds'],
  expense: [
    'Housing & Rent',
    'Food & Groceries',
    'Utilities & Internet',
    'Dining & Entertainment',
    'Shopping & Travel',
    'Health & Insurance',
  ],
};

const BASE_CATEGORY_FILTERS = [
  'All Categories',
  'Housing & Rent',
  'Food & Groceries',
  'Utilities & Internet',
  'Dining & Entertainment',
  'Transportation & Auto',
  'Healthcare & Medical',
  'Shopping & Personal',
  'Salary',
  'Investments',
  'Freelance & Business'
];

type Section = 'income' | 'savings' | 'expense';
type Mode = 'actual' | 'budget';
type ViewMode = 'combined' | 'budget' | 'transactions';

interface Line {
  id: string;
  name: string;
  values: number[];
  transactions?: TransactionDetail[];
}

interface TransactionDetail extends Line {
  date: string;
  paymentMode?: string;
  monthPaymentModes?: string[];
}

interface Category extends Line {
  categoryId?: number;
  subcategories: Line[];
}

interface ApiCategory {
  id: number;
  name: string;
  type: string;
}

interface ApiSubcategory {
  id: number;
  categoryId: number;
  name: string;
}

const zeros = () => new Array(12).fill(0) as number[];

const getSection = (item: any): Section =>
  item.type === 'income'
    ? 'income'
    : item.type === 'savings' ||
        ['Investments', 'Savings', 'Mutual Funds', 'Emergency Fund'].includes(
          item.category,
        )
      ? 'savings'
      : 'expense';

export const BudgetTransactionsView: React.FC<BudgetTransactionsViewProps> = ({
  onOpenNewTransaction,
  globalSearchQuery,
  initialViewMode = 'combined',
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(
    globalSearchQuery ? 'transactions' : initialViewMode
  );
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [mode, setMode] = useState<Mode>('budget');

  // Transactions ledger state
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [searchQuery, setSearchQuery] = useState<string>(globalSearchQuery || '');

  // Categories API state
  const [apiCategories, setApiCategories] = useState<ApiCategory[]>([]);
  const [apiSubcategories, setApiSubcategories] = useState<ApiSubcategory[]>([]);

  // Budget spreadsheet state
  const [sections, setSections] = useState<Record<Section, Category[]>>({
    income: [],
    savings: [],
    expense: [],
  });

  const [sectionOpen, setSectionOpen] = useState<Record<Section, boolean>>({
    income: true,
    savings: true,
    expense: true,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());

  const [budgetValues, setBudgetValues] = useState<Record<string, number[]>>({});
  const [budgetTransactions, setBudgetTransactions] = useState<Record<string, TransactionDetail[]>>({});
  const [budgetTransactionDrafts, setBudgetTransactionDrafts] = useState<Record<string, TransactionDetail>>({});

  const [showYearPicker, setShowYearPicker] = useState<boolean>(false);

  const [defaultPaymentMode] = useState<string>(() => {
    try {
      return localStorage.getItem('fintrack-default-payment-mode') || 'upi';
    } catch {
      return 'upi';
    }
  });

  // Sync global search query from Navbar
  useEffect(() => {
    if (globalSearchQuery !== undefined) {
      setSearchQuery(globalSearchQuery);
      if (globalSearchQuery.trim()) {
        setViewMode('combined');
      }
    }
  }, [globalSearchQuery]);

  // Load stored budgets when year changes
  useEffect(() => {
    const stored = localStorage.getItem(`fintrack-budget-${selectedYear}`);
    setBudgetValues(stored ? JSON.parse(stored) : {});
  }, [selectedYear]);

  useEffect(() => {
    const stored = localStorage.getItem(`fintrack-budget-transactions-${selectedYear}`);
    setBudgetTransactions(stored ? JSON.parse(stored) : {});
  }, [selectedYear]);

  // Load data from backend
  useEffect(() => {
    loadAllData();
  }, [selectedYear]);

  const loadAllData = async () => {
    setLoadingTransactions(true);
    try {
      const [transactionsResult, categoriesResult, subcategoriesResult] = await Promise.all([
        api.get('/transactions').catch(() => ({ data: { data: [] } })),
        api.get('/categories').catch(() => ({ data: { data: [] } })),
        api.get('/subcategories').catch(() => ({ data: { data: [] } })),
      ]);

      const txs = transactionsResult.data?.success && Array.isArray(transactionsResult.data.data)
        ? transactionsResult.data.data
        : [];
      const cats = categoriesResult.data?.success && Array.isArray(categoriesResult.data.data)
        ? categoriesResult.data.data
        : [];
      const subcats = subcategoriesResult.data?.success && Array.isArray(subcategoriesResult.data.data)
        ? subcategoriesResult.data.data
        : [];

      setRawTransactions(txs);
      setApiCategories(cats);
      setApiSubcategories(subcats);

      setSections(makeSections(txs, cats, subcats));
    } catch {
      setRawTransactions([]);
      setSections(makeSections([], [], []));
    } finally {
      setLoadingTransactions(false);
    }
  };

  const makeSections = (
    transactions: any[],
    cats: ApiCategory[],
    subcats: ApiSubcategory[],
  ) => {
    const result: Record<Section, Category[]> = {
      income: [],
      savings: [],
      expense: [],
    };

    const map = new Map<string, Category>();

    const ensureCategory = (
      section: Section,
      name: string,
      categoryId?: number,
    ) => {
      const id = `${section}:${name}`;

      if (!map.has(id)) {
        const category: Category = {
          id,
          name,
          categoryId,
          values: zeros(),
          subcategories: [],
        };

        map.set(id, category);
        result[section].push(category);
      }

      return map.get(id)!;
    };

    const ensureSubcategory = (
      category: Category,
      name: string,
      id?: string,
    ) => {
      let found = category.subcategories.find((item) => item.name === name);

      if (!found) {
        found = {
          id: id || `${category.id}:${name}`,
          name,
          values: zeros(),
          transactions: [],
        };

        category.subcategories.push(found);
      }

      return found;
    };

    (Object.keys(DEFAULT_CATEGORIES) as Section[]).forEach((section) =>
      DEFAULT_CATEGORIES[section].forEach((name) =>
        ensureCategory(section, name),
      ),
    );

    cats.forEach((category) => {
      const section: Section =
        category.type === 'income'
          ? 'income'
          : category.type === 'savings'
            ? 'savings'
            : 'expense';

      ensureCategory(section, category.name, category.id);
    });

    subcats.forEach((subcategory) => {
      const parent = cats.find((category) => category.id === subcategory.categoryId);

      if (parent) {
        const section: Section =
          parent.type === 'income'
            ? 'income'
            : parent.type === 'savings'
              ? 'savings'
              : 'expense';

        ensureSubcategory(
          ensureCategory(section, parent.name, parent.id),
          subcategory.name,
          `sub:${subcategory.id}`,
        );
      }
    });

    transactions
      .filter((item) => String(item.date || '').startsWith(String(selectedYear)))
      .sort((a, b) => {
        const dayA = Number(String(a.date || '').slice(8, 10)) || 1;
        const dayB = Number(String(b.date || '').slice(8, 10)) || 1;
        if (dayA !== dayB) return dayA - dayB;
        return String(a.date || '').localeCompare(String(b.date || ''));
      })
      .forEach((item) => {
        const month = Number(String(item.date).slice(5, 7)) - 1;

        if (month < 0 || month > 11) return;

        const category = ensureCategory(
          getSection(item),
          item.category || 'Uncategorized',
        );

        const subcategory = ensureSubcategory(
          category,
          item.subcategory || 'Uncategorized',
        );

        const amount = Number(item.amount) || 0;

        category.values[month] += amount;
        subcategory.values[month] += amount;

        subcategory.transactions?.push({
          id: `transaction:${item.id}`,
          name: item.description || item.subcategory || 'Transaction',
          date: String(item.date),
          values: MONTHS.map((_, index) => (index === month ? amount : 0)),
        });
      });

    (Object.keys(result) as Section[]).forEach((section) =>
      result[section].forEach((category) => {
        if (!category.subcategories.length) {
          ensureSubcategory(category, 'Unallocated');
        }
      }),
    );

    return result;
  };

  // Transactions Ledger filtering
  const categoryFilterOptions = useMemo(() => {
    const set = new Set<string>(BASE_CATEGORY_FILTERS);
    apiCategories.forEach((c) => set.add(c.name));
    rawTransactions.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set);
  }, [apiCategories, rawTransactions]);

  const filteredTransactions = useMemo(() => {
    return rawTransactions.filter((t) => {
      // 1. Filter by Type
      if (filterType !== 'all' && t.type !== filterType) return false;

      // 2. Filter by Category
      if (selectedCategory !== 'All Categories' && t.category !== selectedCategory) return false;

      // 3. Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCat = t.category && String(t.category).toLowerCase().includes(q);
        const matchSub = t.subcategory && String(t.subcategory).toLowerCase().includes(q);
        const matchDesc = t.description && String(t.description).toLowerCase().includes(q);
        const matchMode = t.paymentMode && String(t.paymentMode).toLowerCase().includes(q);
        const matchDate = t.date && String(t.date).toLowerCase().includes(q);
        const matchAmt = t.amount && String(t.amount).includes(q);
        if (!matchCat && !matchSub && !matchDesc && !matchMode && !matchDate && !matchAmt) {
          return false;
        }
      }

      return true;
    });
  }, [rawTransactions, filterType, selectedCategory, searchQuery]);

  const hasActiveFilters =
    filterType !== 'all' || selectedCategory !== 'All Categories' || searchQuery.trim().length > 0;

  const handleClearFilters = () => {
    setFilterType('all');
    setSelectedCategory('All Categories');
    setSearchQuery('');
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/transactions/${id}`);
      setRawTransactions((prev) => {
        const next = prev.filter((t) => t.id !== id);
        setSections(makeSections(next, apiCategories, apiSubcategories));
        return next;
      });
    } catch {
      alert('Failed to delete transaction');
    }
  };

  // Budget calculations & formatting
  const yearChoices = [selectedYear - 1, selectedYear, selectedYear + 1];

  const pickerYears = Array.from(
    { length: 12 },
    (_, index) => selectedYear - 5 + index,
  );

  const currency = (value: number) =>
    `₹${Math.round(value || 0).toLocaleString('en-IN')}`;

  const cell = (value: number) => (value ? currency(value) : '—');

  const total = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0);

  const budgetTransactionValues = (line: Line) =>
    MONTHS.map((_, month) =>
      (budgetTransactions[line.id] || []).reduce(
        (sum, transaction) => sum + (transaction.values[month] || 0),
        0,
      ),
    );

  const leafValues = (line: Line) => {
    if (mode === 'actual') {
      return line.values;
    }
    const txs = budgetTransactions[line.id] || [];
    const txTotal = txs.reduce((sum, tx) => sum + total(tx.values), 0);
    if (txs.length > 0 && txTotal > 0) {
      return budgetTransactionValues(line);
    }
    if (txs.length > 0 && txTotal === 0) {
      const direct = budgetValues[line.id];
      if (direct && total(direct) > 0) {
        return direct;
      }
      return budgetTransactionValues(line);
    }
    return budgetValues[line.id] || zeros();
  };

  const categoryValues = (category: Category) =>
    mode === 'actual'
      ? category.values
      : MONTHS.map((_, month) =>
          category.subcategories.reduce(
            (sum, subcategory) => sum + leafValues(subcategory)[month],
            0,
          ),
        );

  const sectionTotals = (section: Section) =>
    MONTHS.map((_, month) =>
      sections[section].reduce(
        (sum, category) => sum + categoryValues(category)[month],
        0,
      ),
    );

  // Budget Transaction Drafts
  const beginBudgetTransaction = (subcategory: Line) => {
    if (budgetTransactionDrafts[subcategory.id]) return;

    setBudgetTransactionDrafts((current) => ({
      ...current,
      [subcategory.id]: {
        id: `transaction-draft:${Date.now()}`,
        name: '',
        date: `${selectedYear}-01-01`,
        paymentMode: '01',
        monthPaymentModes: new Array(12).fill(''),
        values: zeros(),
      },
    }));

    setExpandedSubcategories((current) => new Set(current).add(subcategory.id));
  };

  const beginEditExistingTransaction = (
    subcategory: Line,
    transaction: TransactionDetail,
  ) => {
    setBudgetTransactionDrafts((current) => ({
      ...current,
      [subcategory.id]: {
        ...transaction,
        paymentMode: transaction.date?.slice(8, 10) || '01',
        monthPaymentModes: transaction.monthPaymentModes
          ? [...transaction.monthPaymentModes]
          : new Array(12).fill(''),
        values: [...transaction.values],
      },
    }));

    setExpandedSubcategories((current) => new Set(current).add(subcategory.id));
  };

  const editBudgetTransactionDraft = (
    subcategory: Line,
    update: Partial<TransactionDetail>,
  ) => {
    setBudgetTransactionDrafts((current) => {
      const draft = current[subcategory.id];
      if (!draft) return current;
      return {
        ...current,
        [subcategory.id]: {
          ...draft,
          ...update,
        },
      };
    });
  };

  const editBudgetTransactionDraftAmount = (
    subcategory: Line,
    month: number,
    input: string,
  ) => {
    setBudgetTransactionDrafts((current) => {
      const draft = current[subcategory.id];
      if (!draft) return current;

      const values = [...draft.values];
      values[month] = Math.max(0, Number(input) || 0);

      return {
        ...current,
        [subcategory.id]: {
          ...draft,
          values,
        },
      };
    });
  };

  const cancelBudgetTransactionDraft = (subcategory: Line) => {
    setBudgetTransactionDrafts((current) => {
      const next = { ...current };
      delete next[subcategory.id];
      return next;
    });
  };

  const commitBudgetTransactionDraft = async (subcategory: Line) => {
    const draft = budgetTransactionDrafts[subcategory.id];

    if (!draft || total(draft.values) <= 0) {
      window.alert('Enter at least one monthly amount greater than zero.');
      return;
    }

    if (mode === 'actual') {
      const parent = (Object.keys(sections) as Section[])
        .flatMap((section) =>
          sections[section].map((category) => ({
            section,
            category,
          })),
        )
        .find(({ category }) =>
          category.subcategories.some((item) => item.id === subcategory.id),
        );

      if (!parent) {
        window.alert('Could not identify the transaction category.');
        return;
      }

      try {
        for (let month = 0; month < 12; month += 1) {
          const amount = Number(draft.values[month]) || 0;
          if (amount <= 0) continue;

          const day = Math.min(
            Number(draft.date.slice(8, 10)) || 1,
            new Date(selectedYear, month + 1, 0).getDate(),
          );

          const date = `${selectedYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

          await api.post('/transactions', {
            date,
            type: parent.section === 'income' ? 'income' : 'expense',
            category: parent.category.name,
            subcategory: subcategory.name,
            amount,
            paymentMode: draft.monthPaymentModes?.[month]?.trim() || defaultPaymentMode,
            card: null,
            description: draft.name.trim() || 'Transaction',
          });
        }

        cancelBudgetTransactionDraft(subcategory);
        await loadAllData();
      } catch (error: any) {
        window.alert(
          error.response?.data?.message ||
            'Transaction could not be saved. Make sure the backend is running.',
        );
      }
      return;
    }

    const nextTransaction: TransactionDetail = {
      ...draft,
      name: draft.name.trim() || 'Transaction',
      date: draft.date || `${selectedYear}-01-01`,
    };

    const existingList = budgetTransactions[subcategory.id] || [];
    const existingIndex = existingList.findIndex(
      (transaction) => transaction.id === draft.id,
    );

    let nextList: TransactionDetail[];
    if (existingIndex >= 0) {
      nextList = [...existingList];
      nextList[existingIndex] = nextTransaction;
    } else {
      nextList = [...existingList, nextTransaction];
    }

    const next = {
      ...budgetTransactions,
      [subcategory.id]: nextList,
    };

    setBudgetTransactions(next);
    localStorage.setItem(
      `fintrack-budget-transactions-${selectedYear}`,
      JSON.stringify(next),
    );

    cancelBudgetTransactionDraft(subcategory);
  };

  const handleBudgetTransactionDraftKeyDown = (
    event: React.KeyboardEvent,
    subcategory: Line,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitBudgetTransactionDraft(subcategory);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelBudgetTransactionDraft(subcategory);
    }
  };

  const removeBudgetTransaction = (
    subcategory: Line,
    transactionId: string,
  ) => {
    const next = {
      ...budgetTransactions,
      [subcategory.id]: (budgetTransactions[subcategory.id] || []).filter(
        (transaction) => transaction.id !== transactionId,
      ),
    };

    setBudgetTransactions(next);
    localStorage.setItem(
      `fintrack-budget-transactions-${selectedYear}`,
      JSON.stringify(next),
    );
  };

  const drawBudgetTransactionDraft = (
    subcategory: Line,
    draft: TransactionDetail,
  ) => {
    const dayValue =
      draft.paymentMode !== undefined
        ? draft.paymentMode
        : draft.date?.slice(8, 10) || '01';

    const monthModes = draft.monthPaymentModes || new Array(12).fill('');

    const getMonthModeLabel = (pm: string) => {
      if (!pm) return PAYMENT_MODES.find((p) => p.value === defaultPaymentMode)?.label || 'UPI';
      return PAYMENT_MODES.find((p) => p.value === pm)?.label || pm;
    };

    return (
      <React.Fragment key={`${draft.id}:draft`}>
        <tr className="budget-transaction-row budget-transaction-edit-row">
          <td className="sticky-col budget-transaction-label budget-transaction-edit-label">
            <input
              className="budget-transaction-day-input"
              type="text"
              value={dayValue}
              onChange={(event) => {
                const raw = event.target.value.replace(/\D/g, '').slice(0, 2);
                const num = raw ? Math.min(31, Math.max(1, Number(raw))) : '';
                const padded = num ? String(num).padStart(2, '0') : '';
                const newDate = `${selectedYear}-01-${padded || '01'}`;
                editBudgetTransactionDraft(subcategory, {
                  paymentMode: raw,
                  date: newDate,
                });
              }}
              onKeyDown={(event) => handleBudgetTransactionDraftKeyDown(event, subcategory)}
              placeholder="Day"
              aria-label="Day"
              maxLength={2}
              autoFocus
            />

            <input
              className="budget-transaction-description-input"
              type="text"
              value={draft.name}
              onChange={(event) =>
                editBudgetTransactionDraft(subcategory, { name: event.target.value })
              }
              onKeyDown={(event) => handleBudgetTransactionDraftKeyDown(event, subcategory)}
              placeholder="Description"
              aria-label="Transaction description"
            />
          </td>

          {MONTHS.map((_, month) => (
            <td key={month} className="budget-transaction-amount-cell">
              <input
                className="budget-transaction-amount-input"
                aria-label={`${subcategory.name} ${MONTHS[month]} ${
                  mode === 'actual' ? 'actual transaction' : 'planned amount'
                }`}
                value={draft.values[month] || ''}
                onChange={(event) =>
                  editBudgetTransactionDraftAmount(subcategory, month, event.target.value)
                }
                onKeyDown={(event) => handleBudgetTransactionDraftKeyDown(event, subcategory)}
                placeholder="₹"
                inputMode="decimal"
              />
            </td>
          ))}

          <td
            className="col-year-total budget-transaction-actions-cell"
            rowSpan={mode === 'actual' ? 2 : 1}
          >
            <div className="budget-transaction-actions-inner">
              <button
                type="button"
                className="budget-inline-save"
                onClick={() => void commitBudgetTransactionDraft(subcategory)}
                disabled={total(draft.values) <= 0}
              >
                Add
              </button>

              <button
                type="button"
                className="budget-inline-cancel"
                onClick={() => cancelBudgetTransactionDraft(subcategory)}
                aria-label="Cancel transaction"
              >
                ×
              </button>
            </div>
          </td>
        </tr>

        {mode === 'actual' && (
          <tr className="budget-transaction-row budget-transaction-paymode-row">
            <td className="sticky-col budget-transaction-label budget-transaction-paymode-label">
              <button
                type="button"
                className="budget-set-all-btn"
                onClick={() => {
                  const commonSelect = document.getElementById(
                    `common-paymode-${draft.id}`,
                  ) as HTMLSelectElement | null;
                  const commonValue = commonSelect?.value || defaultPaymentMode;
                  editBudgetTransactionDraft(subcategory, {
                    monthPaymentModes: new Array(12).fill(commonValue),
                  });
                }}
              >
                Set to all
              </button>
              <select
                id={`common-paymode-${draft.id}`}
                className="budget-paymode-select budget-paymode-common"
                defaultValue={defaultPaymentMode}
              >
                {PAYMENT_MODES.map((pm) => (
                  <option key={pm.value} value={pm.value}>
                    {pm.label}
                  </option>
                ))}
              </select>
            </td>

            {MONTHS.map((_, month) => (
              <td key={month} className="budget-transaction-paymode-cell">
                <select
                  className="budget-paymode-select"
                  value={monthModes[month] || ''}
                  onChange={(event) => {
                    const updated = [...monthModes];
                    updated[month] = event.target.value;
                    editBudgetTransactionDraft(subcategory, {
                      monthPaymentModes: updated,
                    });
                  }}
                  title={`${MONTHS[month]} payment mode: ${getMonthModeLabel(monthModes[month])}`}
                >
                  <option value="">
                    {PAYMENT_MODES.find((p) => p.value === defaultPaymentMode)?.label || 'UPI'}
                  </option>
                  {PAYMENT_MODES.map((pm) => (
                    <option key={pm.value} value={pm.value}>
                      {pm.label}
                    </option>
                  ))}
                </select>
              </td>
            ))}
          </tr>
        )}
      </React.Fragment>
    );
  };

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSubcategory = (id: string) =>
    setExpandedSubcategories((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const removeCategory = (section: Section, categoryId: string) => {
    if (
      !window.confirm(
        'Remove this category and its subcategories from the budget plan? Actual transactions will not be deleted.',
      )
    ) {
      return;
    }

    setSections((current) => ({
      ...current,
      [section]: current[section].filter((category) => category.id !== categoryId),
    }));
  };

  const removeSubcategory = (
    section: Section,
    categoryId: string,
    subcategoryId: string,
  ) => {
    if (
      !window.confirm(
        'Remove this subcategory from the budget plan? Actual transactions will not be deleted.',
      )
    ) {
      return;
    }

    setSections((current) => ({
      ...current,
      [section]: current[section].map((category) =>
        category.id === categoryId
          ? {
              ...category,
              subcategories: category.subcategories.filter(
                (subcategory) => subcategory.id !== subcategoryId,
              ),
            }
          : category,
      ),
    }));
  };

  const addCategory = async (section: Section) => {
    const name = window.prompt('New category name');
    if (!name?.trim()) return;

    try {
      await api.post('/categories', {
        name: name.trim(),
        type: section,
      });
      await loadAllData();
    } catch {
      window.alert('Category could not be saved. Make sure the backend is running.');
    }
  };

  const addSubcategory = async (section: Section, category: Category) => {
    const name = window.prompt(`New subcategory for ${category.name}`);
    if (!name?.trim()) return;

    try {
      let categoryId = category.categoryId;

      if (!categoryId) {
        try {
          const result = await api.post('/categories', {
            name: category.name,
            type: section,
          });
          categoryId = result.data.data.id;
        } catch (error: any) {
          if (error.response?.status !== 409) throw error;
          const existing = await api.get('/categories', {
            params: { type: section },
          });
          categoryId = existing.data?.data?.find(
            (item: ApiCategory) => item.name === category.name,
          )?.id;
          if (!categoryId) throw error;
        }
      }

      await api.post('/subcategories', {
        categoryId,
        name: name.trim(),
      });

      await loadAllData();
      setExpanded((current) => new Set(current).add(category.id));
    } catch (error: any) {
      window.alert(
        error.response?.data?.message ||
          'Subcategory could not be saved. Make sure the backend is running.',
      );
    }
  };

  const drawSection = (
    section: Section,
    title: string,
    icon: React.ReactNode,
  ) => {
    const totals = sectionTotals(section);
    const open = sectionOpen[section];

    return (
      <React.Fragment key={section}>
        <tr
          className={`budget-section-row budget-section-${section}`}
          onClick={() =>
            setSectionOpen((current) => ({
              ...current,
              [section]: !current[section],
            }))
          }
        >
          <td className="sticky-col budget-section-label">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {icon}
            <span>{title}</span>
          </td>

          {MONTHS.map((_, month) => (
            <td key={month}>{cell(totals[month])}</td>
          ))}

          <td className="col-year-total">{currency(total(totals))}</td>
        </tr>

        {open &&
          sections[section].map((category) => {
            const isOpen = expanded.has(category.id);
            const values = categoryValues(category);

            return (
              <React.Fragment key={category.id}>
                <tr className="budget-category-row" onClick={() => toggle(category.id)}>
                  <td className="sticky-col budget-category-label">
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span>{category.name}</span>

                    {mode === 'budget' && (
                      <button
                        className="budget-delete-button"
                        type="button"
                        title="Remove category from budget"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeCategory(section, category.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>

                  {MONTHS.map((_, month) => (
                    <td key={month}>{cell(values[month])}</td>
                  ))}

                  <td className="col-year-total">{currency(total(values))}</td>
                </tr>

                {isOpen &&
                  category.subcategories.map((subcategory) => {
                    const subcategoryValues = leafValues(subcategory);
                    const detailsOpen = expandedSubcategories.has(subcategory.id);

                    const details =
                      mode === 'actual'
                        ? subcategory.transactions || []
                        : budgetTransactions[subcategory.id] || [];

                    return (
                      <React.Fragment key={subcategory.id}>
                        <tr
                          className="budget-subcategory-row has-transaction-details"
                          onClick={() => toggleSubcategory(subcategory.id)}
                        >
                          <td className="sticky-col budget-subcategory-label">
                            {detailsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            <span>{subcategory.name}</span>

                            {mode === 'budget' && (
                              <div className="budget-row-actions">
                                <button
                                  className="budget-inline-add-btn"
                                  type="button"
                                  title="Add transaction"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    beginBudgetTransaction(subcategory);
                                  }}
                                >
                                  <Plus size={13} />
                                </button>
                                <button
                                  className="budget-delete-button"
                                  type="button"
                                  title="Remove subcategory from budget"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeSubcategory(section, category.id, subcategory.id);
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </td>

                          {MONTHS.map((_, month) => (
                            <td key={month}>{cell(subcategoryValues[month])}</td>
                          ))}

                          <td className="col-year-total">
                            {currency(total(subcategoryValues))}
                          </td>
                        </tr>

                        {detailsOpen &&
                          [...details]
                            .filter(
                              (detail) =>
                                detail.id !== budgetTransactionDrafts[subcategory.id]?.id,
                            )
                            .sort((a, b) => {
                              const dayA = Number(String(a.date || '').slice(8, 10)) || 1;
                              const dayB = Number(String(b.date || '').slice(8, 10)) || 1;
                              if (dayA !== dayB) return dayA - dayB;
                              const cmpDate = (a.date || '').localeCompare(b.date || '');
                              if (cmpDate !== 0) return cmpDate;
                              return (a.name || '').localeCompare(b.name || '');
                            })
                            .map((detail) => (
                              <tr className="budget-transaction-row" key={detail.id}>
                                <td className="sticky-col budget-transaction-label">
                                  <small>{detail.date.slice(8, 10) || '01'}</small>
                                  <span>{detail.name}</span>

                                  {mode === 'budget' && (
                                    <div className="budget-row-actions">
                                      <button
                                        className="budget-edit-button"
                                        type="button"
                                        title="Edit transaction"
                                        onClick={() =>
                                          beginEditExistingTransaction(subcategory, detail)
                                        }
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        className="budget-delete-button"
                                        type="button"
                                        title="Delete planned transaction"
                                        onClick={() =>
                                          removeBudgetTransaction(subcategory, detail.id)
                                        }
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </td>

                                {MONTHS.map((_, month) => (
                                  <td key={month}>{cell(detail.values[month] || 0)}</td>
                                ))}

                                <td className="col-year-total">
                                  {currency(total(detail.values))}
                                </td>
                              </tr>
                            ))}

                        {detailsOpen &&
                          budgetTransactionDrafts[subcategory.id] &&
                          drawBudgetTransactionDraft(
                            subcategory,
                            budgetTransactionDrafts[subcategory.id],
                          )}

                        {detailsOpen && !budgetTransactionDrafts[subcategory.id] && (
                          <tr
                            className={`budget-add-row budget-add-transaction-row budget-add-transaction-${section}`}
                          >
                            <td className="sticky-col">
                              <button
                                type="button"
                                onClick={() => beginBudgetTransaction(subcategory)}
                              >
                                <Plus size={14} />
                                Add transaction
                              </button>
                            </td>
                            <td colSpan={13} />
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                {isOpen && (
                  <tr className="budget-add-row budget-add-subcategory-row">
                    <td className="sticky-col">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          addSubcategory(section, category);
                        }}
                      >
                        <Plus size={14} />
                        Add subcategory
                      </button>
                    </td>
                    <td colSpan={13} />
                  </tr>
                )}
              </React.Fragment>
            );
          })}

        {open && (
          <tr className="budget-add-row budget-add-category-row">
            <td className="sticky-col">
              <button type="button" onClick={() => addCategory(section)}>
                <CirclePlus size={14} />
                Add category
              </button>
            </td>
            <td colSpan={13} />
          </tr>
        )}
      </React.Fragment>
    );
  };

  const incomeTotals = sectionTotals('income');
  const expenseTotals = sectionTotals('expense');

  return (
    <main className="budget-planning-page" style={{ paddingBottom: 60 }}>
      {/* Top Header / View Mode Bar */}
      <div className="budget-toolbar" style={{ flexWrap: 'wrap', gap: 14 }}>
        <div className="budget-heading">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Budget & Transactions
          </h1>
          <span className="budget-heading-divider" />
          <span>Annual planning & transaction records</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* View Mode Switcher */}
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-btn ${viewMode === 'combined' ? 'active' : ''}`}
              onClick={() => setViewMode('combined')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Layers size={14} />
              <span>Combined</span>
            </button>
            <button
              type="button"
              className={`segmented-btn ${viewMode === 'budget' ? 'active' : ''}`}
              onClick={() => setViewMode('budget')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <TableIcon size={14} />
              <span>Budget Planner</span>
            </button>
            <button
              type="button"
              className={`segmented-btn ${viewMode === 'transactions' ? 'active' : ''}`}
              onClick={() => setViewMode('transactions')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ReceiptText size={14} />
              <span>Transactions</span>
            </button>
          </div>

          {/* Add Transaction Button */}
          <button
            className="btn-primary"
            onClick={() => onOpenNewTransaction()}
            style={{ padding: '7px 14px', fontSize: 13 }}
          >
            <Plus size={16} />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: BUDGET PLANNER */}
      {(viewMode === 'combined' || viewMode === 'budget') && (
        <section style={{ marginBottom: viewMode === 'combined' ? 40 : 0 }}>
          {/* Sub-toolbar for Planner controls */}
          <div
            style={{
              padding: '16px 28px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'var(--accent-indigo)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TableIcon size={16} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Annual Budget Planner
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                ({selectedYear})
              </span>
            </div>

            <div className="budget-toolbar-actions" style={{ gap: 10 }}>
              {/* Year controls */}
              <div className="budget-year-control">
                <button
                  className="year-arrow"
                  type="button"
                  onClick={() => setSelectedYear((year) => year - 1)}
                  aria-label="Previous year"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="segmented-control budget-year-selector">
                  {yearChoices.map((year) => (
                    <button
                      key={year}
                      className={`segmented-btn ${selectedYear === year ? 'active' : ''}`}
                      onClick={() => setSelectedYear(year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>

                <button
                  className="year-arrow"
                  type="button"
                  onClick={() => setSelectedYear((year) => year + 1)}
                  aria-label="Next year"
                >
                  <ChevronRight size={16} />
                </button>

                <div className="year-picker-wrap">
                  <button
                    className="year-picker-button"
                    type="button"
                    onClick={() => setShowYearPicker((open) => !open)}
                    aria-label="Choose year"
                  >
                    <CalendarDays size={16} />
                  </button>

                  {showYearPicker && (
                    <div className="year-picker-popover">
                      <span>Choose year</span>
                      <div>
                        {pickerYears.map((year) => (
                          <button
                            key={year}
                            className={year === selectedYear ? 'active' : ''}
                            onClick={() => {
                              setSelectedYear(year);
                              setShowYearPicker(false);
                            }}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mode Toggle: Actual vs Budget */}
              <div className="budget-mode-toggle">
                <button
                  type="button"
                  className={mode === 'actual' ? 'active' : ''}
                  onClick={() => setMode('actual')}
                >
                  Actual
                </button>
                <button
                  type="button"
                  className={mode === 'budget' ? 'active' : ''}
                  onClick={() => setMode('budget')}
                >
                  Budget
                </button>
              </div>

              <button
                className="budget-add-entry"
                onClick={() => onOpenNewTransaction()}
              >
                <Plus size={15} />
                <span>Add entry</span>
              </button>
            </div>
          </div>

          {/* Spreadsheet Table */}
          <div className="spreadsheet-container">
            <table className="spreadsheet-table budget-table-fit">
              <colgroup>
                <col style={{ width: '18%' }} />
                {MONTHS.map((month) => (
                  <col key={month} style={{ width: '6.25%' }} />
                ))}
                <col style={{ width: '7%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky-col budget-category-head">
                    <CalendarDays size={14} />
                    <span>Category</span>
                  </th>
                  {MONTHS.map((month) => (
                    <th key={month} style={{ textAlign: 'right' }}>{month}</th>
                  ))}
                  <th className="col-year-total" style={{ textAlign: 'right' }}>{selectedYear}</th>
                </tr>
              </thead>

              <tbody>
                {drawSection('income', 'INCOME', <TrendingUp size={15} />)}
                {drawSection('savings', 'SAVINGS & INVESTMENTS', <PiggyBank size={15} />)}
                {drawSection('expense', 'EXPENSES', <TrendingDown size={15} />)}

                <tr className="net-cashflow-row">
                  <td className="sticky-col">NET CASH FLOW</td>
                  {MONTHS.map((_, month) => {
                    const value = incomeTotals[month] - expenseTotals[month];
                    return (
                      <td key={month} className={value >= 0 ? 'positive' : 'negative'}>
                        {cell(value)}
                      </td>
                    );
                  })}
                  <td className="col-year-total">
                    {currency(total(incomeTotals) - total(expenseTotals))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SECTION 2: TRANSACTIONS LEDGER */}
      {(viewMode === 'combined' || viewMode === 'transactions') && (
        <section id="transactions-ledger-section">
          <div
            style={{
              padding: viewMode === 'combined' ? '20px 28px 12px' : '16px 28px 12px',
              borderTop: viewMode === 'combined' ? '1px solid var(--border-color)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--accent-green)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ReceiptText size={16} />
              </div>
              <div>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Transactions Ledger
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    marginLeft: 8,
                  }}
                >
                  Search, filter, and track individual income & expense items
                </span>
              </div>
            </div>

            <div className="segmented-control">
              <button
                className={`segmented-btn ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                All
              </button>
              <button
                className={`segmented-btn ${filterType === 'income' ? 'active' : ''}`}
                onClick={() => setFilterType('income')}
              >
                Income
              </button>
              <button
                className={`segmented-btn ${filterType === 'expense' ? 'active' : ''}`}
                onClick={() => setFilterType('expense')}
              >
                Expenses
              </button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div
            style={{
              padding: '0 28px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 260,
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                padding: '10px 14px',
                gap: 10,
              }}
            >
              <Search size={16} style={{ color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search by category, subcategory, date, description, amount..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  width: '100%',
                  fontSize: 13,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 2,
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter size={15} style={{ color: 'var(--text-secondary)' }} />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {categoryFilterOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#EF4444',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Clear Filters
              </button>
            )}

            <div
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                padding: '8px 12px',
                borderRadius: 8,
              }}
            >
              Showing {filteredTransactions.length} of {rawTransactions.length} transactions
            </div>
          </div>

          {/* Transactions Table */}
          <div style={{ padding: '0 28px 20px' }}>
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="spreadsheet-table" style={{ width: '100%', textAlign: 'left', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '5%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'left' }}>Type</th>
                      <th style={{ textAlign: 'left' }}>Category</th>
                      <th style={{ textAlign: 'left' }}>Description</th>
                      <th style={{ textAlign: 'left' }}>Payment Mode</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTransactions ? (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            textAlign: 'center',
                            padding: '40px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          Loading transactions...
                        </td>
                      </tr>
                    ) : filteredTransactions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            textAlign: 'center',
                            padding: '40px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          No transactions found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((t, idx) => (
                        <tr key={t.id || idx}>
                          <td style={{ color: 'var(--text-secondary)' }}>{t.date}</td>
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 700,
                                background:
                                  t.type === 'income'
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : 'rgba(239, 68, 68, 0.15)',
                                color: t.type === 'income' ? '#10B981' : '#EF4444',
                              }}
                            >
                              {t.type === 'income' ? (
                                <ArrowUpRight size={14} />
                              ) : (
                                <ArrowDownRight size={14} />
                              )}
                              {t.type ? String(t.type).toUpperCase() : ''}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.category}</div>
                            {t.subcategory ? (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  fontWeight: 400,
                                  marginTop: 2,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {t.subcategory}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description || ''}>
                            {t.description || '—'}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                color: 'var(--text-secondary)',
                                fontSize: 13,
                              }}
                            >
                              <CreditCard size={14} />
                              {(t.paymentMode || 'UPI').toUpperCase()}
                              {t.card ? ` (${t.card})` : ''}
                            </span>
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color: t.type === 'income' ? '#10B981' : '#EF4444',
                            }}
                          >
                            {t.type === 'income' ? '+' : '-'}
                            {currency(t.amount)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeleteTransaction(t.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: 4,
                                borderRadius: 4,
                                transition: 'color 0.2s',
                              }}
                              title="Delete transaction"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
};
