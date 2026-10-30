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
  RotateCcw,
  SlidersHorizontal,
  ExternalLink,
  Calendar,
  Building2
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { getUserStorageKey } from '../services/storageHelper';
import { yearService } from '../services/yearService';
import { currencyService } from '../services/currencyService';
import { cardService } from '../services/cardService';
import { bankAccountService } from '../services/bankAccountService';
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


export const getDeletedCategorySet = (email?: string): Set<string> => {
  try {
    const raw = localStorage.getItem(`fintrack_deleted_categories_${email || 'global'}`);
    return raw ? new Set(JSON.parse(raw).map((k: string) => String(k).toLowerCase().trim())) : new Set();
  } catch {
    return new Set();
  }
};

export const addDeletedCategory = (email: string | undefined, items: string[]) => {
  try {
    const set = getDeletedCategorySet(email);
    items.forEach(it => {
      if (it) set.add(String(it).toLowerCase().trim());
    });
    localStorage.setItem(`fintrack_deleted_categories_${email || 'global'}`, JSON.stringify(Array.from(set)));
  } catch {}
};

export const unmarkDeletedCategory = (email: string | undefined, name: string) => {
  try {
    const clean = String(name).toLowerCase().trim();
    const set = getDeletedCategorySet(email);
    set.delete(clean);
    set.delete(`expense:${clean}`);
    set.delete(`income:${clean}`);
    set.delete(`savings:${clean}`);
    localStorage.setItem(`fintrack_deleted_categories_${email || 'global'}`, JSON.stringify(Array.from(set)));
  } catch {}
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
  const { user } = useAuth();
  const isViewOnly = Boolean(user?.isReadOnly || (user?.isMember && user?.memberPermission === 'VIEW_ONLY'));
  const [viewMode, setViewMode] = useState<ViewMode>(
    globalSearchQuery ? 'transactions' : initialViewMode
  );
  const [selectedYear, setSelectedYear] = useState<number>(() => yearService.getSelectedYear());
  const [mode, setMode] = useState<Mode>('actual');

  // Sync year changes across pages
  useEffect(() => {
    const onYearChange = (e: any) => {
      if (e.detail && e.detail !== selectedYear) {
        setSelectedYear(e.detail);
      }
    };
    window.addEventListener('fintrack-year-changed', onYearChange);
    return () => window.removeEventListener('fintrack-year-changed', onYearChange);
  }, [selectedYear]);

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

  // Additional Transaction Section Filters (From/To Date, From/To Amount)
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');

  // 5-Second Undo Delete System State (supports multiple concurrent items like IntelliJ notifications)
  interface PendingDeletionItem {
    id: string;
    targetKey: string;
    name: string;
    secondsLeft: number;
    executeDelete: () => void | Promise<void>;
  }

  const [pendingDeletions, setPendingDeletions] = useState<PendingDeletionItem[]>([]);

  const pendingDeleteKeys = useMemo(
    () => new Set(pendingDeletions.map((p) => p.targetKey)),
    [pendingDeletions]
  );

  useEffect(() => {
    if (pendingDeletions.length === 0) return;

    const timer = setInterval(() => {
      setPendingDeletions((current) => {
        const nextList: PendingDeletionItem[] = [];
        for (const item of current) {
          if (item.secondsLeft <= 1) {
            try {
              void item.executeDelete();
            } catch (err) {
              console.error('Error executing pending delete:', err);
            }
          } else {
            nextList.push({ ...item, secondsLeft: item.secondsLeft - 1 });
          }
        }
        return nextList;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingDeletions]);

  // Undo simply cancels the pending deletion timer with ZERO mutations and ZERO duplicates
  const handleUndoDeletionItem = (id: string) => {
    setPendingDeletions((current) => current.filter((item) => item.id !== id));
  };

  // Popover state for Date & Amount filter dropdowns
  const [showDateFilterPopover, setShowDateFilterPopover] = useState(false);
  const [showAmountFilterPopover, setShowAmountFilterPopover] = useState(false);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  const amountFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setShowDateFilterPopover(false);
      }
      if (amountFilterRef.current && !amountFilterRef.current.contains(e.target as Node)) {
        setShowAmountFilterPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Month Spend Details Drawer State (Persisted in sessionStorage so submitting form returns right back to this popup)
  const [monthDrawer, setMonthDrawer] = useState<{
    isOpen: boolean;
    section: Section;
    categoryName: string;
    subcategoryName?: string;
    subcategoryId?: string;
    monthIndex: number;
    monthName: string;
    totalAmount: number;
  } | null>(() => {
    try {
      const saved = sessionStorage.getItem('fintrack_active_drawer');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [drawerSearch, setDrawerSearch] = useState<string>('');

  const handleOpenMonthDrawer = (
    section: Section,
    categoryName: string,
    subcategoryName: string | undefined,
    monthIndex: number,
    monthName: string,
    totalAmount: number,
    subcategoryId?: string
  ) => {
    if (mode !== 'actual') return;
    const drawerState = {
      isOpen: true,
      section,
      categoryName,
      subcategoryName,
      subcategoryId,
      monthIndex,
      monthName,
      totalAmount,
    };
    setMonthDrawer(drawerState);
    try {
      sessionStorage.setItem('fintrack_active_drawer', JSON.stringify(drawerState));
    } catch {}
    setDrawerSearch('');
  };

  const handleCloseMonthDrawer = () => {
    setMonthDrawer(null);
    try {
      sessionStorage.removeItem('fintrack_active_drawer');
    } catch {}
  };

  // Automatically clear unadded transaction drafts when switching year, mode, or view
  useEffect(() => {
    setBudgetTransactionDrafts({});
  }, [selectedYear, mode, viewMode]);

  // Filter labels helper for Date & Amount buttons
  const getDateFilterLabel = () => {
    if (fromDate && toDate) return `${fromDate.slice(5)} to ${toDate.slice(5)}`;
    if (fromDate) return `From ${fromDate.slice(5)}`;
    if (toDate) return `Until ${toDate.slice(5)}`;
    return 'Date Range';
  };

  const activeCurSym = currencyService.getActiveCurrencyConfig().symbol;
  const getAmountFilterLabel = () => {
    if (minAmount && maxAmount) return `${activeCurSym}${minAmount} - ${activeCurSym}${maxAmount}`;
    if (minAmount) return `> ${activeCurSym}${minAmount}`;
    if (maxAmount) return `< ${activeCurSym}${maxAmount}`;
    return 'Amount Range';
  };

  const applyDatePreset = (preset: 'all' | 'this_month' | 'last_month' | 'last_30' | 'this_year') => {
    const now = new Date();
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'this_month') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      setFromDate(`${y}-${m}-01`);
      setToDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
      setFromDate(`${y}-${m}-01`);
      setToDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'last_30') {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      setFromDate(start);
      setToDate(end);
    } else if (preset === 'this_year') {
      setFromDate(`${selectedYear}-01-01`);
      setToDate(`${selectedYear}-12-31`);
    }
  };

  const applyAmountPreset = (preset: 'all' | 'under_1k' | '1k_5k' | '5k_20k' | 'above_20k') => {
    if (preset === 'all') {
      setMinAmount('');
      setMaxAmount('');
    } else if (preset === 'under_1k') {
      setMinAmount('');
      setMaxAmount('1000');
    } else if (preset === '1k_5k') {
      setMinAmount('1000');
      setMaxAmount('5000');
    } else if (preset === '5k_20k') {
      setMinAmount('5000');
      setMaxAmount('20000');
    } else if (preset === 'above_20k') {
      setMinAmount('20000');
      setMaxAmount('');
    }
  };
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
    setBudgetTransactionDrafts({});
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

  const [paymentModeOptions, setPaymentModeOptions] = useState(() =>
    bankAccountService.getPaymentModeOptions(user?.email)
  );

  useEffect(() => {
    setPaymentModeOptions(bankAccountService.getPaymentModeOptions(user?.email));
    const handleAccUpdated = () => {
      setPaymentModeOptions(bankAccountService.getPaymentModeOptions(user?.email));
    };
    window.addEventListener('fintrack-accounts-updated', handleAccUpdated);
    return () => window.removeEventListener('fintrack-accounts-updated', handleAccUpdated);
  }, [user?.email]);

  const formatPaymentModeName = (pm?: string) => {
    if (!pm) return 'UPI';
    const clean = pm.trim();
    const opt = paymentModeOptions.find((p) => p.value.toLowerCase() === clean.toLowerCase());
    if (opt) return opt.label;
    if (clean.toLowerCase() === 'cash') return '💵 Cash';
    if (clean.toLowerCase() === 'upi') return '📱 UPI';
    if (clean.startsWith('bank_')) {
      const parts = clean.slice(5).split('_');
      const last = parts.pop();
      return `🏦 ${parts.join(' ').toUpperCase()} (•••• ${last})`;
    }
    return clean.replace(/_/g, ' ').toUpperCase();
  };

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
    if (user?.email === 'demo@fintrack.io') {
      seedDemoBudgetData();
    }
    const budgetKey = getUserStorageKey(`fintrack-budget-${selectedYear}`, user?.email);
    const stored = localStorage.getItem(budgetKey);
    setBudgetValues(stored ? JSON.parse(stored) : {});
  }, [selectedYear, user]);

  useEffect(() => {
    if (user?.email === 'demo@fintrack.io') {
      seedDemoBudgetData();
    }
    const txKey = getUserStorageKey(`fintrack-budget-transactions-${selectedYear}`, user?.email);
    const stored = localStorage.getItem(txKey);
    setBudgetTransactions(stored ? JSON.parse(stored) : {});
  }, [selectedYear, user]);

  // Load data from backend
  useEffect(() => {
    loadAllData();
    const onTxChange = () => {
      loadAllData();
    };
    window.addEventListener('fintrack-transactions-changed', onTxChange);
    return () => window.removeEventListener('fintrack-transactions-changed', onTxChange);
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

    const deletedSet = getDeletedCategorySet(user?.email);

    (Object.keys(DEFAULT_CATEGORIES) as Section[]).forEach((section) =>
      DEFAULT_CATEGORIES[section].forEach((name) => {
        const clean = name.trim().toLowerCase();
        if (deletedSet.has(clean) || deletedSet.has(`${section}:${clean}`)) {
          return; // Skip deleted category
        }
        ensureCategory(section, name);
      }),
    );

    cats.forEach((category) => {
      const section: Section =
        category.type === 'income'
          ? 'income'
          : category.type === 'savings'
            ? 'savings'
            : 'expense';

      const clean = (category.name || '').trim().toLowerCase();
      if (deletedSet.has(clean) || deletedSet.has(`${section}:${clean}`)) {
        return; // Skip deleted category
      }
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

  // Month Transactions Drawer List Computation
  const drawerTransactions = useMemo(() => {
    if (!monthDrawer || !monthDrawer.isOpen) return [];
    const { categoryName, subcategoryName, subcategoryId, monthIndex } = monthDrawer;

    if (mode === 'actual') {
      return rawTransactions
        .filter((t) => {
          const pd = parseTransactionDate(t.date);
          if (!pd || pd.year !== selectedYear || pd.month !== monthIndex) return false;
          if (t.category !== categoryName) return false;
          if (
            subcategoryName &&
            subcategoryName !== 'Unallocated' &&
            t.subcategory &&
            t.subcategory !== subcategoryName
          ) {
            return false;
          }
          return true;
        })
        .map((t) => {
          const pd = parseTransactionDate(t.date);
          return {
            id: t.id,
            day: pd ? String(pd.day).padStart(2, '0') : '01',
            name: t.description || t.subcategory || t.category || 'Transaction',
            paymentMode: t.paymentMode || 'Bank Transfer',
            amount: Number(t.amount) || 0,
            date: t.date,
            raw: t,
          };
        });
    } else {
      const list = subcategoryId ? budgetTransactions[subcategoryId] || [] : [];
      return list
        .filter((tx) => (tx.values[monthIndex] || 0) > 0)
        .map((tx) => {
          const pd = parseTransactionDate(tx.date);
          return {
            id: tx.id,
            day: pd ? String(pd.day).padStart(2, '0') : tx.date?.slice(8, 10) || '01',
            name: tx.name,
            paymentMode: tx.paymentMode || 'Bank Transfer',
            amount: tx.values[monthIndex] || 0,
            date: tx.date,
            raw: tx,
          };
        });
    }
  }, [monthDrawer, mode, rawTransactions, budgetTransactions, selectedYear]);

  const filteredDrawerTransactions = useMemo(() => {
    if (!drawerSearch.trim()) return drawerTransactions;
    const q = drawerSearch.toLowerCase().trim();
    return drawerTransactions.filter(
      (tx) =>
        tx.name.toLowerCase().includes(q) ||
        tx.paymentMode.toLowerCase().includes(q) ||
        String(tx.amount).includes(q)
    );
  }, [drawerTransactions, drawerSearch]);

  const drawerTotal = useMemo(() => {
    return drawerTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  }, [drawerTransactions]);

  // Transactions Ledger filtering
  const categoryFilterOptions = useMemo(() => {
    const deletedSet = getDeletedCategorySet(user?.email);
    const set = new Set<string>();
    set.add('All Categories');
    BASE_CATEGORY_FILTERS.forEach(f => {
      if (f !== 'All Categories' && !deletedSet.has(f.toLowerCase())) {
        set.add(f);
      }
    });
    apiCategories.forEach((c) => {
      if (!deletedSet.has(c.name.toLowerCase())) set.add(c.name);
    });
    rawTransactions.forEach((t) => {
      if (t.category && !deletedSet.has(t.category.toLowerCase())) set.add(t.category);
    });
    return Array.from(set);
  }, [apiCategories, rawTransactions, user?.email]);

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

      // 4. Filter by Date Range (From / To)
      if (fromDate) {
        const txDate = t.date ? String(t.date).slice(0, 10) : '';
        if (txDate && txDate < fromDate) return false;
      }
      if (toDate) {
        const txDate = t.date ? String(t.date).slice(0, 10) : '';
        if (txDate && txDate > toDate) return false;
      }

      // 5. Filter by Amount Range (Min / Max)
      const numAmt = Number(t.amount) || 0;
      if (minAmount.trim() !== '') {
        const minVal = Number(minAmount);
        if (!isNaN(minVal) && numAmt < minVal) return false;
      }
      if (maxAmount.trim() !== '') {
        const maxVal = Number(maxAmount);
        if (!isNaN(maxVal) && numAmt > maxVal) return false;
      }

      return true;
    });
  }, [rawTransactions, filterType, selectedCategory, searchQuery, fromDate, toDate, minAmount, maxAmount]);

  // Reset to first page when filtering or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, selectedCategory, searchQuery, fromDate, toDate, minAmount, maxAmount]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredTransactions.slice(startIndex, startIndex + pageSize);
  }, [filteredTransactions, safeCurrentPage, pageSize]);

  const hasActiveFilters =
    filterType !== 'all' ||
    selectedCategory !== 'All Categories' ||
    searchQuery.trim().length > 0 ||
    Boolean(fromDate) ||
    Boolean(toDate) ||
    minAmount.trim().length > 0 ||
    maxAmount.trim().length > 0;

  const handleClearFilters = () => {
    setFilterType('all');
    setSelectedCategory('All Categories');
    setSearchQuery('');
    setFromDate('');
    setToDate('');
    setMinAmount('');
    setMaxAmount('');
  };

  const handleDeleteTransaction = (id: number) => {
    const targetKey = `tx-${id}`;
    if (pendingDeleteKeys.has(targetKey)) return;

    const txObj = rawTransactions.find((t) => t.id === id);
    if (!txObj) return;

    setPendingDeletions((current) => [
      ...current,
      {
        id: `tx-${id}-${Date.now()}`,
        targetKey,
        name: `Transaction "${txObj.description || txObj.category || 'Item'}"`,
        secondsLeft: 5,
        executeDelete: async () => {
          try {
            await api.delete(`/transactions/${id}`);
            bankAccountService.applyTransactionImpact(txObj, true, user?.email);
            window.dispatchEvent(new CustomEvent('fintrack-transactions-changed'));
          } catch (err) {
            console.warn(`Transaction delete note for id ${id}:`, err);
          }
          setRawTransactions((curr) => {
            const next = curr.filter((t) => t.id !== id);
            setSections(makeSections(next, apiCategories, apiSubcategories));
            return next;
          });
        },
      },
    ]);
  };

  // Kinetic Year Selector Reel State & Handlers
  const [trackOffset, setTrackOffset] = useState<number>(-54);
  const [isAnimatingYear, setIsAnimatingYear] = useState<boolean>(false);

  const handleNextYear = () => {
    if (isAnimatingYear) return;
    setIsAnimatingYear(true);
    setTrackOffset(-108);
    setTimeout(() => {
      setSelectedYear((y) => {
        const next = y + 1;
        yearService.setSelectedYear(next);
        return next;
      });
      setTrackOffset(-54);
      setIsAnimatingYear(false);
    }, 280);
  };

  const handlePrevYear = () => {
    if (isAnimatingYear) return;
    setIsAnimatingYear(true);
    setTrackOffset(0);
    setTimeout(() => {
      setSelectedYear((y) => {
        const prev = y - 1;
        yearService.setSelectedYear(prev);
        return prev;
      });
      setTrackOffset(-54);
      setIsAnimatingYear(false);
    }, 280);
  };

  // Budget calculations & formatting
  const pickerYears = Array.from(
    { length: 12 },
    (_, index) => selectedYear - 5 + index,
  );

  const currency = (value: number) => {
    return currencyService.format(value);
  };

  const cell = (value: number) => (value ? currency(value) : '—');

  const total = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0);

  const getLineBudgetTxs = (line: Line): TransactionDetail[] => {
    if (budgetTransactions[line.id]?.length) return budgetTransactions[line.id];
    if (line.name && budgetTransactions[line.name]?.length) return budgetTransactions[line.name];
    const matchKey = Object.keys(budgetTransactions).find(
      (k) =>
        k.toLowerCase() === line.name.toLowerCase() ||
        k.toLowerCase().endsWith(':' + line.name.toLowerCase()) ||
        k.toLowerCase().startsWith(line.name.toLowerCase() + ':')
    );
    if (matchKey && budgetTransactions[matchKey]?.length) return budgetTransactions[matchKey];
    return [];
  };

  const getLineDirectBudget = (line: Line): number[] | undefined => {
    if (budgetValues[line.id]?.length) return budgetValues[line.id];
    if (line.name && budgetValues[line.name]?.length) return budgetValues[line.name];
    const matchKey = Object.keys(budgetValues).find(
      (k) =>
        k.toLowerCase() === line.name.toLowerCase() ||
        k.toLowerCase().endsWith(':' + line.name.toLowerCase()) ||
        k.toLowerCase().startsWith(line.name.toLowerCase() + ':')
    );
    if (matchKey && budgetValues[matchKey]?.length) return budgetValues[matchKey];
    return undefined;
  };

  const leafValues = (line: Line) => {
    if (mode === 'actual') {
      return line.values;
    }
    const txs = getLineBudgetTxs(line);
    const txTotal = txs.reduce((sum, tx) => sum + total(tx.values), 0);
    if (txs.length > 0 && txTotal > 0) {
      return MONTHS.map((_, month) =>
        txs.reduce((sum, transaction) => sum + (transaction.values[month] || 0), 0)
      );
    }
    const direct = getLineDirectBudget(line);
    if (direct && total(direct) > 0) {
      return direct;
    }
    if (txs.length > 0) {
      return MONTHS.map((_, month) =>
        txs.reduce((sum, transaction) => sum + (transaction.values[month] || 0), 0)
      );
    }
    return direct || zeros();
  };

  const categoryValues = (category: Category) => {
    if (mode === 'actual') {
      return category.values;
    }
    const subTotals = MONTHS.map((_, month) =>
      category.subcategories.reduce(
        (sum, subcategory) => sum + leafValues(subcategory)[month],
        0,
      ),
    );
    if (total(subTotals) === 0) {
      let directCat = budgetValues[category.id] || budgetValues[category.name];
      if (!directCat || total(directCat) === 0) {
        const matchKey = Object.keys(budgetValues).find(
          (k) =>
            k.toLowerCase() === category.name.toLowerCase() ||
            k.toLowerCase().endsWith(':' + category.name.toLowerCase())
        );
        if (matchKey) directCat = budgetValues[matchKey];
      }
      if (directCat && total(directCat) > 0) return directCat;

      let txs = budgetTransactions[category.id] || budgetTransactions[category.name] || [];
      if (txs.length === 0) {
        const matchKey = Object.keys(budgetTransactions).find(
          (k) =>
            k.toLowerCase() === category.name.toLowerCase() ||
            k.toLowerCase().endsWith(':' + category.name.toLowerCase())
        );
        if (matchKey) txs = budgetTransactions[matchKey] || [];
      }
      if (txs.length > 0 && txs.reduce((s, tx) => s + total(tx.values), 0) > 0) {
        return MONTHS.map((_, month) =>
          txs.reduce((sum, tx) => sum + (tx.values[month] || 0), 0)
        );
      }
    }
    return subTotals;
  };

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

          const commonSelect = typeof document !== 'undefined'
            ? (document.getElementById(`common-paymode-${draft.id}`) as HTMLSelectElement | null)
            : null;
          const selectedCommonMode = commonSelect?.value?.trim();
          const pm =
            draft.monthPaymentModes?.[month]?.trim() ||
            selectedCommonMode ||
            draft.paymentMode?.trim() ||
            defaultPaymentMode;
          const isCredit = pm.toLowerCase() === 'credit' || pm.toLowerCase() === 'credit card';
          const assignedCard = isCredit ? (cardService.getActiveCards()[0]?.name || null) : null;

          const txPayload = {
            date,
            type: parent.section,
            category: parent.category.name,
            subcategory: subcategory.name,
            amount,
            paymentMode: pm,
            card: assignedCard,
            description: draft.name.trim() || 'Transaction',
          };

          await api.post('/transactions', txPayload);
          bankAccountService.applyTransactionImpact(txPayload, false, user?.email);
        }

        cancelBudgetTransactionDraft(subcategory);
        await loadAllData();
        window.dispatchEvent(new CustomEvent('fintrack-transactions-changed'));
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
      getUserStorageKey(`fintrack-budget-transactions-${selectedYear}`, user?.email),
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
    const targetKey = `btx-${transactionId}`;
    if (pendingDeleteKeys.has(targetKey)) return;

    const currentList = budgetTransactions[subcategory.id] || [];
    const txObj = currentList.find((t) => t.id === transactionId);
    if (!txObj) return;

    setPendingDeletions((current) => [
      ...current,
      {
        id: `btx-${transactionId}-${Date.now()}`,
        targetKey,
        name: `Planned transaction "${txObj.name}"`,
        secondsLeft: 5,
        executeDelete: () => {
          setBudgetTransactions((curr) => {
            const nextList = (curr[subcategory.id] || []).filter((t) => t.id !== transactionId);
            const next = { ...curr, [subcategory.id]: nextList };
            localStorage.setItem(
      getUserStorageKey(`fintrack-budget-transactions-${selectedYear}`, user?.email),
              JSON.stringify(next),
            );
            return next;
          });
        },
      },
    ]);
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
    const commonModeValue = monthModes.find((m) => Boolean(m && m.trim())) || defaultPaymentMode;

    const getMonthModeLabel = (pm: string) => {
      if (!pm) return paymentModeOptions.find((p) => p.value === defaultPaymentMode)?.label || 'UPI';
      return paymentModeOptions.find((p) => p.value === pm)?.label || pm;
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
                  mode === 'actual' ? 'actual transaction' : 'estimate amount'
                }`}
                value={draft.values[month] || ''}
                onChange={(event) =>
                  editBudgetTransactionDraftAmount(subcategory, month, event.target.value)
                }
                onKeyDown={(event) => handleBudgetTransactionDraftKeyDown(event, subcategory)}
                placeholder={activeCurSym || currencyService.getActiveCurrencyConfig().symbol}
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
                  const commonValue = commonSelect?.value || commonModeValue || defaultPaymentMode;
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
                value={commonModeValue}
                onChange={(event) => {
                  const val = event.target.value;
                  editBudgetTransactionDraft(subcategory, {
                    monthPaymentModes: new Array(12).fill(val),
                  });
                }}
              >
                {paymentModeOptions.map((pm) => (
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
                  value={monthModes[month] || commonModeValue}
                  onChange={(event) => {
                    const updated = [...monthModes];
                    for (let i = 0; i < 12; i++) {
                      if (!updated[i]) updated[i] = commonModeValue;
                    }
                    updated[month] = event.target.value;
                    editBudgetTransactionDraft(subcategory, {
                      monthPaymentModes: updated,
                    });
                  }}
                  title={`${MONTHS[month]} payment mode: ${getMonthModeLabel(monthModes[month] || commonModeValue)}`}
                >
                  {paymentModeOptions.map((pm) => (
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
      if (next.has(id)) {
        next.delete(id);
        // Clear drafts for all subcategories belonging to this category
        setBudgetTransactionDrafts((drafts) => {
          const updated = { ...drafts };
          let changed = false;
          Object.keys(updated).forEach((subId) => {
            if (subId.startsWith(id + ':') || subId.includes(id)) {
              delete updated[subId];
              changed = true;
            }
          });
          return changed ? updated : drafts;
        });
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleSubcategory = (id: string) =>
    setExpandedSubcategories((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        // Automatically remove un-added transaction draft when subcategory is closed
        setBudgetTransactionDrafts((drafts) => {
          if (!drafts[id]) return drafts;
          const updated = { ...drafts };
          delete updated[id];
          return updated;
        });
      } else {
        next.add(id);
      }
      return next;
    });

  const removeCategory = (section: Section, categoryId: string) => {
    const targetKey = `cat-${categoryId}`;
    if (pendingDeleteKeys.has(targetKey)) return;

    const catObj = sections[section].find((c) => c.id === categoryId);
    if (!catObj) return;

    setPendingDeletions((current) => [
      ...current,
      {
        id: `cat-${categoryId}-${Date.now()}`,
        targetKey,
        name: `Category "${catObj.name}"`,
        secondsLeft: 5,
        executeDelete: async () => {
          // 1. Persist to deleted categories so it never returns on refresh
          addDeletedCategory(user?.email, [catObj.name, `${section}:${catObj.name}`, categoryId]);

          // 2. Call backend delete API
          try {
            if (catObj.categoryId) {
              await api.delete(`/categories/${catObj.categoryId}`).catch(() => {});
            }
            await api.delete('/categories', { params: { type: section, name: catObj.name } }).catch(() => {});
          } catch {}

          // 3. Clean up stored budget values & planned transactions for this category
          try {
            const budgetKey = getUserStorageKey(`fintrack-budget-${selectedYear}`, user?.email);
            const storedB = localStorage.getItem(budgetKey);
            if (storedB) {
              const bMap = JSON.parse(storedB);
              delete bMap[categoryId];
              delete bMap[catObj.name];
              delete bMap[`${section}:${catObj.name}`];
              catObj.subcategories.forEach(s => {
                delete bMap[s.id];
                delete bMap[s.name];
              });
              localStorage.setItem(budgetKey, JSON.stringify(bMap));
              setBudgetValues(bMap);
            }

            const txKey = getUserStorageKey(`fintrack-budget-transactions-${selectedYear}`, user?.email);
            const storedTx = localStorage.getItem(txKey);
            if (storedTx) {
              const txMap = JSON.parse(storedTx);
              delete txMap[categoryId];
              catObj.subcategories.forEach(s => {
                delete txMap[s.id];
              });
              localStorage.setItem(txKey, JSON.stringify(txMap));
              setBudgetTransactions(txMap);
            }
          } catch {}

          // 4. Update memory state
          setSections((current) => ({
            ...current,
            [section]: current[section].filter((c) => c.id !== categoryId && c.name !== catObj.name),
          }));
        },
      },
    ]);
  };

  const removeSubcategory = (
    section: Section,
    categoryId: string,
    subcategoryId: string,
  ) => {
    const targetKey = `sub-${subcategoryId}`;
    if (pendingDeleteKeys.has(targetKey)) return;

    const category = sections[section].find((c) => c.id === categoryId);
    if (!category) return;
    const subObj = category.subcategories.find((s) => s.id === subcategoryId);
    if (!subObj) return;

    setPendingDeletions((current) => [
      ...current,
      {
        id: `sub-${subcategoryId}-${Date.now()}`,
        targetKey,
        name: `Subcategory "${subObj.name}"`,
        secondsLeft: 5,
        executeDelete: () => {
          setSections((current) => ({
            ...current,
            [section]: current[section].map((cat) =>
              cat.id === categoryId
                ? {
                    ...cat,
                    subcategories: cat.subcategories.filter((s) => s.id !== subcategoryId),
                  }
                : cat,
            ),
          }));
        },
      },
    ]);
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
      unmarkDeletedCategory(user?.email, name);
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

            const isCategoryPending = pendingDeleteKeys.has(`cat-${category.id}`);
            const pendingCatItem = isCategoryPending
              ? pendingDeletions.find((p) => p.targetKey === `cat-${category.id}`)
              : null;

            return (
              <React.Fragment key={category.id}>
                <tr
                  className={`budget-category-row budget-category-row-${section}`}
                  onClick={isCategoryPending ? undefined : () => toggle(category.id)}
                  style={isCategoryPending ? { opacity: 0.5, filter: 'grayscale(0.6)', cursor: 'not-allowed' } : undefined}
                >
                  <td className="sticky-col budget-category-label">
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span>{category.name}</span>

                    <button
                      className="budget-delete-button"
                      type="button"
                      disabled={isCategoryPending}
                      title={isCategoryPending ? 'Deletion pending (Click Undo in toast to cancel)' : 'Remove category'}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!isCategoryPending) {
                          removeCategory(section, category.id);
                        }
                      }}
                    >
                      {isCategoryPending ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>
                          {pendingCatItem?.secondsLeft}s
                        </span>
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
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

                    const isSubcategoryPending = pendingDeleteKeys.has(`sub-${subcategory.id}`);
                    const pendingSubItem = isSubcategoryPending
                      ? pendingDeletions.find((p) => p.targetKey === `sub-${subcategory.id}`)
                      : null;

                    return (
                      <React.Fragment key={subcategory.id}>
                        <tr
                          className={`budget-subcategory-row budget-subcategory-row-${section} has-transaction-details`}
                          onClick={isSubcategoryPending ? undefined : () => toggleSubcategory(subcategory.id)}
                          style={isSubcategoryPending ? { opacity: 0.5, filter: 'grayscale(0.6)', cursor: 'not-allowed' } : undefined}
                        >
                          <td className="sticky-col budget-subcategory-label">
                            {detailsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            <span>{subcategory.name}</span>

                            <div className="budget-row-actions">
                              {mode === 'budget' && (
                                <button
                                  className="budget-inline-add-btn"
                                  type="button"
                                  title="Add transaction"
                                  disabled={isSubcategoryPending}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    beginBudgetTransaction(subcategory);
                                  }}
                                >
                                  <Plus size={13} />
                                </button>
                              )}
                              <button
                                className="budget-delete-button"
                                type="button"
                                disabled={isSubcategoryPending}
                                title={isSubcategoryPending ? 'Deletion pending (Click Undo in toast to cancel)' : 'Remove subcategory'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!isSubcategoryPending) {
                                    removeSubcategory(section, category.id, subcategory.id);
                                  }
                                }}
                              >
                                {isSubcategoryPending ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>
                                    {pendingSubItem?.secondsLeft}s
                                  </span>
                                ) : (
                                  <Trash2 size={13} />
                                )}
                              </button>
                            </div>
                          </td>

                          {MONTHS.map((monthName, month) => {
                            const subVal = subcategoryValues[month];
                            const isCellActive =
                              mode === 'actual' &&
                              monthDrawer?.isOpen &&
                              monthDrawer.categoryName === category.name &&
                              monthDrawer.subcategoryName === subcategory.name &&
                              monthDrawer.monthIndex === month;

                            return (
                              <td
                                key={month}
                                onClick={
                                  mode === 'actual'
                                    ? (e) => {
                                        e.stopPropagation();
                                        handleOpenMonthDrawer(
                                          section,
                                          category.name,
                                          subcategory.name,
                                          month,
                                          monthName,
                                          subVal,
                                          subcategory.id,
                                        );
                                      }
                                    : undefined
                                }
                                style={{ cursor: mode === 'actual' ? 'pointer' : 'default' }}
                                title={mode === 'actual' ? `Click to view ${monthName} transactions` : undefined}
                              >
                                <span
                                  className={
                                    mode === 'actual'
                                      ? `budget-amount-clickable ${isCellActive ? 'active-cell-highlight' : ''}`
                                      : ''
                                  }
                                >
                                  {cell(subVal)}
                                </span>
                              </td>
                            );
                          })}

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

                              const isBtxPending = pendingDeleteKeys.has(`btx-${detail.id}`);
                              const pendingBtxItem = isBtxPending
                                ? pendingDeletions.find((p) => p.targetKey === `btx-${detail.id}`)
                                : null;

                              return (
                                <tr
                                  className={`budget-transaction-row budget-transaction-row-${section}`}
                                  key={detail.id}
                                  style={isBtxPending ? { opacity: 0.5, filter: 'grayscale(0.6)', cursor: 'not-allowed' } : undefined}
                                >
                                  <td className="sticky-col budget-transaction-label">
                                    <small>{displayDay}</small>
                                    <span>{detail.name}</span>

                                    {mode === 'budget' && !isViewOnly && (
                                      <div className="budget-row-actions">
                                        <button
                                          className="budget-edit-button"
                                          type="button"
                                          disabled={isBtxPending}
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
                                          disabled={isBtxPending}
                                          title={isBtxPending ? 'Deletion pending (Click Undo in toast to cancel)' : 'Delete planned transaction'}
                                          onClick={() => {
                                            if (!isBtxPending) {
                                              removeBudgetTransaction(subcategory, detail.id);
                                            }
                                          }}
                                        >
                                          {isBtxPending ? (
                                            <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444' }}>
                                              {pendingBtxItem?.secondsLeft}s
                                            </span>
                                          ) : (
                                            <Trash2 size={12} />
                                          )}
                                        </button>
                                      </div>
                                    )}
                                  </td>

                                  {MONTHS.map((monthName, month) => {
                                    const val = detail.values[month] || 0;
                                    return (
                                      <td
                                        key={month}
                                        onClick={
                                          mode === 'actual'
                                            ? (e) => {
                                                e.stopPropagation();
                                                handleOpenMonthDrawer(
                                                  section,
                                                  category.name,
                                                  subcategory.name,
                                                  month,
                                                  monthName,
                                                  val,
                                                  subcategory.id,
                                                );
                                              }
                                            : undefined
                                        }
                                        style={{ cursor: mode === 'actual' ? 'pointer' : 'default' }}
                                        title={mode === 'actual' ? `Click to view ${monthName} transactions` : undefined}
                                      >
                                        <span className={mode === 'actual' ? "budget-amount-clickable" : ""}>
                                          {cell(val)}
                                        </span>
                                      </td>
                                    );
                                  })}

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

                        {detailsOpen && !isViewOnly && !budgetTransactionDrafts[subcategory.id] && (
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

                {isOpen && !isViewOnly && (
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
  const savingsTotals = sectionTotals('savings');

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
                    <span>Estimate & Budget Planner</span>
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
                  Annual Estimate & Budget Planner
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  ({selectedYear})
                </span>
              </div>
            </div>

            <div className="budget-toolbar-actions" style={{ gap: 10 }}>
              {/* Year controls with physical sliding carousel motion */}
              <div className="budget-year-control">
                <button
                  className="year-arrow year-arrow-prev"
                  type="button"
                  onClick={handlePrevYear}
                  disabled={isAnimatingYear}
                  aria-label="Previous year"
                  title="Previous year"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="budget-year-carousel-window">
                  {/* Glowing physical glider pill */}
                  <div className={`budget-year-glider ${isAnimatingYear ? 'glider-animating' : ''}`} />

                  {/* Physical moving reel track */}
                  <div
                    className="budget-year-carousel-track"
                    style={{
                      transform: `translateX(${trackOffset}px)`,
                      transition: isAnimatingYear
                        ? 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)'
                        : 'none',
                    }}
                  >
                    {[
                      selectedYear - 2,
                      selectedYear - 1,
                      selectedYear,
                      selectedYear + 1,
                      selectedYear + 2,
                    ].map((year, idx) => {
                      const isCenter = idx === 2;
                      return (
                        <button
                          key={`${year}-${idx}`}
                          type="button"
                          className={`budget-year-slot-btn ${isCenter ? 'active' : ''}`}
                          onClick={() => {
                            if (idx === 1) handlePrevYear();
                            else if (idx === 3) handleNextYear();
                          }}
                          disabled={isAnimatingYear}
                          title={idx === 1 ? `Go to ${year}` : idx === 3 ? `Go to ${year}` : `${year}`}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  className="year-arrow year-arrow-next"
                  type="button"
                  onClick={handleNextYear}
                  disabled={isAnimatingYear}
                  aria-label="Next year"
                  title="Next year"
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
                            const current = new Date().getFullYear();
                            setSelectedYear(current);
                            yearService.setSelectedYear(current);
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
                              yearService.setSelectedYear(year);
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

              {/* Mode Toggle: Estimate Budget vs Actual */}
              <div className="budget-mode-toggle">
                <button
                  type="button"
                  className={mode === 'budget' ? 'active' : ''}
                  onClick={() => setMode('budget')}
                >
                  Estimate Budget
                </button>
                <button
                  type="button"
                  className={mode === 'actual' ? 'active' : ''}
                  onClick={() => setMode('actual')}
                >
                  Actual
                </button>
              </div>

              {!isViewOnly && (
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
              )}
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
                {drawSection('expense', 'EXPENSES', <TrendingDown size={15} />)}

                <tr className="net-cashflow-row" style={{ background: 'rgba(16, 185, 129, 0.08)', borderTop: '2px solid rgba(16, 185, 129, 0.3)' }}>
                  <td className="sticky-col" style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, color: 'var(--text-primary)' }}>
                    NET SAVINGS (INCOME – EXPENSES)
                  </td>
                  {MONTHS.map((_, month) => {
                    const value = incomeTotals[month] - expenseTotals[month];
                    return (
                      <td key={month} className={value >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 700 }}>
                        {cell(value)}
                      </td>
                    );
                  })}
                  <td className="col-year-total" style={{ fontWeight: 800 }}>
                    {currency(total(incomeTotals) - total(expenseTotals))}
                  </td>
                </tr>

                {drawSection('savings', 'SAVINGS & INVESTMENTS ALLOCATION', <PiggyBank size={15} />)}

                <tr className="net-cashflow-row" style={{ background: 'rgba(99, 102, 241, 0.05)' }}>
                  <td className="sticky-col" style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 600 }}>
                    REMAINING CASH SURPLUS
                  </td>
                  {MONTHS.map((_, month) => {
                    const value = incomeTotals[month] - expenseTotals[month] - savingsTotals[month];
                    return (
                      <td key={month} className={value >= 0 ? 'positive' : 'negative'}>
                        {cell(value)}
                      </td>
                    );
                  })}
                  <td className="col-year-total" style={{ fontWeight: 700 }}>
                    {currency(total(incomeTotals) - total(expenseTotals) - total(savingsTotals))}
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
                    <span>Estimate & Budget Planner</span>
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
            className="transactions-filter-toolbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            {/* Fixed-width Search Input to keep all button positions 100% stable */}
            <div
              style={{
                width: 280,
                flexShrink: 0,
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
                placeholder="Search transactions..."
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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

            {/* Modern Date Filter Popover */}
            <div style={{ position: 'relative', flexShrink: 0 }} ref={dateFilterRef}>
              <button
                type="button"
                onClick={() => {
                  setShowDateFilterPopover((open) => !open);
                  setShowAmountFilterPopover(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: fromDate || toDate ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-input)',
                  border: fromDate || toDate ? '1px solid var(--accent-indigo)' : '1px solid var(--border-color)',
                  color: fromDate || toDate ? 'var(--accent-indigo)' : 'var(--text-primary)',
                  padding: '9px 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: fromDate || toDate ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  minWidth: 130,
                  whiteSpace: 'nowrap',
                }}
                title="Filter by date range"
              >
                <Calendar size={15} />
                <span>{getDateFilterLabel()}</span>
                {(fromDate || toDate) && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setFromDate('');
                      setToDate('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: 2,
                      padding: 2,
                      borderRadius: 4,
                    }}
                    title="Clear date filter"
                  >
                    <X size={13} />
                  </span>
                )}
              </button>

              {showDateFilterPopover && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    width: 310,
                    background: 'var(--bg-card, #0d1527)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 14,
                    padding: 16,
                    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    QUICK PRESETS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { key: 'all', label: 'All Time' },
                      { key: 'this_month', label: 'This Month' },
                      { key: 'last_month', label: 'Last Month' },
                      { key: 'last_30', label: 'Last 30 Days' },
                      { key: 'this_year', label: `${selectedYear}` },
                    ].map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => applyDatePreset(p.key as any)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    CUSTOM DATE RANGE
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>From:</span>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        style={{
                          flex: 1,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: '6px 10px',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                          outline: 'none',
                          colorScheme: 'dark',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>To:</span>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        style={{
                          flex: 1,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: '6px 10px',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                          outline: 'none',
                          colorScheme: 'dark',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate('');
                        setToDate('');
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDateFilterPopover(false)}
                      style={{
                        background: 'var(--accent-indigo)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modern Amount Range Filter Popover with Min & Max Sliders */}
            <div style={{ position: 'relative', flexShrink: 0 }} ref={amountFilterRef}>
              <button
                type="button"
                onClick={() => {
                  setShowAmountFilterPopover((open) => !open);
                  setShowDateFilterPopover(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: minAmount || maxAmount ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-input)',
                  border: minAmount || maxAmount ? '1px solid var(--accent-indigo)' : '1px solid var(--border-color)',
                  color: minAmount || maxAmount ? 'var(--accent-indigo)' : 'var(--text-primary)',
                  padding: '9px 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: minAmount || maxAmount ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  minWidth: 130,
                  whiteSpace: 'nowrap',
                }}
                title="Filter by amount range"
              >
                <SlidersHorizontal size={14} />
                <span>{getAmountFilterLabel()}</span>
                {(minAmount || maxAmount) && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setMinAmount('');
                      setMaxAmount('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: 2,
                      padding: 2,
                      borderRadius: 4,
                    }}
                    title="Clear amount filter"
                  >
                    <X size={13} />
                  </span>
                )}
              </button>

              {showAmountFilterPopover && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    width: 320,
                    background: 'var(--bg-card, #0d1527)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 14,
                    padding: 16,
                    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    QUICK PRESETS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'under_1k', label: `< ${activeCurSym}1,000` },
                      { key: '1k_5k', label: `${activeCurSym}1k - ${activeCurSym}5k` },
                      { key: '5k_20k', label: `${activeCurSym}5k - ${activeCurSym}20k` },
                      { key: 'above_20k', label: `> ${activeCurSym}20,000` },
                    ].map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => applyAmountPreset(p.key as any)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    AMOUNT RANGE ({activeCurSym})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Min {activeCurSym}</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={minAmount}
                        onChange={(e) => setMinAmount(e.target.value)}
                        style={{
                          width: '100%',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: '6px 10px',
                          color: 'var(--text-primary)',
                          fontSize: 13,
                          outline: 'none',
                          marginTop: 3,
                        }}
                      />
                    </div>
                    <span style={{ color: 'var(--text-muted)', paddingTop: 16 }}>—</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max {activeCurSym}</span>
                      <input
                        type="number"
                        placeholder="Any"
                        value={maxAmount}
                        onChange={(e) => setMaxAmount(e.target.value)}
                        style={{
                          width: '100%',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: '6px 10px',
                          color: 'var(--text-primary)',
                          fontSize: 13,
                          outline: 'none',
                          marginTop: 3,
                        }}
                      />
                    </div>
                  </div>

                  {/* Min Amount Slider */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span>Min: {activeCurSym}{minAmount || '0'}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50000}
                      step={500}
                      value={Number(minAmount) || 0}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMinAmount(val === '0' ? '' : val);
                        if (maxAmount && Number(val) > Number(maxAmount)) {
                          setMaxAmount(val);
                        }
                      }}
                      style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent-indigo)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>{activeCurSym}0</span>
                      <span>{activeCurSym}25k</span>
                      <span>{activeCurSym}50k</span>
                    </div>
                  </div>

                  {/* Max Amount Slider */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span>Max: {maxAmount ? `${activeCurSym}${maxAmount}` : `Any (${activeCurSym}50k+)`}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50000}
                      step={500}
                      value={Number(maxAmount) || 50000}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMaxAmount(val === '50000' ? '' : val);
                        if (minAmount && Number(val) < Number(minAmount)) {
                          setMinAmount(val);
                        }
                      }}
                      style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent-indigo)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>{activeCurSym}0</span>
                      <span>{activeCurSym}25k</span>
                      <span>{activeCurSym}50k+</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMinAmount('');
                        setMaxAmount('');
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAmountFilterPopover(false)}
                      style={{
                        background: 'var(--accent-indigo)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}
            >
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#EF4444',
                    padding: '8px 14px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title="Clear all active filters"
                >
                  <RotateCcw size={12} />
                  <span>Clear Filters</span>
                </button>
              )}

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  whiteSpace: 'nowrap',
                }}
              >
                Showing {filteredTransactions.length} of {rawTransactions.length} transactions
              </div>
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
                            height: 265,
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
                            height: 265,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          No transactions found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {paginatedTransactions.map((t, idx) => {
                        const isTxPending = pendingDeleteKeys.has(`tx-${t.id}`);
                        const pendingTxItem = isTxPending
                          ? pendingDeletions.find((p) => p.targetKey === `tx-${t.id}`)
                          : null;

                        return (
                        <tr
                          key={t.id || idx}
                          style={isTxPending ? { opacity: 0.45, filter: 'grayscale(0.6)', textDecoration: 'line-through' } : undefined}
                        >
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
                              {formatPaymentModeName(t.paymentMode)}
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
                            {!isViewOnly ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <button
                                type="button"
                                disabled={isTxPending}
                                onClick={() => handleEditTransaction(t)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: isTxPending ? 'rgba(255, 255, 255, 0.2)' : 'var(--text-muted)',
                                  cursor: isTxPending ? 'not-allowed' : 'pointer',
                                  padding: 4,
                                  borderRadius: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s',
                                }}
                                title="Update transaction"
                                onMouseEnter={(e) => (!isTxPending ? (e.currentTarget.style.color = 'var(--accent-indigo)') : null)}
                                onMouseLeave={(e) => (!isTxPending ? (e.currentTarget.style.color = 'var(--text-muted)') : null)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                disabled={isTxPending}
                                onClick={() => handleDeleteTransaction(t.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: isTxPending ? '#EF4444' : 'var(--text-muted)',
                                  cursor: isTxPending ? 'not-allowed' : 'pointer',
                                  padding: 4,
                                  borderRadius: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s',
                                }}
                                title={isTxPending ? 'Deletion pending (Click Undo in toast to cancel)' : 'Delete transaction'}
                                onMouseEnter={(e) => (!isTxPending ? (e.currentTarget.style.color = '#EF4444') : null)}
                                onMouseLeave={(e) => (!isTxPending ? (e.currentTarget.style.color = 'var(--text-muted)') : null)}
                              >
                                {isTxPending ? (
                                  <span style={{ fontSize: 11, fontWeight: 700 }}>
                                    {pendingTxItem?.secondsLeft}s
                                  </span>
                                ) : (
                                  <Trash2 size={15} />
                                )}
                              </button>
                            </div>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>View only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Maintain minimum 5 rows space so table never reduces or collapses */}
                    {paginatedTransactions.length < 5 &&
                      Array.from({ length: 5 - paginatedTransactions.length }).map((_, emptyIdx) => (
                        <tr key={`empty-row-${emptyIdx}`} className="empty-placeholder-row">
                          <td style={{ height: 53 }}>&nbsp;</td>
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                        </tr>
                      ))}
                  </>
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
                    background: 'var(--bg-card, rgba(11, 14, 20, 0.45))',
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

      {/* Month Transactions Details Drawer */}
      {monthDrawer && monthDrawer.isOpen && (
        <>
          <div
            className="month-transactions-drawer-backdrop"
            onClick={handleCloseMonthDrawer}
          />
          <aside className="month-transactions-drawer" role="dialog" aria-modal="true">
            {/* Header */}
            <div
              style={{
                padding: '24px 24px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color:
                      monthDrawer.section === 'income'
                        ? '#34d399'
                        : monthDrawer.section === 'savings'
                          ? '#60a5fa'
                          : '#f87171',
                  }}
                >
                  {monthDrawer.categoryName}
                  {monthDrawer.subcategoryName && ` / ${monthDrawer.subcategoryName}`}
                </div>
                <button
                  type="button"
                  onClick={handleCloseMonthDrawer}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 4,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Close details"
                >
                  <X size={18} />
                </button>
              </div>

              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {monthDrawer.monthName} Transactions
                </h2>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 6,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {drawerTransactions.length} transaction{drawerTransactions.length === 1 ? '' : 's'}
                  </span>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color:
                        monthDrawer.section === 'income'
                          ? '#34d399'
                          : monthDrawer.section === 'savings'
                            ? '#60a5fa'
                            : '#f87171',
                    }}
                  >
                    {currency(drawerTotal || monthDrawer.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Search input inside drawer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  gap: 8,
                }}
              >
                <Search size={15} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={drawerSearch}
                  onChange={(e) => setDrawerSearch(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    width: '100%',
                  }}
                />
                {drawerSearch && (
                  <button
                    onClick={() => setDrawerSearch('')}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Transaction List */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {filteredDrawerTransactions.length === 0 ? (
                <div
                  style={{
                    padding: '40px 16px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                  }}
                >
                  No transactions found for {monthDrawer.monthName}.
                </div>
              ) : (
                filteredDrawerTransactions.map((tx) => {
                  const sectionColor =
                    monthDrawer.section === 'income'
                      ? '#34d399'
                      : monthDrawer.section === 'savings'
                        ? '#60a5fa'
                        : '#f87171';
                  const badgeBg =
                    monthDrawer.section === 'income'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : monthDrawer.section === 'savings'
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)';

                  return (
                    <div
                      key={tx.id}
                      onClick={() => {
                        if (tx.raw && tx.raw.id) {
                          handleEditTransaction(tx.raw);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 12,
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        cursor: tx.raw?.id ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      }}
                      title={tx.raw?.id ? 'Click to edit transaction' : undefined}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background: badgeBg,
                            color: sectionColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 12,
                            flexShrink: 0,
                          }}
                        >
                          {tx.day}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              marginBottom: 3,
                            }}
                          >
                            {tx.name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Building2 size={12} style={{ color: '#60a5fa' }} />
                            <span>{formatPaymentModeName(tx.paymentMode)}</span>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: sectionColor,
                        }}
                      >
                        {currency(tx.amount)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'var(--bg-secondary, #090e1a)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {!isViewOnly && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenNewTransaction(
                      monthDrawer.categoryName,
                      monthDrawer.subcategoryName !== 'Unallocated' ? monthDrawer.subcategoryName : undefined,
                      monthDrawer.section
                    );
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background:
                      monthDrawer.section === 'income'
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : monthDrawer.section === 'savings'
                          ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                          : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <Plus size={16} />
                  <span>Add Transaction</span>
                </button>
              )}
            </div>
          </aside>
        </>
      )}

      {/* Undo Delete 5-Second Countdown Toasts (Stacked IntelliJ notification style) */}
      {pendingDeletions.length > 0 && (
        <div className="undo-toast-container">
          {pendingDeletions.map((item) => (
            <div key={item.id} className="undo-delete-toast" role="status" aria-live="polite">
              <div className="undo-countdown-badge">
                {item.secondsLeft}s
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#f8fafc',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={item.name}
                >
                  {item.name}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Deleting permanently in {item.secondsLeft}s
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleUndoDeletionItem(item.id)}
                className="undo-button-action"
                title="Cancel deletion (Undo)"
              >
                <RotateCcw size={13} />
                <span>Undo</span>
              </button>
            </div>
          ))}
        </div>
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
