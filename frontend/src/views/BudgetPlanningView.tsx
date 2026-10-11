import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  PiggyBank,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import api from '../services/api';

interface BudgetPlanningViewProps {
  onOpenNewTransaction: (...args: any[]) => void;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DEFAULTS = {
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

type Section = 'income' | 'savings' | 'expense';
type Mode = 'actual' | 'budget';

interface Line {
  id: string;
  name: string;
  values: number[];
  transactions?: TransactionDetail[];
}

interface TransactionDetail extends Line {
  date: string;
  paymentMode?: string;
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

export const BudgetPlanningView: React.FC<BudgetPlanningViewProps> = ({
  onOpenNewTransaction,
}) => {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [mode, setMode] = useState<Mode>('budget');

  const [sections, setSections] = useState<Record<Section, Category[]>>({
    income: [],
    savings: [],
    expense: [],
  });

  const [sectionOpen, setSectionOpen] = useState<
    Record<Section, boolean>
  >({
    income: true,
    savings: true,
    expense: true,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] =
    useState<Set<string>>(new Set());

  const [budgetValues, setBudgetValues] = useState<
    Record<string, number[]>
  >({});

  const [budgetTransactions, setBudgetTransactions] = useState<
    Record<string, TransactionDetail[]>
  >({});

  const [budgetTransactionDrafts, setBudgetTransactionDrafts] = useState<
    Record<string, TransactionDetail>
  >({});

  const [showYearPicker, setShowYearPicker] = useState(false);

  useEffect(() => {
    loadPlanner();
  }, [selectedYear]);

  useEffect(() => {
    const stored = localStorage.getItem(
      `fintrack-budget-${selectedYear}`,
    );
    setBudgetValues(stored ? JSON.parse(stored) : {});
  }, [selectedYear]);

  useEffect(() => {
    const stored = localStorage.getItem(
      `fintrack-budget-transactions-${selectedYear}`,
    );
    setBudgetTransactions(stored ? JSON.parse(stored) : {});
  }, [selectedYear]);

  const loadPlanner = async () => {
    try {
      const [
        transactionsResult,
        categoriesResult,
        subcategoriesResult,
      ] = await Promise.all([
        api.get('/transactions'),
        api
          .get('/categories')
          .catch(() => ({ data: { data: [] } })),
        api
          .get('/subcategories')
          .catch(() => ({ data: { data: [] } })),
      ]);

      const transactions = transactionsResult.data?.success
        ? transactionsResult.data.data
        : [];

      const categories = categoriesResult.data?.success
        ? categoriesResult.data.data
        : [];

      const subcategories = subcategoriesResult.data?.success
        ? subcategoriesResult.data.data
        : [];

      setSections(
        makeSections(transactions, categories, subcategories),
      );
    } catch {
      setSections(makeSections([], [], []));
    }
  };

  const makeSections = (
    transactions: any[],
    apiCategories: ApiCategory[],
    apiSubcategories: ApiSubcategory[],
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
      let found = category.subcategories.find(
        (item) => item.name === name,
      );

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

    (Object.keys(DEFAULTS) as Section[]).forEach((section) =>
      DEFAULTS[section].forEach((name) =>
        ensureCategory(section, name),
      ),
    );

    apiCategories.forEach((category) => {
      const section: Section =
        category.type === 'income'
          ? 'income'
          : category.type === 'savings'
            ? 'savings'
            : 'expense';

      ensureCategory(section, category.name, category.id);
    });

    apiSubcategories.forEach((subcategory) => {
      const parent = apiCategories.find(
        (category) => category.id === subcategory.categoryId,
      );

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
      .filter((item) =>
        String(item.date || '').startsWith(String(selectedYear)),
      )
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
          name:
            item.description ||
            item.subcategory ||
            'Transaction',
          date: String(item.date),
          values: MONTHS.map((_, index) =>
            index === month ? amount : 0,
          ),
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

  const yearChoices = [
    selectedYear - 1,
    selectedYear,
    selectedYear + 1,
  ];

  const pickerYears = Array.from(
    { length: 12 },
    (_, index) => selectedYear - 5 + index,
  );

  const currency = (value: number) =>
    `₹${Math.round(value || 0).toLocaleString('en-IN')}`;

  const cell = (value: number) =>
    value ? currency(value) : '—';

  const total = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0);

  const budgetTransactionValues = (line: Line) =>
    MONTHS.map((_, month) =>
      (budgetTransactions[line.id] || []).reduce(
        (sum, transaction) =>
          sum + (transaction.values[month] || 0),
        0,
      ),
    );

  const leafValues = (line: Line) =>
    mode === 'actual'
      ? line.values
      : MONTHS.map(
          (_, month) =>
            (budgetValues[line.id]?.[month] || 0) +
            budgetTransactionValues(line)[month],
        );

  const categoryValues = (category: Category) =>
    mode === 'actual'
      ? category.values
      : MONTHS.map((_, month) =>
          category.subcategories.reduce(
            (sum, subcategory) =>
              sum + leafValues(subcategory)[month],
            0,
          ),
        );

  const sectionTotals = (section: Section) =>
    MONTHS.map((_, month) =>
      sections[section].reduce(
        (sum, category) =>
          sum + categoryValues(category)[month],
        0,
      ),
    );

  const editBudget = (
    line: Line,
    month: number,
    input: string,
  ) => {
    const next = {
      ...budgetValues,
      [line.id]: [...(budgetValues[line.id] || zeros())],
    };

    next[line.id][month] = Math.max(0, Number(input) || 0);

    setBudgetValues(next);

    localStorage.setItem(
      `fintrack-budget-${selectedYear}`,
      JSON.stringify(next),
    );
  };

  const beginBudgetTransaction = (subcategory: Line) => {
    if (budgetTransactionDrafts[subcategory.id]) return;

    setBudgetTransactionDrafts((current) => ({
      ...current,
      [subcategory.id]: {
        id: `transaction-draft:${Date.now()}`,
        name: '',
        date: `${selectedYear}-01-01`,
        paymentMode: '',
        values: zeros(),
      },
    }));

    setExpandedSubcategories(
      (current) => new Set(current).add(subcategory.id),
    );
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

  const commitBudgetTransactionDraft = async (
    subcategory: Line,
  ) => {
    const draft = budgetTransactionDrafts[subcategory.id];

    if (!draft || total(draft.values) <= 0) {
      window.alert('Enter at least one monthly amount greater than zero.');
      return;
    }

    if (mode === 'actual') {
      const parent = (
        Object.keys(sections) as Section[]
      )
        .flatMap((section) =>
          sections[section].map((category) => ({
            section,
            category,
          })),
        )
        .find(({ category }) =>
          category.subcategories.some(
            (item) => item.id === subcategory.id,
          ),
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

          const date = `${selectedYear}-${String(
            month + 1,
          ).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

          await api.post('/transactions', {
            date,
            type:
              parent.section === 'income'
                ? 'income'
                : 'expense',
            category: parent.category.name,
            subcategory: subcategory.name,
            amount,
            paymentMode: draft.paymentMode?.trim() || 'upi',
            card: null,
            description: draft.name.trim() || 'Transaction',
          });
        }

        cancelBudgetTransactionDraft(subcategory);
        await loadPlanner();
      } catch (error: any) {
        window.alert(
          error.response?.data?.message ||
            'Transaction could not be saved. Make sure the backend is running.',
        );
      }

      return;
    }

    const nextTransaction = {
      ...draft,
      name: draft.name.trim() || 'Planned transaction',
    };

    const next = {
      ...budgetTransactions,
      [subcategory.id]: [
        ...(budgetTransactions[subcategory.id] || []),
        nextTransaction,
      ],
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
      [subcategory.id]: (
        budgetTransactions[subcategory.id] || []
      ).filter(
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
  ) => (
    <tr
      className="budget-transaction-row budget-transaction-edit-row"
      key={`${draft.id}:draft`}
    >
      <td className="sticky-col budget-transaction-label">
        <input
          className="budget-transaction-date-input"
          type="text"
          value={draft.paymentMode || ''}
          onChange={(event) =>
            editBudgetTransactionDraft(subcategory, {
              paymentMode: event.target.value,
            })
          }
          onKeyDown={(event) =>
            handleBudgetTransactionDraftKeyDown(
              event,
              subcategory,
            )
          }
          placeholder="Pay"
          aria-label="Payment mode"
          autoFocus
        />

        <input
          className="budget-transaction-description-input"
          type="text"
          value={draft.name}
          onChange={(event) =>
            editBudgetTransactionDraft(subcategory, {
              name: event.target.value,
            })
          }
          onKeyDown={(event) =>
            handleBudgetTransactionDraftKeyDown(
              event,
              subcategory,
            )
          }
          placeholder="Description"
          aria-label="Transaction description"
        />
      </td>

      {MONTHS.map((_, month) => (
        <td key={month}>
          <input
            className="budget-transaction-amount-input"
            aria-label={`${subcategory.name} ${MONTHS[month]} ${
              mode === 'actual' ? 'actual transaction' : 'planned amount'
            }`}
            value={draft.values[month] || ''}
            onChange={(event) =>
              editBudgetTransactionDraftAmount(
                subcategory,
                month,
                event.target.value,
              )
            }
            onKeyDown={(event) =>
              handleBudgetTransactionDraftKeyDown(
                event,
                subcategory,
              )
            }
            placeholder="₹"
            inputMode="decimal"
          />
        </td>
      ))}

      <td className="col-year-total">
        <button
          type="button"
          className="budget-inline-save"
          onClick={() =>
            void commitBudgetTransactionDraft(subcategory)
          }
          disabled={total(draft.values) <= 0}
        >
          Add
        </button>

        <button
          type="button"
          className="budget-inline-cancel"
          onClick={() =>
            cancelBudgetTransactionDraft(subcategory)
          }
          aria-label="Cancel transaction"
        >
          ×
        </button>
      </td>
    </tr>
  );

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

  const removeCategory = (
    section: Section,
    categoryId: string,
  ) => {
    if (
      !window.confirm(
        'Remove this category and its subcategories from the budget plan? Actual transactions will not be deleted.',
      )
    ) {
      return;
    }

    setSections((current) => ({
      ...current,
      [section]: current[section].filter(
        (category) => category.id !== categoryId,
      ),
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
                (subcategory) =>
                  subcategory.id !== subcategoryId,
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

      await loadPlanner();
    } catch {
      window.alert(
        'Category could not be saved. Make sure the backend is running.',
      );
    }
  };

  const addSubcategory = async (
    section: Section,
    category: Category,
  ) => {
    const name = window.prompt(
      `New subcategory for ${category.name}`,
    );

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
            (item: ApiCategory) =>
              item.name === category.name,
          )?.id;

          if (!categoryId) throw error;
        }
      }

      await api.post('/subcategories', {
        categoryId,
        name: name.trim(),
      });

      await loadPlanner();

      setExpanded(
        (current) => new Set(current).add(category.id),
      );
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
      <>
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
            {open ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
            {icon}
            <span>{title}</span>
          </td>

          {MONTHS.map((_, month) => (
            <td key={month}>{cell(totals[month])}</td>
          ))}

          <td className="col-year-total">
            {currency(total(totals))}
          </td>
        </tr>

        {open &&
          sections[section].map((category) => {
            const isOpen = expanded.has(category.id);
            const values = categoryValues(category);

            return (
              <React.Fragment key={category.id}>
                <tr
                  className="budget-category-row"
                  onClick={() => toggle(category.id)}
                >
                  <td className="sticky-col budget-category-label">
                    {isOpen ? (
                      <ChevronDown size={15} />
                    ) : (
                      <ChevronRight size={15} />
                    )}

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

                  <td className="col-year-total">
                    {currency(total(values))}
                  </td>
                </tr>

                {isOpen &&
                  category.subcategories.map((subcategory) => {
                    const subcategoryValues = leafValues(subcategory);
                    const detailsOpen = expandedSubcategories.has(
                      subcategory.id,
                    );

                    const details =
                      mode === 'actual'
                        ? subcategory.transactions || []
                        : budgetTransactions[subcategory.id] || [];

                    return (
                      <React.Fragment key={subcategory.id}>
                        <tr
                          className="budget-subcategory-row has-transaction-details"
                          onClick={() =>
                            toggleSubcategory(subcategory.id)
                          }
                        >
                          <td className="sticky-col budget-subcategory-label">
                            {detailsOpen ? (
                              <ChevronDown size={13} />
                            ) : (
                              <ChevronRight size={13} />
                            )}

                            <span>{subcategory.name}</span>

                            {mode === 'budget' && (
                              <button
                                className="budget-delete-button"
                                type="button"
                                title="Remove subcategory from budget"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeSubcategory(
                                    section,
                                    category.id,
                                    subcategory.id,
                                  );
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>

                          {MONTHS.map((_, month) => (
                            <td key={month}>
                              {mode === 'budget' ? (
                                <input
                                  aria-label={`${subcategory.name} ${MONTHS[month]} budget`}
                                  value={
                                    (budgetValues[subcategory.id] ||
                                      zeros())[month] || ''
                                  }
                                  onClick={(event) =>
                                    event.stopPropagation()
                                  }
                                  onChange={(event) =>
                                    editBudget(
                                      subcategory,
                                      month,
                                      event.target.value,
                                    )
                                  }
                                  placeholder="₹"
                                  inputMode="decimal"
                                />
                              ) : (
                                cell(subcategoryValues[month])
                              )}
                            </td>
                          ))}

                          <td className="col-year-total">
                            {currency(total(subcategoryValues))}
                          </td>
                        </tr>

                        {detailsOpen &&
                          details.map((detail) => (
                            <tr
                              className="budget-transaction-row"
                              key={detail.id}
                            >
                              <td className="sticky-col budget-transaction-label">
                                <small>
                                  {detail.date.slice(8, 10)}
                                </small>

                                <span>{detail.name}</span>

                                {mode === 'budget' && (
                                  <button
                                    className="budget-delete-button"
                                    type="button"
                                    title="Delete planned transaction"
                                    onClick={() =>
                                      removeBudgetTransaction(
                                        subcategory,
                                        detail.id,
                                      )
                                    }
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </td>

                              {MONTHS.map((_, month) => (
                                <td key={month}>
                                  {cell(detail.values[month] || 0)}
                                </td>
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

                        {detailsOpen && (
                          <tr className="budget-add-row">
                            <td className="sticky-col">
                              <button
                                type="button"
                                onClick={() =>
                                  beginBudgetTransaction(subcategory)
                                }
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
                  <tr className="budget-add-row">
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
          <tr className="budget-add-row">
            <td className="sticky-col">
              <button
                type="button"
                onClick={() => addCategory(section)}
              >
                <CirclePlus size={14} />
                Add category
              </button>
            </td>
            <td colSpan={13} />
          </tr>
        )}
      </>
    );
  };

  const incomeTotals = sectionTotals('income');
  const expenseTotals = sectionTotals('expense');

  return (
    <main className="budget-planning-page">
      <div className="budget-toolbar">
        <div className="budget-heading">
          <h1>Budget Planning</h1>
          <span className="budget-heading-divider" />
          <span>{selectedYear} — Personal Finance</span>
        </div>

        <div className="budget-toolbar-actions">
          <div className="budget-year-control">
            <button
              className="year-arrow"
              type="button"
              onClick={() =>
                setSelectedYear((year) => year - 1)
              }
              aria-label="Previous year"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="segmented-control budget-year-selector">
              {yearChoices.map((year) => (
                <button
                  key={year}
                  className={`segmented-btn ${
                    selectedYear === year ? 'active' : ''
                  }`}
                  onClick={() => setSelectedYear(year)}
                >
                  {year}
                </button>
              ))}
            </div>

            <button
              className="year-arrow"
              type="button"
              onClick={() =>
                setSelectedYear((year) => year + 1)
              }
              aria-label="Next year"
            >
              <ChevronRight size={16} />
            </button>

            <div className="year-picker-wrap">
              <button
                className="year-picker-button"
                type="button"
                onClick={() =>
                  setShowYearPicker((open) => !open)
                }
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
                        className={
                          year === selectedYear ? 'active' : ''
                        }
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
            onClick={onOpenNewTransaction}
          >
            <Plus size={17} />
            <span>Add entry</span>
          </button>
        </div>
      </div>

      <div className="spreadsheet-container">
        <table className="spreadsheet-table">
          <thead>
            <tr>
              <th className="sticky-col budget-category-head">
                <CalendarDays size={15} />
                Category
              </th>

              {MONTHS.map((month) => (
                <th key={month}>{month}</th>
              ))}

              <th className="col-year-total">{selectedYear}</th>
            </tr>
          </thead>

          <tbody>
            {drawSection(
              'income',
              'INCOME',
              <TrendingUp size={15} />,
            )}

            {drawSection(
              'savings',
              'SAVINGS & INVESTMENTS',
              <PiggyBank size={15} />,
            )}

            {drawSection(
              'expense',
              'EXPENSES',
              <TrendingDown size={15} />,
            )}

            <tr className="net-cashflow-row">
              <td className="sticky-col">NET CASH FLOW</td>

              {MONTHS.map((_, month) => {
                const value =
                  incomeTotals[month] - expenseTotals[month];

                return (
                  <td
                    key={month}
                    className={
                      value >= 0 ? 'positive' : 'negative'
                    }
                  >
                    {cell(value)}
                  </td>
                );
              })}

              <td className="col-year-total">
                {currency(
                  total(incomeTotals) - total(expenseTotals),
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
};