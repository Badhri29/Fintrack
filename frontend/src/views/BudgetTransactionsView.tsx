import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  Table as TableIcon,
  ReceiptText,
  Check,
  FolderPlus,
  Layers,
  Loader2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import api from '../services/api';
import { TransactionModal } from '../components/TransactionModal';
import { CategoryModal } from '../components/CategoryModal';

interface BudgetTransactionsViewProps {
  onOpenNewTransaction: (category?: string, subcategory?: string, type?: 'income' | 'expense' | 'savings') => void;
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

const getSection = (item: any): Section => {
  const type = String(item?.type || '').toLowerCase();
  const cat = String(item?.category || '').trim();

  // If item explicitly has type 'savings' or belongs to known savings categories:
  if (type === 'savings' || ['Investments', 'Savings', 'Mutual Funds', 'Emergency Fund'].includes(cat)) {
    return 'savings';
  }
  if (type === 'income' || ['Salary', 'Bonus & Incentives', 'Other Income', 'Freelance & Business'].includes(cat)) {
    return 'income';
  }
  if (type === 'expense') return 'expense';

  return 'expense';
};

export const BudgetTransactionsView: React.FC<BudgetTransactionsViewProps> = ({
  onOpenNewTransaction,
  globalSearchQuery,
  initialViewMode = 'combined',
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(
    globalSearchQuery ? 'transactions' : initialViewMode
  );
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [mode, setMode] = useState<Mode>('actual');

  // Section references for scroll-to navigation and scroll-spy
  const budgetSectionRef = useRef<HTMLElement>(null);
  const transactionsSectionRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<'budget' | 'transactions'>('budget');

  // Transactions ledger state
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [searchQuery, setSearchQuery] = useState<string>(globalSearchQuery || '');

  // Pagination state for transactions table
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Categories API state
  const [apiCategories, setApiCategories] = useState<ApiCategory[]>([]);
  const [apiSubcategories, setApiSubcategories] = useState<ApiSubcategory[]>([]);

  // Budget spreadsheet state
  const [sections, setSections] = useState<Record<Section, Category[]>>({
    income: [],
    savings: [],
    expense: [],
  });

  // Default to collapsed so sections do not expand by default
  const [sectionOpen, setSectionOpen] = useState<Record<Section, boolean>>({
    income: false,
    savings: false,
    expense: false,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());

  const [budgetValues, setBudgetValues] = useState<Record<string, number[]>>({});
  const [budgetTransactions, setBudgetTransactions] = useState<Record<string, TransactionDetail[]>>({});
  const [budgetTransactionDrafts, setBudgetTransactionDrafts] = useState<Record<string, TransactionDetail>>({});

  const [showYearPicker, setShowYearPicker] = useState<boolean>(false);
  const yearPickerRef = useRef<HTMLDivElement>(null);

  // Edit transaction modal state
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  const handleEditTransaction = (tx: any) => {
    setEditingTransaction(tx);
    setIsEditModalOpen(true);
  };

  // Category & Subcategory Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [categoryModalInitialMode, setCategoryModalInitialMode] = useState<'category' | 'subcategory'>('category');
  const [categoryModalInitialSection, setCategoryModalInitialSection] = useState<Section>('expense');
  const [categoryModalInitialCategoryName, setCategoryModalInitialCategoryName] = useState<string>('');

  // Inline Category Add State
  const [activeAddCategorySection, setActiveAddCategorySection] = useState<Section | null>(null);
  const [categoryInputName, setCategoryInputName] = useState<string>('');
  const [categoryInlineError, setCategoryInlineError] = useState<string | null>(null);
  const [isCategorySubmitting, setIsCategorySubmitting] = useState<boolean>(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  // Inline Subcategory Add State
  const [activeAddSubcategoryId, setActiveAddSubcategoryId] = useState<string | null>(null);
  const [subcategoryInputName, setSubcategoryInputName] = useState<string>('');
  const [subcategoryInlineError, setSubcategoryInlineError] = useState<string | null>(null);
  const [isSubcategorySubmitting, setIsSubcategorySubmitting] = useState<boolean>(false);
  const subcategoryInputRef = useRef<HTMLInputElement>(null);

  const modalCategoriesBySection = useMemo(() => ({
    income: (sections.income || []).map((c) => ({ id: c.categoryId, name: c.name })),
    savings: (sections.savings || []).map((c) => ({ id: c.categoryId, name: c.name })),
    expense: (sections.expense || []).map((c) => ({ id: c.categoryId, name: c.name })),
  }), [sections]);

  // Robust date parser supporting YYYY-MM-DD, DD-MM-YYYY, and timestamps
  const parseTransactionDate = (
    dateStr?: string,
  ): { year: number; month: number; day: number; formatted: string; iso: string } | null => {
    if (!dateStr) return null;
    const s = String(dateStr).trim();

    // Case 1: YYYY-MM-DD or ISO string starting with YYYY-MM-DD
    const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1; // 0-indexed (0=Jan)
      const day = parseInt(ymdMatch[3], 10);
      const dStr = String(day).padStart(2, '0');
      const mStr = String(month + 1).padStart(2, '0');
      return {
        year,
        month,
        day,
        formatted: `${dStr}-${mStr}-${year}`,
        iso: `${year}-${mStr}-${dStr}`,
      };
    }

    // Case 2: DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed (0=Jan)
      const year = parseInt(dmyMatch[3], 10);
      const dStr = String(day).padStart(2, '0');
      const mStr = String(month + 1).padStart(2, '0');
      return {
        year,
        month,
        day,
        formatted: `${dStr}-${mStr}-${year}`,
        iso: `${year}-${mStr}-${dStr}`,
      };
    }

    // Fallback Date parser
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = parsed.getMonth();
      const day = parsed.getDate();
      const dStr = String(day).padStart(2, '0');
      const mStr = String(month + 1).padStart(2, '0');
      return {
        year,
        month,
        day,
        formatted: `${dStr}-${mStr}-${year}`,
        iso: `${year}-${mStr}-${dStr}`,
      };
    }

    return null;
  };

  // Date formatter: DD-MM-YYYY
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const parsed = parseTransactionDate(dateStr);
    return parsed ? parsed.formatted : dateStr;
  };

  // Automatically close year picker popover on scroll or click outside
  useEffect(() => {
    if (!showYearPicker) return;

    const handleScroll = () => {
      setShowYearPicker(false);
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (yearPickerRef.current && !yearPickerRef.current.contains(e.target as Node)) {
        setShowYearPicker(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showYearPicker]);

  // Scroll to section helper
  const scrollToSection = (sec: 'budget' | 'transactions') => {
    if (viewMode !== 'combined') {
      setViewMode('combined');
      setTimeout(() => {
        const el = sec === 'budget' ? budgetSectionRef.current : transactionsSectionRef.current;
        if (!el) return;
        const navbarHeight = 72;
        const top = el.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
        window.scrollTo({
          top: Math.max(0, top),
          behavior: 'smooth',
        });
      }, 50);
      return;
    }

    const el = sec === 'budget' ? budgetSectionRef.current : transactionsSectionRef.current;
    if (!el) return;
    const navbarHeight = 72;
    const top = el.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });
  };

  // Scroll-spy: update active section as user crosses section boundaries
  useEffect(() => {
    if (viewMode !== 'combined') {
      setActiveSection(viewMode === 'transactions' ? 'transactions' : 'budget');
      return;
    }

    const handleScroll = () => {
      if (!transactionsSectionRef.current) return;
      const txRect = transactionsSectionRef.current.getBoundingClientRect();
      // If transactions section top is near the top sticky area (<= 140px)
      if (txRect.top <= 140) {
        setActiveSection('transactions');
      } else {
        setActiveSection('budget');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [viewMode]);

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
      .map((item) => ({ item, parsedDate: parseTransactionDate(item.date) }))
      .filter(({ parsedDate }) => parsedDate && parsedDate.year === selectedYear)
      .sort((a, b) => {
        if (a.parsedDate!.month !== b.parsedDate!.month) {
          return a.parsedDate!.month - b.parsedDate!.month;
        }
        if (a.parsedDate!.day !== b.parsedDate!.day) {
          return a.parsedDate!.day - b.parsedDate!.day;
        }
        return String(a.item.id).localeCompare(String(b.item.id));
      })
      .forEach(({ item, parsedDate }) => {
        const month = parsedDate!.month;

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
          date: parsedDate!.iso,
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
      // 1. Filter by Type (consistently using getSection)
      if (filterType !== 'all') {
        const itemSection = getSection(t);
        if (itemSection !== filterType) {
          return false;
        }
      }

      // 2. Filter by Category
      if (selectedCategory !== 'All Categories' && t.category !== selectedCategory) return false;

      // 3. Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCat = t.category && String(t.category).toLowerCase().includes(q);
        const matchSub = t.subcategory && String(t.subcategory).toLowerCase().includes(q);
        const matchDesc = t.description && String(t.description).toLowerCase().includes(q);
        const matchMode = t.paymentMode && String(t.paymentMode).toLowerCase().includes(q);
        const matchDate = t.date && (String(t.date).toLowerCase().includes(q) || formatDate(t.date).toLowerCase().includes(q));
        const matchAmt = t.amount && String(t.amount).includes(q);
        if (!matchCat && !matchSub && !matchDesc && !matchMode && !matchDate && !matchAmt) {
          return false;
        }
      }

      return true;
    });
  }, [rawTransactions, filterType, selectedCategory, searchQuery]);

  // Reset to first page when filtering or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, selectedCategory, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredTransactions.slice(startIndex, startIndex + pageSize);
  }, [filteredTransactions, safeCurrentPage, pageSize]);

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
            type: parent.section,
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
    section: Section = 'savings',
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
        <tr className={`budget-transaction-row budget-transaction-edit-row budget-transaction-row-${section}`}>
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
            style={{ textAlign: 'center', verticalAlign: 'middle' }}
          >
            <div
              className="budget-transaction-actions-inner"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: '100%',
                width: '100%',
                margin: '0 auto',
              }}
            >
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
          <tr className={`budget-transaction-row budget-transaction-paymode-row budget-transaction-row-${section}`}>
            <td className="sticky-col budget-transaction-label budget-transaction-paymode-label">
              <button
                type="button"
                className="budget-set-all-btn"
                title="Apply selected payment mode to all 12 months"
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
                Set All
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

  const openAddCategoryModal = (
    section: Section = 'expense',
    mode: 'category' | 'subcategory' = 'category',
    categoryName: string = '',
  ) => {
    setCategoryModalInitialMode(mode);
    setCategoryModalInitialSection(section);
    setCategoryModalInitialCategoryName(categoryName);
    setIsCategoryModalOpen(true);
  };

  const handleStartAddCategory = (section: Section) => {
    setActiveAddCategorySection(section);
    setCategoryInputName('');
    setCategoryInlineError(null);
    setActiveAddSubcategoryId(null);
    setSectionOpen((cur) => ({ ...cur, [section]: true }));
    setTimeout(() => {
      categoryInputRef.current?.focus();
    }, 50);
  };

  const handleCancelAddCategory = () => {
    setActiveAddCategorySection(null);
    setCategoryInputName('');
    setCategoryInlineError(null);
  };

  const handleConfirmAddCategory = async (section: Section) => {
    const name = categoryInputName.trim();
    if (!name) {
      setCategoryInlineError('Category name cannot be empty');
      return;
    }

    setIsCategorySubmitting(true);
    setCategoryInlineError(null);
    try {
      await api.post('/categories', {
        name,
        type: section,
      });
      await loadAllData();
      setActiveAddCategorySection(null);
      setCategoryInputName('');
    } catch (error: any) {
      setCategoryInlineError(
        error.response?.data?.message || 'Category could not be saved. It may already exist.',
      );
    } finally {
      setIsCategorySubmitting(false);
    }
  };

  const handleStartAddSubcategory = (category: Category) => {
    setActiveAddSubcategoryId(category.id);
    setSubcategoryInputName('');
    setSubcategoryInlineError(null);
    setActiveAddCategorySection(null);
    setExpanded((cur) => new Set(cur).add(category.id));
    setTimeout(() => {
      subcategoryInputRef.current?.focus();
    }, 50);
  };

  const handleCancelAddSubcategory = () => {
    setActiveAddSubcategoryId(null);
    setSubcategoryInputName('');
    setSubcategoryInlineError(null);
  };

  const handleConfirmAddSubcategory = async (section: Section, category: Category) => {
    const name = subcategoryInputName.trim();
    if (!name) {
      setSubcategoryInlineError('Subcategory name cannot be empty');
      return;
    }

    setIsSubcategorySubmitting(true);
    setSubcategoryInlineError(null);
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
        name,
      });

      await loadAllData();
      setExpanded((current) => new Set(current).add(category.id));
      setActiveAddSubcategoryId(null);
      setSubcategoryInputName('');
    } catch (error: any) {
      setSubcategoryInlineError(
        error.response?.data?.message ||
          'Subcategory could not be saved. Make sure the backend is running.',
      );
    } finally {
      setIsSubcategorySubmitting(false);
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
                <tr className={`budget-category-row budget-category-row-${section}`} onClick={() => toggle(category.id)}>
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
                          className={`budget-subcategory-row budget-subcategory-row-${section} has-transaction-details`}
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
                              const dayA = parseTransactionDate(a.date)?.day || Number(String(a.date || '').slice(8, 10)) || 1;
                              const dayB = parseTransactionDate(b.date)?.day || Number(String(b.date || '').slice(8, 10)) || 1;
                              if (dayA !== dayB) return dayA - dayB;
                              const cmpDate = (a.date || '').localeCompare(b.date || '');
                              if (cmpDate !== 0) return cmpDate;
                              return (a.name || '').localeCompare(b.name || '');
                            })
                            .map((detail) => {
                              const parsedDay = parseTransactionDate(detail.date)?.day;
                              const displayDay = parsedDay != null ? String(parsedDay).padStart(2, '0') : (detail.date.slice(8, 10) || '01');

                              return (
                                <tr className={`budget-transaction-row budget-transaction-row-${section}`} key={detail.id}>
                                  <td className="sticky-col budget-transaction-label">
                                    <small>{displayDay}</small>
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
                              );
                            })}

                        {detailsOpen &&
                          budgetTransactionDrafts[subcategory.id] &&
                          drawBudgetTransactionDraft(
                            subcategory,
                            budgetTransactionDrafts[subcategory.id],
                            section,
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
                  activeAddSubcategoryId === category.id ? (
                    <tr
                      className={`budget-add-row budget-inline-add-row budget-inline-add-sub budget-inline-add-${section}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <td className="sticky-col budget-inline-add-cell budget-inline-add-subcategory-cell">
                        <form
                          className="budget-inline-unified-bar"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleConfirmAddSubcategory(section, category);
                          }}
                        >
                          <div className="budget-inline-bar-icon">
                            <Layers size={13} />
                          </div>
                          <input
                            ref={subcategoryInputRef}
                            type="text"
                            className="budget-inline-bar-input"
                            placeholder="Subcategory name..."
                            value={subcategoryInputName}
                            onChange={(e) => {
                              setSubcategoryInputName(e.target.value);
                              setSubcategoryInlineError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelAddSubcategory();
                              }
                            }}
                            autoFocus
                            disabled={isSubcategorySubmitting}
                          />
                          <div className="budget-inline-bar-actions">
                            <button
                              type="submit"
                              className="budget-inline-action-btn budget-inline-btn-save"
                              title="Save subcategory (Enter)"
                              disabled={isSubcategorySubmitting || !subcategoryInputName.trim()}
                            >
                              {isSubcategorySubmitting ? (
                                <Loader2 size={13} className="spin" />
                              ) : (
                                <Check size={14} strokeWidth={2.6} />
                              )}
                            </button>
                            <button
                              type="button"
                              className="budget-inline-action-btn budget-inline-btn-cancel"
                              title="Cancel (Esc)"
                              onClick={handleCancelAddSubcategory}
                              disabled={isSubcategorySubmitting}
                            >
                              <X size={13} strokeWidth={2.4} />
                            </button>
                            <button
                              type="button"
                              className="budget-inline-action-btn budget-inline-btn-modal"
                              title="Open in modal dialog"
                              onClick={() => openAddCategoryModal(section, 'subcategory', category.name)}
                              disabled={isSubcategorySubmitting}
                            >
                              <ExternalLink size={12} strokeWidth={2.2} />
                            </button>
                          </div>
                        </form>
                        {subcategoryInlineError && (
                          <div className="budget-inline-add-error">
                            <AlertCircle size={11} />
                            <span>{subcategoryInlineError}</span>
                          </div>
                        )}
                      </td>
                      <td colSpan={13} className="budget-inline-add-empty-cols" />
                    </tr>
                  ) : (
                    <tr className="budget-add-row budget-add-subcategory-row">
                      <td className="sticky-col">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStartAddSubcategory(category);
                          }}
                        >
                          <Plus size={14} />
                          Add subcategory
                        </button>
                      </td>
                      <td colSpan={13} />
                    </tr>
                  )
                )}
              </React.Fragment>
            );
          })}

        {open && (
          activeAddCategorySection === section ? (
            <tr
              className={`budget-add-row budget-inline-add-row budget-inline-add-cat budget-inline-add-${section}`}
              onClick={(e) => e.stopPropagation()}
            >
              <td className="sticky-col budget-inline-add-cell budget-inline-add-category-cell">
                <form
                  className="budget-inline-unified-bar"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleConfirmAddCategory(section);
                  }}
                >
                  <div className="budget-inline-bar-icon">
                    <FolderPlus size={14} />
                  </div>
                  <input
                    ref={categoryInputRef}
                    type="text"
                    className="budget-inline-bar-input"
                    placeholder="Category name..."
                    value={categoryInputName}
                    onChange={(e) => {
                      setCategoryInputName(e.target.value);
                      setCategoryInlineError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelAddCategory();
                      }
                    }}
                    autoFocus
                    disabled={isCategorySubmitting}
                  />
                  <div className="budget-inline-bar-actions">
                    <button
                      type="submit"
                      className="budget-inline-action-btn budget-inline-btn-save"
                      title="Save category (Enter)"
                      disabled={isCategorySubmitting || !categoryInputName.trim()}
                    >
                      {isCategorySubmitting ? (
                        <Loader2 size={13} className="spin" />
                      ) : (
                        <Check size={14} strokeWidth={2.6} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="budget-inline-action-btn budget-inline-btn-cancel"
                      title="Cancel (Esc)"
                      onClick={handleCancelAddCategory}
                      disabled={isCategorySubmitting}
                    >
                      <X size={13} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      className="budget-inline-action-btn budget-inline-btn-modal"
                      title="Open in modal dialog"
                      onClick={() => openAddCategoryModal(section, 'category')}
                      disabled={isCategorySubmitting}
                    >
                      <ExternalLink size={12} strokeWidth={2.2} />
                    </button>
                  </div>
                </form>
                {categoryInlineError && (
                  <div className="budget-inline-add-error">
                    <AlertCircle size={11} />
                    <span>{categoryInlineError}</span>
                  </div>
                )}
              </td>
              <td colSpan={13} className="budget-inline-add-empty-cols" />
            </tr>
          ) : (
            <tr className="budget-add-row budget-add-category-row">
              <td className="sticky-col">
                <button type="button" onClick={() => handleStartAddCategory(section)}>
                  <CirclePlus size={14} />
                  Add category
                </button>
              </td>
              <td colSpan={13} />
            </tr>
          )
        )}
      </React.Fragment>
    );
  };

  const incomeTotals = sectionTotals('income');
  const expenseTotals = sectionTotals('expense');

  return (
    <main className="budget-planning-page" style={{ paddingBottom: 60 }}>
      {/* SECTION 1: BUDGET PLANNER */}
      {(viewMode === 'combined' || viewMode === 'budget') && (
        <section
          ref={budgetSectionRef}
          id="budget-planner-section"
          style={{ marginBottom: viewMode === 'combined' ? 40 : 0 }}
        >
          {/* Sticky Header for Planner controls */}
          <div className="sticky-section-header budget-section-sticky-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {viewMode === 'combined' && (
                <div className="segmented-control section-nav-pills" style={{ padding: 2 }}>
                  <button
                    type="button"
                    className={`segmented-btn ${activeSection === 'budget' ? 'active' : ''}`}
                    onClick={() => scrollToSection('budget')}
                    style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                    title="Move to Budget Planner"
                  >
                    <TableIcon size={13} />
                    <span>Budget Planner</span>
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${activeSection === 'transactions' ? 'active' : ''}`}
                    onClick={() => scrollToSection('transactions')}
                    style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                    title="Move to Transactions"
                  >
                    <ReceiptText size={13} />
                    <span>Transactions</span>
                  </button>
                </div>
              )}

              <div
                className="section-title-clickable"
                onClick={() => scrollToSection('budget')}
                title="Click to scroll to start of Budget Planner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  userSelect: 'none',
                  padding: '4px 8px',
                  borderRadius: 8,
                }}
              >
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

                <div className="year-picker-wrap" ref={yearPickerRef}>
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
                      <div className="year-picker-header">
                        <span>Choose year</span>
                        <button
                          type="button"
                          className="year-picker-current-btn"
                          onClick={() => {
                            setSelectedYear(new Date().getFullYear());
                            setShowYearPicker(false);
                          }}
                          title={`Go to current year (${new Date().getFullYear()})`}
                        >
                          Current
                        </button>
                      </div>
                      <div>
                        {pickerYears.map((year) => (
                          <button
                            key={year}
                            type="button"
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
                type="button"
                className="btn-secondary"
                onClick={() => openAddCategoryModal()}
                style={{ padding: '6px 14px', fontSize: 12 }}
                title="Add Category or Subcategory"
              >
                <FolderPlus size={14} />
                <span>Add Category</span>
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
                  <th className="sticky-col budget-category-head" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    <CalendarDays size={14} />
                    <span>Category</span>
                  </th>
                  {MONTHS.map((month) => (
                    <th key={month} style={{ textAlign: 'center', verticalAlign: 'middle' }}>{month}</th>
                  ))}
                  <th className="col-year-total" style={{ textAlign: 'center', verticalAlign: 'middle' }}>{selectedYear}</th>
                </tr>
              </thead>

              <tbody>
                {drawSection('income', 'INCOME', <TrendingUp size={15} />)}
                {drawSection('savings', 'SAVINGS & INVESTMENTS', <PiggyBank size={15} />)}
                {drawSection('expense', 'EXPENSES', <TrendingDown size={15} />)}

                <tr className="net-cashflow-row">
                  <td className="sticky-col" style={{ textAlign: 'center', verticalAlign: 'middle' }}>NET CASH FLOW</td>
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
        <section
          ref={transactionsSectionRef}
          id="transactions-ledger-section"
        >
          {/* Sticky Header for Transactions controls */}
          <div className="sticky-section-header transactions-section-sticky-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {viewMode === 'combined' && (
                <div className="segmented-control section-nav-pills" style={{ padding: 2 }}>
                  <button
                    type="button"
                    className={`segmented-btn ${activeSection === 'budget' ? 'active' : ''}`}
                    onClick={() => scrollToSection('budget')}
                    style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                    title="Move to Budget Planner"
                  >
                    <TableIcon size={13} />
                    <span>Budget Planner</span>
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${activeSection === 'transactions' ? 'active' : ''}`}
                    onClick={() => scrollToSection('transactions')}
                    style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                    title="Move to Transactions"
                  >
                    <ReceiptText size={13} />
                    <span>Transactions</span>
                  </button>
                </div>
              )}

              <div
                className="section-title-clickable"
                onClick={() => scrollToSection('transactions')}
                title="Click to scroll to start of Transactions"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  userSelect: 'none',
                  padding: '4px 8px',
                  borderRadius: 8,
                }}
              >
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
                    className="transactions-subtext"
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
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
                <button
                  className={`segmented-btn ${filterType === 'savings' ? 'active' : ''}`}
                  onClick={() => setFilterType('savings')}
                >
                  Savings
                </button>
              </div>

              <button
                className="btn-primary"
                onClick={() => onOpenNewTransaction()}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                <Plus size={15} />
                <span>Add Transaction</span>
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
            <div className="glass-card table-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="transactions-table" style={{ width: '100%', textAlign: 'left', tableLayout: 'fixed' }}>
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
                      <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>Date</th>
                      <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>Type</th>
                      <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>Category</th>
                      <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>Description</th>
                      <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>Payment Mode</th>
                      <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>Amount</th>
                      <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>Action</th>
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
                      paginatedTransactions.map((t, idx) => (
                        <tr key={t.id || idx}>
                          <td style={{ textAlign: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {formatDate(t.date)}
                          </td>
                          <td>
                            {(() => {
                              const section = getSection(t);
                              return (
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
                                      section === 'income'
                                        ? 'rgba(16, 185, 129, 0.15)'
                                        : section === 'savings'
                                        ? 'rgba(59, 130, 246, 0.15)'
                                        : 'rgba(239, 68, 68, 0.15)',
                                    color:
                                      section === 'income'
                                        ? '#10B981'
                                        : section === 'savings'
                                        ? '#60A5FA'
                                        : '#EF4444',
                                  }}
                                >
                                  {section === 'income' ? (
                                    <ArrowUpRight size={14} />
                                  ) : section === 'savings' ? (
                                    <PiggyBank size={14} />
                                  ) : (
                                    <ArrowDownRight size={14} />
                                  )}
                                  {section.toUpperCase()}
                                </span>
                              );
                            })()}
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
                          <td
                            style={{
                              textAlign: 'center',
                              color: 'var(--text-secondary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={t.description || ''}
                          >
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
                              color:
                                t.type === 'income'
                                  ? '#10B981'
                                  : t.type === 'savings'
                                  ? '#60A5FA'
                                  : '#EF4444',
                            }}
                          >
                            {t.type === 'income' ? '+' : '-'}
                            {currency(t.amount)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleEditTransaction(t)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: 4,
                                  borderRadius: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s',
                                }}
                                title="Update transaction"
                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-indigo)')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(t.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: 4,
                                  borderRadius: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s',
                                }}
                                title="Delete transaction"
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredTransactions.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '12px 20px',
                    borderTop: '1px solid var(--border-color)',
                    background: 'rgba(11, 14, 20, 0.45)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {/* Left: Showing count & Rows per page */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span>
                      Showing{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {(safeCurrentPage - 1) * pageSize + 1}
                      </strong>{' '}
                      to{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {Math.min(safeCurrentPage * pageSize, filteredTransactions.length)}
                      </strong>{' '}
                      of{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {filteredTransactions.length}
                      </strong>{' '}
                      transactions
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 12,
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  </div>

                  {/* Right: Page navigation */}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safeCurrentPage === 1}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border-color)',
                          background: safeCurrentPage === 1 ? 'transparent' : 'var(--bg-input)',
                          color: safeCurrentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                          cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all 0.2s',
                        }}
                      >
                        <ChevronLeft size={14} />
                        <span>Previous</span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((page) => {
                            if (page === 1 || page === totalPages) return true;
                            if (Math.abs(page - safeCurrentPage) <= 1) return true;
                            return false;
                          })
                          .map((page, idx, arr) => {
                            const prev = arr[idx - 1];
                            const showEllipsis = prev && page - prev > 1;

                            return (
                              <React.Fragment key={page}>
                                {showEllipsis && (
                                  <span style={{ padding: '0 4px', color: 'var(--text-muted)' }}>...</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setCurrentPage(page)}
                                  style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: 6,
                                    border: '1px solid',
                                    borderColor:
                                      page === safeCurrentPage
                                        ? 'var(--accent-indigo)'
                                        : 'var(--border-color)',
                                    background:
                                      page === safeCurrentPage
                                        ? 'var(--accent-indigo)'
                                        : 'var(--bg-input)',
                                    color: page === safeCurrentPage ? '#fff' : 'var(--text-primary)',
                                    fontWeight: page === safeCurrentPage ? 700 : 500,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                  }}
                                >
                                  {page}
                                </button>
                              </React.Fragment>
                            );
                          })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safeCurrentPage === totalPages}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border-color)',
                          background: safeCurrentPage === totalPages ? 'transparent' : 'var(--bg-input)',
                          color: safeCurrentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                          cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all 0.2s',
                        }}
                      >
                        <span>Next</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Edit / Update Transaction Modal */}
      <TransactionModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingTransaction(null);
        }}
        onSuccess={() => {
          loadAllData();
          setIsEditModalOpen(false);
          setEditingTransaction(null);
        }}
        transactionToEdit={editingTransaction}
      />

      {/* Category & Subcategory Modal */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSuccess={() => {
          loadAllData();
          setIsCategoryModalOpen(false);
        }}
        initialMode={categoryModalInitialMode}
        initialSection={categoryModalInitialSection}
        initialCategoryName={categoryModalInitialCategoryName}
        categoriesBySection={modalCategoriesBySection}
      />
    </main>
  );
};
