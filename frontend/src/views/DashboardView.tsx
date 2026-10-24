import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Landmark,
  Target,
  Percent,
  CreditCard,
  Layers,
  TrendingUp,
  TrendingDown,
  PiggyBank
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { cardService } from '../services/cardService';
import { getUserStorageKey } from '../services/storageHelper';
import { yearService } from '../services/yearService';
import { currencyService } from '../services/currencyService';
import { useTheme } from '../context/ThemeContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

interface DashboardViewProps {
  onOpenNewTransaction: () => void;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Bonus & Incentives',
  'Other Income',
  'Government Subsidy',
  'Rewards and Cashback',
  'Borrow / Debt Collected'
];

const DEFAULT_SAVINGS_CATEGORIES = [
  'Investments',
  'Emergency Fund',
  'Mutual Funds',
  'Fixed Deposits',
  'Retirement Savings'
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Housing & Rent',
  'Food & Groceries',
  'Utilities & Internet',
  'Dining & Entertainment',
  'Shopping & Travel',
  'Healthcare & Medical',
  'Transportation & Auto',
  'Debt Repayment'
];

type SectionKey = 'income' | 'savings' | 'expense';
type DashboardMode = 'combined' | 'estimate' | 'actual';

interface CategoryRowData {
  name: string;
  budget: number;
  actual: number;
  variance: number;
  pctUsed: number;
  status: 'below' | 'within' | 'over' | 'target_met';
  statusText: string;
}

// 4-Stage Color Generator for Percentages (Point 4) with Purple for >100%
export const getPercentageColor = (pct: number, isExpense: boolean = true): string => {
  if (pct > 100) return '#A855F7'; // Excess / Over 100%: Purple as requested
  if (isExpense) {
    if (pct < 50) return '#38BDF8'; // Low (< 50%): Sky / Cyan
    if (pct <= 85) return '#10B981'; // Mid range (50% - 85%): Green
    return '#F59E0B'; // High / Near limit (85% - 100%): Amber
  } else {
    // For Income & Savings
    if (pct < 50) return '#EF4444'; // Low (< 50%): Red
    if (pct < 85) return '#F59E0B'; // Mid (50% - 85%): Amber
    return '#10B981'; // Target Met (85% - 100%): Green
  }
};

// KPI Utilization Color Generator (Point 1): Green (<=70%) -> Sky (70-85%) -> Amber (85-100%) -> Red (>100%)
export const getUtilizationColor = (pct: number): string => {
  if (pct > 100) return '#EF4444'; // Over 100%: Alert / Over-utilized Red
  if (pct > 85) return '#F59E0B';  // 85% - 100%: Warning Amber
  if (pct > 70) return '#38BDF8';  // 70% - 85%: Moderate Sky Blue
  return '#10B981';                // <= 70%: Healthy Green
};

// Compact Currency Formatter: converts from base INR and prepends active currency symbol
export const formatCompactCurrency = (amountInr: number): string => {
  const cfg = currencyService.getActiveCurrencyConfig();
  const converted = currencyService.convertFromBase(amountInr);
  if (Math.abs(converted) < 0.01) {
    return `${cfg.symbol}0`;
  }
  const sign = converted > 0 ? '+' : '-';
  const abs = Math.abs(converted);
  if (abs >= 1000000) {
    return `${sign}${cfg.symbol}${(abs / 1000000).toFixed(1)}M`;
  }
  if (abs >= 1000) {
    return `${sign}${cfg.symbol}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  }
  return `${sign}${cfg.symbol}${Math.round(abs)}`;
};

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenNewTransaction }) => {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === 'light';

  // Currency reactivity
  const [currencyTick, setCurrencyTick] = useState<number>(0);
  useEffect(() => {
    const onCurChange = () => setCurrencyTick(t => t + 1);
    window.addEventListener('fintrack-currency-change', onCurChange);
    window.addEventListener('fintrack-currency-rates-updated', onCurChange);
    return () => {
      window.removeEventListener('fintrack-currency-change', onCurChange);
      window.removeEventListener('fintrack-currency-rates-updated', onCurChange);
    };
  }, []);

  // Synchronized Year State (Point 3)
  const [selectedYear, setSelectedYear] = useState<number>(() => yearService.getSelectedYear());

  // Multi-Month Selection State (Point 5): Default to current month
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth()]);

  // Dashboard Mode Toggle (Point 7): 'combined' | 'estimate' | 'actual'
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('combined');

  // Percentage Basis for Combined & Actual Modes: default to 'income' as requested
  const [pctBasis, setPctBasis] = useState<'estimate' | 'income'>('income');

  // Smooth Trend Chart Metric: 'savings' | 'income' | 'expense' | 'net' (Point 5)
  const [trendMetric, setTrendMetric] = useState<'savings' | 'income' | 'expense' | 'net'>('savings');

  // Drag-to-select Months State (Point 1)
  const [isDraggingMonths, setIsDraggingMonths] = useState<boolean>(false);
  const [dragStartMonth, setDragStartMonth] = useState<number | null>(null);

  // Global mouseup listener for smooth drag-to-select release
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDraggingMonths(false);
      setDragStartMonth(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const [loading, setLoading] = useState<boolean>(true);

  // Synchronize year changes between Dashboard and Budget & Transactions
  useEffect(() => {
    const handleYearChange = (e: any) => {
      if (e.detail && e.detail !== selectedYear) {
        setSelectedYear(e.detail);
      }
    };
    window.addEventListener('fintrack-year-changed', handleYearChange);
    return () => window.removeEventListener('fintrack-year-changed', handleYearChange);
  }, [selectedYear]);

  const changeYear = (yr: number) => {
    setSelectedYear(yr);
    yearService.setSelectedYear(yr);
  };

  // Raw data from backend and local storage
  const [transactions, setTransactions] = useState<any[]>([]);
  const [backendCategories, setBackendCategories] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>({
    totalIncome: 0,
    totalExpenses: 0,
    totalSavings: 0,
    netWorth: 0,
    cashFlow: 0,
    savingsRate: 0
  });

  // Expandable sections state (Income, Savings, Expenses)
  // Point 2: DEFAULT TO COLLAPSED (false) so sections do not expand by default on refresh or reload!
  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    income: false,
    savings: false,
    expense: false
  });

  const toggleSection = (sec: SectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sec]: !prev[sec]
    }));
  };

  // Month multi-selection handler (Point 5)
  const toggleMonth = (mIdx: number) => {
    setSelectedMonths(prev => {
      if (prev.length === 12) {
        // If all 12 months were selected, switch to just this clicked month
        return [mIdx];
      }
      if (prev.includes(mIdx)) {
        if (prev.length === 1) return prev; // keep at least 1 month
        return prev.filter(m => m !== mIdx);
      } else {
        return [...prev, mIdx].sort((a, b) => a - b);
      }
    });
  };

  // Drag-to-select Month Range (Point 1)
  const handleMonthMouseDown = (mIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      toggleMonth(mIdx);
      return;
    }
    setIsDraggingMonths(true);
    setDragStartMonth(mIdx);
    setSelectedMonths([mIdx]);
  };

  const handleMonthMouseEnter = (mIdx: number) => {
    if (isDraggingMonths && dragStartMonth !== null) {
      const start = Math.min(dragStartMonth, mIdx);
      const end = Math.max(dragStartMonth, mIdx);
      const range: number[] = [];
      for (let i = start; i <= end; i++) {
        range.push(i);
      }
      setSelectedMonths(range);
    }
  };

  const selectFullYear = () => {
    setSelectedMonths([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  };

  // Fetch all live data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [sumRes, txRes, catRes] = await Promise.all([
        api.get('/dashboard/summary').catch(() => null),
        api.get('/transactions').catch(() => null),
        api.get('/categories').catch(() => null)
      ]);

      if (sumRes?.data?.success && sumRes.data.data) {
        setSummaryData(sumRes.data.data);
      }

      if (txRes?.data?.success && Array.isArray(txRes.data.data)) {
        setTransactions(txRes.data.data);
      }

      if (catRes?.data?.success && Array.isArray(catRes.data.data)) {
        setBackendCategories(catRes.data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const onTxChange = () => {
      fetchData();
    };
    window.addEventListener('fintrack-transactions-changed', onTxChange);
    return () => window.removeEventListener('fintrack-transactions-changed', onTxChange);
  }, [selectedYear]);

  // Read budgeted values from localStorage for selected year
  const budgetStore = useMemo(() => {
    try {
      if (user?.email === 'demo@fintrack.io') {
        seedDemoBudgetData();
      }
      const rawTxKey = getUserStorageKey(`fintrack-budget-transactions-${selectedYear}`, user?.email);
      const rawDirectKey = getUserStorageKey(`fintrack-budget-${selectedYear}`, user?.email);
      const rawTx = localStorage.getItem(rawTxKey);
      const rawDirect = localStorage.getItem(rawDirectKey);
      return {
        tx: rawTx ? JSON.parse(rawTx) : {},
        direct: rawDirect ? JSON.parse(rawDirect) : {}
      };
    } catch {
      return { tx: {}, direct: {} };
    }
  }, [selectedYear, user]);

  // Parse transaction date
  const parseDate = (dStr: string) => {
    if (!dStr) return null;
    const parts = dStr.split('-');
    if (parts.length >= 3) {
      return {
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10) - 1, // 0-based
        day: parseInt(parts[2], 10)
      };
    }
    return null;
  };

  // Helper to determine transaction section
  const getSectionForTransaction = (t: any): SectionKey => {
    const rawType = String(t.type || '').toLowerCase();
    const cat = String(t.category || '').toLowerCase();

    if (rawType === 'income' || cat.includes('salary') || cat.includes('income') || cat.includes('bonus')) {
      return 'income';
    }
    if (rawType === 'savings' || cat.includes('saving') || cat.includes('invest') || cat.includes('mutual') || cat.includes('emergency')) {
      return 'savings';
    }
    return 'expense';
  };

  // Helper to calculate budgeted amount across all selected months (Point 5)
  const getBudgetAmount = (_section: SectionKey, catName: string, months: number[]): number => {
    let monthlySums = new Array(12).fill(0);

    const norm = (s: string) => s.toLowerCase().replace(/^(income|expense|savings):/, '').replace(/[^a-z0-9]/g, '');
    const targetNorm = norm(catName);

    const allKeys = Array.from(new Set([...Object.keys(budgetStore.tx), ...Object.keys(budgetStore.direct)]));

    // Priority 1: Exact canonical match
    let matchingKeys = allKeys.filter(k => norm(k) === targetNorm);

    // Priority 2: Substring match
    if (matchingKeys.length === 0) {
      matchingKeys = allKeys.filter(k => {
        const kn = norm(k);
        return kn.includes(targetNorm) || targetNorm.includes(kn);
      });
    }

    let foundValues: number[] | null = null;

    for (const k of matchingKeys) {
      const txItems = budgetStore.tx[k];
      if (Array.isArray(txItems) && txItems.length > 0) {
        const sumValues = new Array(12).fill(0);
        txItems.forEach((item: any) => {
          if (Array.isArray(item.values)) {
            item.values.forEach((v: number, m: number) => {
              if (m < 12) sumValues[m] += (Number(v) || 0);
            });
          }
        });
        if (sumValues.some(v => v > 0)) {
          foundValues = sumValues;
          break;
        }
      }

      const directArr = budgetStore.direct[k];
      if (Array.isArray(directArr) && directArr.some(v => Number(v) > 0)) {
        foundValues = directArr.map(v => Number(v) || 0);
        break;
      }
    }

    if (foundValues) {
      monthlySums = foundValues;
    }

    return months.reduce((sum, m) => sum + (monthlySums[m] || 0), 0);
  };

  // Build Category Breakdown for each section
  const sectionData = useMemo(() => {
    const catSet: Record<SectionKey, Set<string>> = {
      income: new Set<string>(DEFAULT_INCOME_CATEGORIES),
      savings: new Set<string>(DEFAULT_SAVINGS_CATEGORIES),
      expense: new Set<string>(DEFAULT_EXPENSE_CATEGORIES)
    };

    const junkNames = new Set(['ht', 'sd', 'tes', 'test', 'uncategorized']);

    backendCategories.forEach(c => {
      const sec: SectionKey = c.type === 'income' ? 'income' : c.type === 'savings' ? 'savings' : 'expense';
      if (c.name && c.name.trim().length > 2 && !junkNames.has(c.name.trim().toLowerCase())) {
        catSet[sec].add(c.name.trim());
      }
    });

    transactions.forEach(t => {
      if (t.category && t.category.trim().length > 2 && !junkNames.has(t.category.trim().toLowerCase())) {
        const sec = getSectionForTransaction(t);
        catSet[sec].add(t.category.trim());
      }
    });

    const result: Record<SectionKey, { rows: CategoryRowData[]; totalBudget: number; totalActual: number; totalVariance: number }> = {
      income: { rows: [], totalBudget: 0, totalActual: 0, totalVariance: 0 },
      savings: { rows: [], totalBudget: 0, totalActual: 0, totalVariance: 0 },
      expense: { rows: [], totalBudget: 0, totalActual: 0, totalVariance: 0 }
    };

    (['income', 'savings', 'expense'] as SectionKey[]).forEach(sec => {
      const names = Array.from(catSet[sec]);

      const rows: CategoryRowData[] = names.map(catName => {
        // Calculate actual across all selected months
        const actual = transactions.reduce((sum, t) => {
          const p = parseDate(t.date);
          if (!p || p.year !== selectedYear) return sum;
          if (!selectedMonths.includes(p.month)) return sum;

          const tSec = getSectionForTransaction(t);
          if (tSec !== sec) return sum;

          if (String(t.category || '').toLowerCase() === catName.toLowerCase()) {
            return sum + (Number(t.amount) || 0);
          }
          return sum;
        }, 0);

        // Calculate budget across all selected months
        const budget = getBudgetAmount(sec, catName, selectedMonths);

        let variance = 0;
        let pctUsed = 0;
        let status: 'below' | 'within' | 'over' | 'target_met' = 'below';
        let statusText = 'Below Estimate';

        if (sec === 'expense') {
          variance = budget - actual;
          pctUsed = budget > 0 ? Math.round((actual / budget) * 100) : (actual > 0 ? 100 : 0);
          if (budget > 0) {
            if (actual <= budget) {
              status = 'within';
              statusText = 'Within Estimate';
            } else {
              status = 'over';
              statusText = 'Over Estimate';
            }
          } else {
            status = actual > 0 ? 'over' : 'below';
            statusText = actual > 0 ? 'Over Estimate' : 'Below Estimate';
          }
        } else {
          // Income & Savings
          variance = actual - budget;
          pctUsed = budget > 0 ? Math.round((actual / budget) * 100) : (actual > 0 ? 100 : 0);
          if (budget > 0 && actual >= budget) {
            status = 'target_met';
            statusText = 'Target Met';
          } else {
            status = 'below';
            statusText = 'Below Estimate';
          }
        }

        return {
          name: catName,
          budget,
          actual,
          variance,
          pctUsed,
          status,
          statusText
        };
      });

      const activeRows = rows.filter(r => r.actual > 0 || r.budget > 0);
      const finalRows = activeRows.length > 0 ? activeRows : rows;

      const totalBudget = finalRows.reduce((s, r) => s + r.budget, 0);
      const totalActual = finalRows.reduce((s, r) => s + r.actual, 0);
      const totalVariance = sec === 'expense' ? (totalBudget - totalActual) : (totalActual - totalBudget);

      result[sec] = {
        rows: finalRows,
        totalBudget,
        totalActual,
        totalVariance
      };
    });

    return result;
  }, [transactions, backendCategories, budgetStore, selectedYear, selectedMonths]);

  // Overall Top Metrics & Comprehensive Net Worth Calculation (Point 4 & Point 6)
  const metrics = useMemo(() => {
    const estimateIncome = sectionData.income.totalBudget;
    const estimateExpenses = sectionData.expense.totalBudget;
    const estimateSavings = sectionData.savings.totalBudget;

    const actualIncome = sectionData.income.totalActual;
    const actualExpenses = sectionData.expense.totalActual;
    const actualSavings = sectionData.savings.totalActual;

    // Estimate mode allocation relative to income (Point 3 & 4)
    const totalEstimateAllocated = estimateExpenses + estimateSavings;
    const estimateAllocationPct = estimateIncome > 0
      ? ((totalEstimateAllocated / estimateIncome) * 100).toFixed(1)
      : '0.0';

    // Actual mode utilization relative to income (Point 3 & 4)
    const totalActualUtilized = actualExpenses + actualSavings;
    const actualUtilizationPct = actualIncome > 0
      ? ((totalActualUtilized / actualIncome) * 100).toFixed(1)
      : '0.0';

    const variance = estimateExpenses - actualExpenses;
    const budgetUsedPct = estimateExpenses > 0
      ? ((actualExpenses / estimateExpenses) * 100).toFixed(1)
      : (actualExpenses > 0 ? '100.0' : '0.0');

    const savingsRate = actualIncome > 0
      ? Math.max(0, Math.round((actualSavings / actualIncome) * 100))
      : 0;

    // Assets & Comprehensive Debt/Liability calculation (Point 6)
    let totalCashAssets = 0;
    let totalInvestments = 0;
    let peerDebts = 0;

    transactions.forEach(t => {
      const type = String(t.type || '').toLowerCase();
      const cat = String(t.category || '').toLowerCase();
      const sub = String(t.subcategory || '').toLowerCase();
      const desc = String(t.description || '').toLowerCase();
      const amt = Number(t.amount) || 0;

      if (type === 'income' || cat.includes('salary') || cat.includes('income')) {
        totalCashAssets += amt;
      } else if (type === 'expense') {
        totalCashAssets -= amt;
      } else if (type === 'savings' || cat.includes('invest') || cat.includes('mutual') || cat.includes('emergency')) {
        totalInvestments += amt;
      }

      // Check for peer debt or borrowed money (Point 6)
      if (cat.includes('borrow') || sub.includes('borrow') || desc.includes('borrow') || cat.includes('debt taken')) {
        peerDebts += amt;
      }
    });

    totalCashAssets = Math.max(0, totalCashAssets);

    let totalLoanDebt = 0;
    let physicalAssets = 0;

    try {
      const savedLoans = localStorage.getItem(getUserStorageKey('fintrack_loans_list', user?.email));
      if (savedLoans) {
        const parsed = JSON.parse(savedLoans);
        if (Array.isArray(parsed)) {
          parsed.forEach((l: any) => {
            const p = Number(l.principal) || 0;
            const tenure = Number(l.tenureMonths) || 1;
            const paid = Number(l.paidMonths) || 0;
            // Total Outstanding Principal remaining on this loan (Point 6)
            const remaining = Math.max(0, p * ((tenure - paid) / tenure));
            totalLoanDebt += remaining;

            if (l.type === 'Home Loan') {
              physicalAssets += p * 1.35; // Market property asset
            } else if (l.type === 'Auto Loan') {
              physicalAssets += p * 1.1; // Vehicle asset
            }
          });
        }
      }
    } catch {}

    // Credit card current outstanding liability (Point 6)
    let ccOutstanding = 0;
    try {
      const ccTxs = transactions.filter(t => {
        const p = parseDate(t.date);
        return String(t.paymentMode || '').toLowerCase() === 'credit' && p && p.year === selectedYear && selectedMonths.includes(p.month);
      });
      ccOutstanding = ccTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    } catch {}

    const totalAssets = totalCashAssets + totalInvestments + physicalAssets;
    const totalLiabilities = totalLoanDebt + ccOutstanding + peerDebts;
    const netWorth = totalAssets - totalLiabilities;

    return {
      estimateIncome,
      estimateExpenses,
      estimateSavings,
      actualIncome,
      actualExpenses,
      actualSavings,
      totalEstimateAllocated,
      estimateAllocationPct,
      totalActualUtilized,
      actualUtilizationPct,
      totalBudgeted: estimateExpenses,
      totalSpent: actualExpenses,
      variance,
      budgetUsedPct,
      totalIncome: actualIncome,
      totalSavings: actualSavings,
      netSavings: actualSavings,
      savingsRate,
      totalAssets,
      totalLiabilities,
      totalLoanDebt,
      ccOutstanding,
      peerDebts,
      netWorth: !isNaN(netWorth) ? netWorth : (summaryData.netWorth || 0)
    };
  }, [sectionData, transactions, selectedYear, selectedMonths, summaryData]);

  // Credit Card Overview Data (Point 3 matching user Image 2)
  const [creditCards, setCreditCards] = useState<any[]>(() => {
    return cardService.getCards(user?.email);
  });

  useEffect(() => {
    setCreditCards(cardService.getCards(user?.email));
  }, [user]);

  useEffect(() => {
    const onCardsUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setCreditCards(e.detail);
      } else {
        setCreditCards(cardService.getCards(user?.email));
      }
    };
    window.addEventListener('fintrack-cards-updated', onCardsUpdated);
    return () => window.removeEventListener('fintrack-cards-updated', onCardsUpdated);
  }, [user]);

  const cardStats = useMemo(() => {
    return creditCards.map(c => {
      const matchingTxs = transactions.filter(t => {
        const pm = String(t.paymentMode || '').toLowerCase();
        const p = parseDate(t.date);
        if (!p || p.year !== selectedYear) return false;
        if (!selectedMonths.includes(p.month)) return false;

        const cardField = String(t.card || t.description || '').toLowerCase();
        const cardNameLower = c.name.toLowerCase();
        const isCardMatch = cardField.includes(cardNameLower) ||
          (c.name.includes('Regalia') && cardField.includes('regalia')) ||
          (c.name.includes('Amazon') && (cardField.includes('amazon') || cardField.includes('icici'))) ||
          (c.name.includes('SBI') && (cardField.includes('sbi') || cardField.includes('blinkit'))) ||
          (c.name.includes('Magnus') && (cardField.includes('magnus') || cardField.includes('axis')));

        return pm === 'credit' && isCardMatch;
      });

      const spent = matchingTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const limit = Number(c.limit) || 100000;
      const usedPct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 1000) / 10) : 0;

      return {
        ...c,
        spent,
        limit,
        usedPct
      };
    });
  }, [creditCards, transactions, selectedYear, selectedMonths]);

  const totalCreditSpent = cardStats.reduce((sum, c) => sum + c.spent, 0);

  // Monthly Trade Statistics (Profit / Loss / Even) for Month Selector (Point 2)
  const monthlyTrades = useMemo(() => {
    const trades: { [month: number]: { income: number; expense: number; net: number; status: 'profit' | 'loss' | 'even' } } = {};
    for (let m = 0; m < 12; m++) {
      let mInc = 0;
      let mExp = 0;
      transactions.forEach(t => {
        const p = parseDate(t.date);
        if (p && p.year === selectedYear && p.month === m) {
          const sec = getSectionForTransaction(t);
          if (sec === 'income') mInc += (Number(t.amount) || 0);
          else if (sec === 'expense') mExp += (Number(t.amount) || 0);
        }
      });
      const net = mInc - mExp;
      trades[m] = {
        income: mInc,
        expense: mExp,
        net,
        status: net > 0 ? 'profit' : net < 0 ? 'loss' : 'even'
      };
    }
    return trades;
  }, [transactions, selectedYear, currencyTick]);

  // Full Year Trade Statistics (sum across all 12 months for Full Year button)
  const fullYearTrade = useMemo(() => {
    let income = 0;
    let expense = 0;
    Object.values(monthlyTrades).forEach(t => {
      income += t.income;
      expense += t.expense;
    });
    const net = income - expense;
    return {
      income,
      expense,
      net,
      status: net > 0 ? 'profit' : net < 0 ? 'loss' : 'even'
    };
  }, [monthlyTrades, currencyTick]);

  // Smooth Cumulative Trend Chart Data (Jan..Dec) matching Image 3!
  const smoothTrendChartData = useMemo(() => {
    let cumEst = 0;
    let cumAct = 0;
    const estCumulative: number[] = [];
    const actCumulative: number[] = [];

    for (let m = 0; m < 12; m++) {
      let mEst = 0;
      let mAct = 0;

      if (trendMetric === 'income') {
        DEFAULT_INCOME_CATEGORIES.forEach(c => {
          mEst += getBudgetAmount('income', c, [m]);
        });
        transactions.forEach(t => {
          const p = parseDate(t.date);
          if (p && p.year === selectedYear && p.month === m && getSectionForTransaction(t) === 'income') {
            mAct += (Number(t.amount) || 0);
          }
        });
      } else if (trendMetric === 'expense') {
        DEFAULT_EXPENSE_CATEGORIES.forEach(c => {
          mEst += getBudgetAmount('expense', c, [m]);
        });
        transactions.forEach(t => {
          const p = parseDate(t.date);
          if (p && p.year === selectedYear && p.month === m && getSectionForTransaction(t) === 'expense') {
            mAct += (Number(t.amount) || 0);
          }
        });
      } else if (trendMetric === 'savings') {
        DEFAULT_SAVINGS_CATEGORIES.forEach(c => {
          mEst += getBudgetAmount('savings', c, [m]);
        });
        transactions.forEach(t => {
          const p = parseDate(t.date);
          if (p && p.year === selectedYear && p.month === m && getSectionForTransaction(t) === 'savings') {
            mAct += (Number(t.amount) || 0);
          }
        });
      } else {
        // Net Surplus (Income - Expense)
        let incEst = 0, expEst = 0, incAct = 0, expAct = 0;
        DEFAULT_INCOME_CATEGORIES.forEach(c => { incEst += getBudgetAmount('income', c, [m]); });
        DEFAULT_EXPENSE_CATEGORIES.forEach(c => { expEst += getBudgetAmount('expense', c, [m]); });
        transactions.forEach(t => {
          const p = parseDate(t.date);
          if (p && p.year === selectedYear && p.month === m) {
            const sec = getSectionForTransaction(t);
            if (sec === 'income') incAct += (Number(t.amount) || 0);
            if (sec === 'expense') expAct += (Number(t.amount) || 0);
          }
        });
        mEst = Math.max(0, incEst - expEst);
        mAct = Math.max(0, incAct - expAct);
      }

      cumEst += currencyService.convertFromBase(mEst);
      cumAct += currencyService.convertFromBase(mAct);

      estCumulative.push(Math.round(cumEst));
      actCumulative.push(Math.round(cumAct));
    }

    const primaryColor = trendMetric === 'income' ? '#10B981' : trendMetric === 'expense' ? '#EF4444' : '#3B82F6';
    const metricName = trendMetric === 'savings' ? 'Savings' : trendMetric === 'income' ? 'Income' : trendMetric === 'expense' ? 'Expenses' : 'Net Surplus';

    const datasets: any[] = [];

    if (dashboardMode === 'estimate') {
      datasets.push({
        label: `Estimate ${metricName} (Cumulative)`,
        data: estCumulative,
        borderColor: primaryColor,
        borderWidth: 2.5,
        fill: true,
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return `${primaryColor}22`;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, `${primaryColor}55`);
          gradient.addColorStop(1, `${primaryColor}00`);
          return gradient;
        },
        tension: 0.45,
        cubicInterpolationMode: 'monotone',
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: primaryColor,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      });
    } else if (dashboardMode === 'actual') {
      datasets.push({
        label: `Actual ${metricName} (Cumulative)`,
        data: actCumulative,
        borderColor: primaryColor,
        borderWidth: 2.5,
        fill: true,
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return `${primaryColor}22`;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, `${primaryColor}55`);
          gradient.addColorStop(1, `${primaryColor}00`);
          return gradient;
        },
        tension: 0.45,
        cubicInterpolationMode: 'monotone',
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: primaryColor,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      });
    } else {
      // Combined mode: Estimate Target (dashed) + Actual Cumulative (glowing curve)
      datasets.push({
        label: `Estimate Target`,
        data: estCumulative,
        borderColor: 'rgba(148, 163, 184, 0.6)',
        borderWidth: 2,
        borderDash: [5, 5],
        fill: false,
        tension: 0.45,
        cubicInterpolationMode: 'monotone',
        pointRadius: 0,
        pointHoverRadius: 4
      });
      datasets.push({
        label: `Actual Cumulative`,
        data: actCumulative,
        borderColor: primaryColor,
        borderWidth: 2.5,
        fill: true,
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return `${primaryColor}22`;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, `${primaryColor}55`);
          gradient.addColorStop(1, `${primaryColor}00`);
          return gradient;
        },
        tension: 0.45,
        cubicInterpolationMode: 'monotone',
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: primaryColor,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      });
    }

    return {
      labels: MONTH_NAMES,
      datasets
    };
  }, [budgetStore, transactions, selectedYear, trendMetric, dashboardMode, currencyTick]);

  // Smooth Chart config
  const smoothChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          color: isLight ? '#475569' : '#94A3B8',
          font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true
        }
      },
      tooltip: {
        backgroundColor: isLight ? '#FFFFFF' : '#1E293B',
        titleColor: isLight ? '#0F172A' : '#F8FAFC',
        bodyColor: isLight ? '#334155' : '#CBD5E1',
        borderColor: isLight ? '#E2E8F0' : '#334155',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${currencyService.format(ctx.raw)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: isLight ? '#64748B' : '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' } }
      },
      y: {
        border: { dash: [4, 4] },
        grid: { color: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)' },
        ticks: {
          color: isLight ? '#64748B' : '#94A3B8',
          font: { family: 'Plus Jakarta Sans', size: 11 },
          callback: (val: any) => currencyService.format(val)
        }
      }
    }
  };

  // High-level statistics for the Full-Width Growth Trend Panel (Point 4)
  const trendStats = useMemo(() => {
    const monthlyVals: number[] = [];
    for (let m = 0; m < 12; m++) {
      let val = 0;
      if (trendMetric === 'income') {
        transactions.forEach(t => {
          const p = parseDate(t.date);
          if (p && p.year === selectedYear && p.month === m && getSectionForTransaction(t) === 'income') {
            val += (Number(t.amount) || 0);
          }
        });
      } else if (trendMetric === 'expense') {
        transactions.forEach(t => {
          const p = parseDate(t.date);
          if (p && p.year === selectedYear && p.month === m && getSectionForTransaction(t) === 'expense') {
            val += (Number(t.amount) || 0);
          }
        });
      } else if (trendMetric === 'savings') {
        transactions.forEach(t => {
          const p = parseDate(t.date);
          if (p && p.year === selectedYear && p.month === m && getSectionForTransaction(t) === 'savings') {
            val += (Number(t.amount) || 0);
          }
        });
      } else {
        // net
        let inc = 0, exp = 0;
        transactions.forEach(t => {
          const p = parseDate(t.date);
          if (p && p.year === selectedYear && p.month === m) {
            const sec = getSectionForTransaction(t);
            if (sec === 'income') inc += (Number(t.amount) || 0);
            else if (sec === 'expense') exp += (Number(t.amount) || 0);
          }
        });
        val = inc - exp;
      }
      monthlyVals.push(val);
    }

    const total = monthlyVals.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / 12);
    let peakVal = -Infinity;
    let peakMonthIdx = 0;
    monthlyVals.forEach((v, idx) => {
      if (v > peakVal) {
        peakVal = v;
        peakMonthIdx = idx;
      }
    });

    return {
      total,
      avg,
      peakVal: peakVal === -Infinity ? 0 : peakVal,
      peakMonth: MONTH_NAMES[peakMonthIdx]
    };
  }, [transactions, selectedYear, trendMetric, currencyTick]);

  if (loading && transactions.length === 0) {
    return (
      <main style={{ padding: '40px 32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading dashboard & budget tracking metrics...
      </main>
    );
  }

  // Month selection label helper with compact contiguous range formatting
  const getSelectedMonthLabel = () => {
    if (selectedMonths.length === 12) return 'Full Year (12 mos)';
    if (selectedMonths.length === 1) return `${MONTH_NAMES[selectedMonths[0]]}`;
    const sorted = [...selectedMonths].sort((a, b) => a - b);
    const isContiguous = sorted.every((m, idx) => idx === 0 || m === sorted[idx - 1] + 1);
    if (isContiguous && sorted.length > 2) {
      return `${MONTH_NAMES[sorted[0]]} - ${MONTH_NAMES[sorted[sorted.length - 1]]} (${sorted.length} mos)`;
    }
    if (sorted.length > 3) {
      return `${MONTH_NAMES[sorted[0]]}, ${MONTH_NAMES[sorted[1]]} +${sorted.length - 2} (${sorted.length} mos)`;
    }
    return `${sorted.map(m => MONTH_NAMES[m]).join(', ')} (${sorted.length} mos)`;
  };

  return (
    <main className="fintrack-page-container">
      {/* 1. Page Header matching Image 1 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(139, 92, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8B5CF6'
            }}
          >
            <Target size={22} />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0, fontSize: 22 }}>
              {dashboardMode === 'combined'
                ? 'Financial Performance & Tracking'
                : dashboardMode === 'estimate'
                ? 'Budget Plan & Allocations'
                : 'Real-time Cash Flow & Spending'}
            </h1>
            <p className="page-subtitle" style={{ margin: '2px 0 0', fontSize: 13 }}>
              {dashboardMode === 'combined'
                ? 'Unified overview comparing estimated targets with real cash flow & wealth metrics'
                : dashboardMode === 'estimate'
                ? 'Estimated income targets, expense caps & planned savings allocations'
                : 'Verified actual income receipts, real expenditures & realized savings surplus'}
            </p>
          </div>
        </div>

        {/* Right Header Controls: Dynamic Year Selector & New Transaction */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Dynamic 5-year carousel controls with Prev/Next arrows (Point 3) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-secondary)', padding: '3px 4px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => changeYear(selectedYear - 1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Previous Year"
              aria-label="Previous Year"
            >
              <ChevronLeft size={16} />
            </button>

            {[selectedYear - 2, selectedYear - 1, selectedYear, selectedYear + 1, selectedYear + 2].map(yr => (
              <button
                key={yr}
                type="button"
                onClick={() => changeYear(yr)}
                className={`segmented-btn ${selectedYear === yr ? 'active' : ''}`}
                style={{
                  padding: '5px 12px',
                  fontSize: 13,
                  fontWeight: selectedYear === yr ? 700 : 500,
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                {yr}
              </button>
            ))}

            <button
              type="button"
              onClick={() => changeYear(selectedYear + 1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Next Year"
              aria-label="Next Year"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Quick Current Year button matching Budget & Transactions (Point 3) */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => changeYear(new Date().getFullYear())}
            style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8 }}
            title={`Go to current year (${new Date().getFullYear()})`}
          >
            <CalendarDays size={14} />
            <span>Current Year</span>
          </button>

          <button className="btn-primary" onClick={onOpenNewTransaction}>
            <Plus size={16} />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* 2. Month Navigation Pills with Drag-to-Select Multi-Month Selection (Point 1) */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          border: '1px solid var(--border-color)',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          height: 52,
          minHeight: 52,
          maxHeight: 52,
          boxSizing: 'border-box',
          marginBottom: 16,
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginRight: 6, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
          Month:
        </span>

        {MONTH_NAMES.map((mName, idx) => {
          const isSelected = selectedMonths.includes(idx);
          const trade = monthlyTrades[idx] || { income: 0, expense: 0, net: 0, status: 'even' };
          const isProfit = trade.status === 'profit';
          const isLoss = trade.status === 'loss';
          const tradeColor = isProfit ? '#10B981' : isLoss ? '#EF4444' : '#94A3B8';
          const tradeIcon = isProfit ? '▲' : isLoss ? '▼' : '—';

          const tooltip = isProfit
            ? `${mName} ${selectedYear}: Up Trade (+${currencyService.format(trade.net)} Profit) • Inflow: ${currencyService.format(trade.income)} | Outflow: ${currencyService.format(trade.expense)}`
            : isLoss
            ? `${mName} ${selectedYear}: Down Trade (-${currencyService.format(Math.abs(trade.net))} Deficit) • Inflow: ${currencyService.format(trade.income)} | Outflow: ${currencyService.format(trade.expense)}`
            : `${mName} ${selectedYear}: Balanced Trade (${currencyService.format(0)} Net) • Inflow: ${currencyService.format(trade.income)} | Outflow: ${currencyService.format(trade.expense)}`;

          // Dynamic compact net formatted with active currency conversion & symbol
          const compactNet = formatCompactCurrency(trade.net);

          return (
            <button
              key={mName}
              type="button"
              onMouseDown={(e) => handleMonthMouseDown(idx, e)}
              onMouseEnter={() => handleMonthMouseEnter(idx)}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) toggleMonth(idx);
              }}
              style={{
                minWidth: 68,
                flexShrink: 0,
                background: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                border: isSelected ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid var(--border-color)',
                color: isSelected ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                fontWeight: isSelected ? 700 : 500,
                padding: '4px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                boxShadow: isSelected ? '0 2px 8px rgba(99, 102, 241, 0.2)' : 'none'
              }}
              title={tooltip}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1.2 }}>
                <span>{mName}</span>
                {/* Fixed reserved-width slot (12px) for the checkmark so button width NEVER shifts or expands/contracts */}
                <span
                  style={{
                    width: 12,
                    marginLeft: 2,
                    fontSize: 10,
                    fontWeight: 800,
                    display: 'inline-block',
                    textAlign: 'center',
                    opacity: isSelected ? 1 : 0,
                    color: 'var(--accent-indigo)',
                    transition: 'opacity 0.15s ease'
                  }}
                >
                  ✓
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  fontSize: 10,
                  fontWeight: 700,
                  color: tradeColor,
                  lineHeight: 1
                }}
              >
                <span style={{ fontSize: 8 }}>{tradeIcon}</span>
                <span>{compactNet}</span>
              </div>
            </button>
          );
        })}

        {/* Full Year Option with Stable Width & Profit/Loss Trade Indicator */}
        {(() => {
          const isFullYear = selectedMonths.length === 12;
          const isProfit = fullYearTrade.status === 'profit';
          const isLoss = fullYearTrade.status === 'loss';
          const tradeColor = isProfit ? '#10B981' : isLoss ? '#EF4444' : '#94A3B8';
          const tradeIcon = isProfit ? '▲' : isLoss ? '▼' : '—';

          const tooltip = isProfit
            ? `Full Year ${selectedYear}: Up Trade (+${currencyService.format(fullYearTrade.net)} Profit) • Inflow: ${currencyService.format(fullYearTrade.income)} | Outflow: ${currencyService.format(fullYearTrade.expense)}`
            : isLoss
            ? `Full Year ${selectedYear}: Down Trade (-${currencyService.format(Math.abs(fullYearTrade.net))} Deficit) • Inflow: ${currencyService.format(fullYearTrade.income)} | Outflow: ${currencyService.format(fullYearTrade.expense)}`
            : `Full Year ${selectedYear}: Balanced Trade (${currencyService.format(0)} Net) • Inflow: ${currencyService.format(fullYearTrade.income)} | Outflow: ${currencyService.format(fullYearTrade.expense)}`;

          const compactNet = formatCompactCurrency(fullYearTrade.net);

          return (
            <button
              type="button"
              onClick={selectFullYear}
              style={{
                minWidth: 80,
                flexShrink: 0,
                background: isFullYear ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                border: isFullYear ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid var(--border-color)',
                color: isFullYear ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                fontWeight: isFullYear ? 700 : 500,
                padding: '4px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                marginLeft: 6,
                boxShadow: isFullYear ? '0 2px 8px rgba(99, 102, 241, 0.2)' : 'none'
              }}
              title={tooltip}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1.2 }}>
                <span>Full Year</span>
                {/* Fixed reserved-width slot (12px) for the checkmark so button width NEVER shifts or expands/contracts */}
                <span
                  style={{
                    width: 12,
                    marginLeft: 2,
                    fontSize: 10,
                    fontWeight: 800,
                    display: 'inline-block',
                    textAlign: 'center',
                    opacity: isFullYear ? 1 : 0,
                    color: 'var(--accent-indigo)',
                    transition: 'opacity 0.15s ease'
                  }}
                >
                  ✓
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  fontSize: 10,
                  fontWeight: 700,
                  color: tradeColor,
                  lineHeight: 1
                }}
              >
                <span style={{ fontSize: 8 }}>{tradeIcon}</span>
                <span>{compactNet}</span>
              </div>
            </button>
          );
        })()}

        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingRight: 6, flexShrink: 0 }}>
          Active: <strong style={{ color: 'var(--text-primary)' }}>{getSelectedMonthLabel()}</strong>
        </div>
      </div>

      {/* 3. PERFORMANCE & NET WORTH SUMMARY (Moved above Financial Overview with compact height!) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 18 }}>
        {/* Dynamic KPI Card based on Toggle Mode with 4-level color coding */}
        {dashboardMode === 'estimate' && (() => {
          const kpiPct = parseFloat(metrics.estimateAllocationPct);
          const kpiColor = getUtilizationColor(kpiPct);
          return (
            <div
              className="kpi-card"
              style={{
                padding: '13px 18px',
                borderLeft: `4px solid ${kpiColor}`,
                background: 'var(--bg-secondary)',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="kpi-title" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    ESTIMATE INCOME UTILIZATION
                  </span>
                  <div
                    className="kpi-value"
                    style={{
                      marginTop: 2,
                      fontSize: 24,
                      fontWeight: 800,
                      color: kpiColor,
                      lineHeight: 1.15
                    }}
                  >
                    {metrics.estimateAllocationPct}%
                  </div>
                </div>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${kpiColor}22`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: kpiColor
                  }}
                >
                  <Percent size={16} />
                </div>
              </div>
              {/* Visual progress bar */}
              <div style={{ marginTop: 8, height: 5, width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, kpiPct))}%`,
                    height: '100%',
                    background: kpiColor,
                    borderRadius: 3,
                    transition: 'width 0.3s'
                  }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>{kpiPct <= 100 ? 'Within planned income' : 'Over-allocated income'}</span>
                <span style={{ fontWeight: 600, color: kpiColor }}>
                  {kpiPct <= 100
                    ? `+${currencyService.format(metrics.estimateIncome - metrics.totalEstimateAllocated)} unallocated (${Math.max(0, 100 - kpiPct).toFixed(1)}% remaining)`
                    : `-${currencyService.format(metrics.totalEstimateAllocated - metrics.estimateIncome)} over-budgeted (${(kpiPct - 100).toFixed(1)}% over)`}
                </span>
              </div>
            </div>
          );
        })()}

        {dashboardMode === 'actual' && (() => {
          const isIncomeBasis = pctBasis === 'income';
          const kpiPct = parseFloat(isIncomeBasis ? metrics.actualUtilizationPct : metrics.budgetUsedPct);
          const kpiColor = getUtilizationColor(kpiPct);
          return (
            <div
              className="kpi-card"
              style={{
                padding: '13px 18px',
                borderLeft: `4px solid ${kpiColor}`,
                background: 'var(--bg-secondary)',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="kpi-title" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {isIncomeBasis ? 'ACTUAL INCOME UTILIZATION' : 'ESTIMATE BUDGET USED'}
                  </span>
                  <div
                    className="kpi-value"
                    style={{
                      marginTop: 2,
                      fontSize: 24,
                      fontWeight: 800,
                      color: kpiColor,
                      lineHeight: 1.15
                    }}
                  >
                    {isIncomeBasis ? `${metrics.actualUtilizationPct}%` : `${metrics.budgetUsedPct}%`}
                  </div>
                </div>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${kpiColor}22`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: kpiColor
                  }}
                >
                  <Percent size={16} />
                </div>
              </div>
              {/* Visual progress bar */}
              <div style={{ marginTop: 8, height: 5, width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, kpiPct))}%`,
                    height: '100%',
                    background: kpiColor,
                    borderRadius: 3,
                    transition: 'width 0.3s'
                  }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                {isIncomeBasis ? (
                  <>
                    <span>{kpiPct <= 100 ? 'Within received income' : 'Over-utilized income'}</span>
                    <span style={{ fontWeight: 600, color: kpiColor }}>
                      {kpiPct <= 100
                        ? `+${currencyService.format(metrics.actualIncome - metrics.totalActualUtilized)} unspent balance (${Math.max(0, 100 - kpiPct).toFixed(1)}% remaining)`
                        : `-${currencyService.format(metrics.totalActualUtilized - metrics.actualIncome)} overspent (${(kpiPct - 100).toFixed(1)}% excess)`}
                    </span>
                  </>
                ) : (
                  <>
                    <span>{metrics.actualExpenses <= metrics.estimateExpenses ? 'Within estimate ceiling' : 'Over estimate ceiling'}</span>
                    <span style={{ fontWeight: 600, color: metrics.variance >= 0 ? '#10B981' : '#EF4444' }}>
                      {metrics.variance >= 0 ? `+${currencyService.format(metrics.variance)} saved` : `-${currencyService.format(Math.abs(metrics.variance))} over`}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {dashboardMode === 'combined' && (() => {
          const isIncomeBasis = pctBasis === 'income';
          const kpiPct = parseFloat(isIncomeBasis ? metrics.actualUtilizationPct : metrics.budgetUsedPct);
          const kpiColor = getUtilizationColor(kpiPct);
          return (
            <div
              className="kpi-card"
              style={{
                padding: '13px 18px',
                borderLeft: `4px solid ${kpiColor}`,
                background: 'var(--bg-secondary)',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="kpi-title" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {isIncomeBasis ? 'COMBINED INCOME UTILIZATION' : 'ESTIMATE BUDGET USED'}
                  </span>
                  <div
                    className="kpi-value"
                    style={{
                      marginTop: 2,
                      fontSize: 24,
                      fontWeight: 800,
                      color: kpiColor,
                      lineHeight: 1.15
                    }}
                  >
                    {isIncomeBasis ? `${metrics.actualUtilizationPct}%` : `${metrics.budgetUsedPct}%`}
                  </div>
                </div>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${kpiColor}22`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: kpiColor
                  }}
                >
                  <Percent size={16} />
                </div>
              </div>
              {/* Visual progress bar */}
              <div style={{ marginTop: 8, height: 5, width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, kpiPct))}%`,
                    height: '100%',
                    background: kpiColor,
                    borderRadius: 3,
                    transition: 'width 0.3s'
                  }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                {isIncomeBasis ? (
                  <>
                    <span>{kpiPct <= 100 ? 'Within received income' : 'Over-utilized income'}</span>
                    <span style={{ fontWeight: 600, color: kpiColor }}>
                      {kpiPct <= 100
                        ? `+${currencyService.format(metrics.actualIncome - metrics.totalActualUtilized)} unspent balance (${Math.max(0, 100 - kpiPct).toFixed(1)}% remaining)`
                        : `-${currencyService.format(metrics.totalActualUtilized - metrics.actualIncome)} overspent (${(kpiPct - 100).toFixed(1)}% excess)`}
                    </span>
                  </>
                ) : (
                  <>
                    <span>{metrics.actualExpenses <= metrics.estimateExpenses ? 'Within estimate ceiling' : 'Over estimate ceiling'}</span>
                    <span style={{ fontWeight: 600, color: metrics.variance >= 0 ? '#10B981' : '#EF4444' }}>
                      {metrics.variance >= 0 ? `+${currencyService.format(metrics.variance)} saved` : `-${currencyService.format(Math.abs(metrics.variance))} over`}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* Card 2: COMPREHENSIVE NET WORTH */}
        <div
          className="kpi-card"
          style={{
            padding: '13px 18px',
            borderLeft: '4px solid #8B5CF6',
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="kpi-title" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>TOTAL NET WORTH</span>
              <div className="kpi-value" style={{ marginTop: 2, fontSize: 24, fontWeight: 800, color: '#8B5CF6', lineHeight: 1.15 }}>
                {currencyService.format(metrics.netWorth)}
              </div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139, 92, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6' }}>
              <Landmark size={16} />
            </div>
          </div>
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', fontSize: 11.5, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>
              Assets: <strong style={{ color: '#10B981' }}>{currencyService.format(metrics.totalAssets)}</strong>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              Total Debts & Loans: <strong style={{ color: '#EF4444' }}>-{currencyService.format(metrics.totalLiabilities)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 4. Dashboard View Mode Toggle & Expand/Collapse All Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={16} color="var(--accent-indigo)" />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Financial Overview & Breakdown
            </span>
          </div>

          {/* Quick Expand All / Collapse All Button */}
          <button
            type="button"
            onClick={() => {
              const allExpanded = expandedSections.income && expandedSections.expense && expandedSections.savings;
              setExpandedSections({
                income: !allExpanded,
                expense: !allExpanded,
                savings: !allExpanded
              });
            }}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
            title={expandedSections.income && expandedSections.expense && expandedSections.savings ? 'Collapse all 3 columns' : 'Expand all 3 columns'}
          >
            <ChevronDown
              size={13}
              style={{
                transform: expandedSections.income && expandedSections.expense && expandedSections.savings ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.25s ease'
              }}
            />
            <span>
              {expandedSections.income && expandedSections.expense && expandedSections.savings ? 'Collapse All' : 'Expand All'}
            </span>
          </button>
        </div>

        {/* Mode Toggle: Estimate | Actual | Combined + % Basis Sub-Toggle for Combined & Actual */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {(dashboardMode === 'combined' || dashboardMode === 'actual') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', padding: '3px 6px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>% Basis:</span>
              <button
                type="button"
                className={`segmented-btn ${pctBasis === 'estimate' ? 'active' : ''}`}
                onClick={() => setPctBasis('estimate')}
                style={{ padding: '3px 10px', fontSize: 11, fontWeight: pctBasis === 'estimate' ? 700 : 500, borderRadius: 6 }}
                title="Calculate percentage by comparing Actual vs Estimate"
              >
                vs Estimate
              </button>
              <button
                type="button"
                className={`segmented-btn ${pctBasis === 'income' ? 'active' : ''}`}
                onClick={() => setPctBasis('income')}
                style={{ padding: '3px 10px', fontSize: 11, fontWeight: pctBasis === 'income' ? 700 : 500, borderRadius: 6 }}
                title="Calculate percentage relative to Income (Income Base)"
              >
                vs Income
              </button>
            </div>
          )}

          <div className="segmented-control" style={{ background: 'var(--bg-secondary)', padding: '3px 4px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className={`segmented-btn ${dashboardMode === 'estimate' ? 'active' : ''}`}
              onClick={() => setDashboardMode('estimate')}
              style={{ padding: '6px 16px', fontSize: 12, fontWeight: dashboardMode === 'estimate' ? 700 : 500 }}
            >
              Estimate
            </button>
            <button
              type="button"
              className={`segmented-btn ${dashboardMode === 'actual' ? 'active' : ''}`}
              onClick={() => setDashboardMode('actual')}
              style={{ padding: '6px 16px', fontSize: 12, fontWeight: dashboardMode === 'actual' ? 700 : 500 }}
            >
              Actual
            </button>
            <button
              type="button"
              className={`segmented-btn ${dashboardMode === 'combined' ? 'active' : ''}`}
              onClick={() => setDashboardMode('combined')}
              style={{ padding: '6px 16px', fontSize: 12, fontWeight: dashboardMode === 'combined' ? 700 : 500 }}
            >
              Combined
            </button>
          </div>
        </div>
      </div>

      {/* 4. PRIMARY EXPANDABLE COLUMNS: Income, Expenses, Savings in 3 Distinct Columns Side-by-Side */}
      <div className="dashboard-columns-grid">
        {(['income', 'expense', 'savings'] as SectionKey[]).map(sec => {
          const isExpanded = expandedSections[sec];
          const secInfo = sectionData[sec];
          const title = sec === 'income' ? 'Income' : sec === 'expense' ? 'Expenses' : 'Savings';
          const accentColor = sec === 'income' ? '#10B981' : sec === 'expense' ? '#EF4444' : '#3B82F6';
          const SecIcon = sec === 'income' ? TrendingUp : sec === 'expense' ? TrendingDown : PiggyBank;

          // Percentage calculations based on Dashboard Mode & Basis
          let pctValue = 0;
          let pctLabel = '';
          let subtextLabel = '';
          let subtextColor = 'var(--text-muted)';

          if (dashboardMode === 'combined') {
            if (pctBasis === 'estimate') {
              // Compare Actual vs Estimate for each card
              pctValue = secInfo.totalBudget > 0
                ? (secInfo.totalActual / secInfo.totalBudget) * 100
                : (secInfo.totalActual > 0 ? 100 : 0);
              const formattedPct = pctValue.toFixed(1);

              if (sec === 'income') {
                pctLabel = `${formattedPct}% received`;
                if (secInfo.totalActual < secInfo.totalBudget) {
                  const diff = secInfo.totalBudget - secInfo.totalActual;
                  const remPct = Math.max(0, 100 - pctValue);
                  subtextLabel = `${currencyService.format(diff)} pending (${remPct.toFixed(1)}% remaining)`;
                  subtextColor = '#F59E0B';
                } else if (secInfo.totalActual === secInfo.totalBudget) {
                  subtextLabel = `${currencyService.format(0)} pending (100% completed)`;
                  subtextColor = '#10B981';
                } else {
                  const extra = secInfo.totalActual - secInfo.totalBudget;
                  const extraPct = pctValue - 100;
                  subtextLabel = `+${currencyService.format(extra)} surplus (+${extraPct.toFixed(1)}% extra)`;
                  subtextColor = '#10B981';
                }
              } else if (sec === 'expense') {
                pctLabel = `${formattedPct}% used`;
                if (secInfo.totalActual <= secInfo.totalBudget) {
                  const diff = secInfo.totalBudget - secInfo.totalActual;
                  const leftPct = Math.max(0, 100 - pctValue);
                  subtextLabel = `+${currencyService.format(diff)} budget left (${leftPct.toFixed(1)}% remaining)`;
                  subtextColor = '#10B981';
                } else {
                  const over = secInfo.totalActual - secInfo.totalBudget;
                  const overPct = pctValue - 100;
                  subtextLabel = `-${currencyService.format(over)} over budget (${overPct.toFixed(1)}% excess)`;
                  subtextColor = '#EF4444';
                }
              } else {
                // savings
                pctLabel = `${formattedPct}% saved`;
                if (secInfo.totalActual < secInfo.totalBudget) {
                  const diff = secInfo.totalBudget - secInfo.totalActual;
                  const defPct = Math.max(0, 100 - pctValue);
                  subtextLabel = `${currencyService.format(diff)} to target (${defPct.toFixed(1)}% pending)`;
                  subtextColor = '#EF4444';
                } else {
                  const ahead = secInfo.totalActual - secInfo.totalBudget;
                  const aheadPct = pctValue - 100;
                  subtextLabel = `+${currencyService.format(ahead)} ahead (+${aheadPct.toFixed(1)}% surplus)`;
                  subtextColor = '#10B981';
                }
              }
            } else {
              // pctBasis === 'income': compare Actual against Income
              const baseIncome = metrics.actualIncome;
              if (sec === 'income') {
                pctValue = 100;
                pctLabel = '100% (Income Base)';
                if (secInfo.totalActual < secInfo.totalBudget) {
                  const diff = secInfo.totalBudget - secInfo.totalActual;
                  const remPct = metrics.estimateIncome > 0 ? (diff / metrics.estimateIncome) * 100 : 0;
                  subtextLabel = `${currencyService.format(diff)} pending (${remPct.toFixed(1)}% remaining)`;
                  subtextColor = '#F59E0B';
                } else {
                  const extra = secInfo.totalActual - secInfo.totalBudget;
                  subtextLabel = `+${currencyService.format(extra)} surplus received`;
                  subtextColor = '#10B981';
                }
              } else if (sec === 'expense') {
                pctValue = baseIncome > 0 ? (secInfo.totalActual / baseIncome) * 100 : 0;
                const formattedPct = pctValue.toFixed(1);
                pctLabel = `${formattedPct}% of income`;
                const diff = baseIncome - secInfo.totalActual;
                if (diff >= 0) {
                  const remPct = Math.max(0, 100 - pctValue);
                  subtextLabel = `+${currencyService.format(diff)} remaining after expense (${remPct.toFixed(1)}% left)`;
                  subtextColor = '#10B981';
                } else {
                  const overPct = pctValue - 100;
                  subtextLabel = `-${currencyService.format(Math.abs(diff))} over income (${overPct.toFixed(1)}% excess)`;
                  subtextColor = '#EF4444';
                }
              } else {
                // savings
                pctValue = baseIncome > 0 ? (secInfo.totalActual / baseIncome) * 100 : 0;
                const formattedPct = pctValue.toFixed(1);
                pctLabel = `${formattedPct}% of income`;
                const net = baseIncome - (sectionData.expense.totalActual + secInfo.totalActual);
                const netPct = baseIncome > 0 ? (net / baseIncome) * 100 : 0;
                if (net >= 0) {
                  subtextLabel = `+${currencyService.format(net)} net cash remaining (${netPct.toFixed(1)}% surplus)`;
                  subtextColor = '#10B981';
                } else {
                  subtextLabel = `-${currencyService.format(Math.abs(net))} net cash deficit (${Math.abs(netPct).toFixed(1)}% deficit)`;
                  subtextColor = '#EF4444';
                }
              }
            }
          } else if (dashboardMode === 'estimate') {
            const baseIncome = metrics.estimateIncome;
            if (sec === 'income') {
              pctValue = 100;
              pctLabel = '100% (Income Base)';
              subtextLabel = `Planned base: ${currencyService.format(metrics.estimateIncome)}`;
              subtextColor = 'var(--text-muted)';
            } else if (sec === 'expense') {
              pctValue = baseIncome > 0 ? (secInfo.totalBudget / baseIncome) * 100 : 0;
              const formattedPct = pctValue.toFixed(1);
              pctLabel = `${formattedPct}% of income`;
              const rem = baseIncome - secInfo.totalBudget;
              const remPct = baseIncome > 0 ? (rem / baseIncome) * 100 : 0;
              if (rem >= 0) {
                subtextLabel = `+${currencyService.format(rem)} remaining after expense (${remPct.toFixed(1)}% left)`;
                subtextColor = '#10B981';
              } else {
                subtextLabel = `-${currencyService.format(Math.abs(rem))} over planned income (${Math.abs(remPct).toFixed(1)}% excess)`;
                subtextColor = '#EF4444';
              }
            } else {
              pctValue = baseIncome > 0 ? (secInfo.totalBudget / baseIncome) * 100 : 0;
              const formattedPct = pctValue.toFixed(1);
              pctLabel = `${formattedPct}% of income`;
              const net = baseIncome - (sectionData.expense.totalBudget + secInfo.totalBudget);
              const netPct = baseIncome > 0 ? (net / baseIncome) * 100 : 0;
              if (net >= 0) {
                subtextLabel = `+${currencyService.format(net)} unallocated surplus (${netPct.toFixed(1)}% remaining)`;
                subtextColor = '#10B981';
              } else {
                subtextLabel = `-${currencyService.format(Math.abs(net))} over-allocated deficit (${Math.abs(netPct).toFixed(1)}% deficit)`;
                subtextColor = '#EF4444';
              }
            }
          } else {
            // actual mode: branches based on pctBasis ('estimate' vs 'income')
            if (pctBasis === 'estimate') {
              pctValue = secInfo.totalBudget > 0
                ? (secInfo.totalActual / secInfo.totalBudget) * 100
                : (secInfo.totalActual > 0 ? 100 : 0);
              const formattedPct = pctValue.toFixed(1);

              if (sec === 'income') {
                pctLabel = `${formattedPct}% received`;
                if (secInfo.totalActual < secInfo.totalBudget) {
                  const diff = secInfo.totalBudget - secInfo.totalActual;
                  const remPct = Math.max(0, 100 - pctValue);
                  subtextLabel = `${currencyService.format(diff)} pending (${remPct.toFixed(1)}% remaining)`;
                  subtextColor = '#F59E0B';
                } else if (secInfo.totalActual === secInfo.totalBudget) {
                  subtextLabel = `${currencyService.format(0)} pending (100% completed)`;
                  subtextColor = '#10B981';
                } else {
                  const extra = secInfo.totalActual - secInfo.totalBudget;
                  const extraPct = pctValue - 100;
                  subtextLabel = `+${currencyService.format(extra)} surplus (+${extraPct.toFixed(1)}% extra)`;
                  subtextColor = '#10B981';
                }
              } else if (sec === 'expense') {
                pctLabel = `${formattedPct}% used`;
                if (secInfo.totalActual <= secInfo.totalBudget) {
                  const diff = secInfo.totalBudget - secInfo.totalActual;
                  const leftPct = Math.max(0, 100 - pctValue);
                  subtextLabel = `+${currencyService.format(diff)} budget left (${leftPct.toFixed(1)}% remaining)`;
                  subtextColor = '#10B981';
                } else {
                  const over = secInfo.totalActual - secInfo.totalBudget;
                  const overPct = pctValue - 100;
                  subtextLabel = `-${currencyService.format(over)} over budget (${overPct.toFixed(1)}% excess)`;
                  subtextColor = '#EF4444';
                }
              } else {
                // savings
                pctLabel = `${formattedPct}% saved`;
                if (secInfo.totalActual < secInfo.totalBudget) {
                  const diff = secInfo.totalBudget - secInfo.totalActual;
                  const defPct = Math.max(0, 100 - pctValue);
                  subtextLabel = `${currencyService.format(diff)} to target (${defPct.toFixed(1)}% pending)`;
                  subtextColor = '#EF4444';
                } else {
                  const ahead = secInfo.totalActual - secInfo.totalBudget;
                  const aheadPct = pctValue - 100;
                  subtextLabel = `+${currencyService.format(ahead)} ahead (+${aheadPct.toFixed(1)}% surplus)`;
                  subtextColor = '#10B981';
                }
              }
            } else {
              // pctBasis === 'income'
              const baseIncome = metrics.actualIncome;
              if (sec === 'income') {
                pctValue = 100;
                pctLabel = '100% (Income Base)';
                subtextLabel = `Total received: ${currencyService.format(metrics.actualIncome)}`;
                subtextColor = 'var(--text-muted)';
              } else if (sec === 'expense') {
                pctValue = baseIncome > 0 ? (secInfo.totalActual / baseIncome) * 100 : 0;
                const formattedPct = pctValue.toFixed(1);
                pctLabel = `${formattedPct}% of income spent`;
                const rem = baseIncome - secInfo.totalActual;
                const remPct = baseIncome > 0 ? (rem / baseIncome) * 100 : 0;
                if (rem >= 0) {
                  subtextLabel = `+${currencyService.format(rem)} cash left after expense (${remPct.toFixed(1)}% unspent)`;
                  subtextColor = '#10B981';
                } else {
                  subtextLabel = `-${currencyService.format(Math.abs(rem))} cash deficit (${Math.abs(remPct).toFixed(1)}% excess)`;
                  subtextColor = '#EF4444';
                }
              } else {
                pctValue = baseIncome > 0 ? (secInfo.totalActual / baseIncome) * 100 : 0;
                const formattedPct = pctValue.toFixed(1);
                pctLabel = `${formattedPct}% of income saved`;
                const net = baseIncome - (sectionData.expense.totalActual + secInfo.totalActual);
                const netPct = baseIncome > 0 ? (net / baseIncome) * 100 : 0;
                if (net >= 0) {
                  subtextLabel = `+${currencyService.format(net)} net unspent cash (${netPct.toFixed(1)}% cash left)`;
                  subtextColor = '#10B981';
                } else {
                  subtextLabel = `-${currencyService.format(Math.abs(net))} net cash deficit (${Math.abs(netPct).toFixed(1)}% deficit)`;
                  subtextColor = '#EF4444';
                }
              }
            }
          }

          const badgeColor = getPercentageColor(pctValue, sec === 'expense');

          return (
            <div
              key={sec}
              className="summary-card"
              style={{
                borderRadius: 16,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.25s ease, border-color 0.25s ease'
              }}
            >
              {/* Accordion Card Header - Natural compact height so categories align perfectly! (Point 3) */}
              <div
                onClick={() => toggleSection(sec)}
                style={{
                  padding: '18px 20px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                  borderTop: `4px solid ${accentColor}`,
                  borderRadius: '16px 16px 0 0',
                  transition: 'background 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header Top: Icon + Title + Category Count, and Rotating Chevron */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `${accentColor}18`,
                        color: accentColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <SecIcon size={19} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                        {title}
                      </h3>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {secInfo.rows.length} {secInfo.rows.length === 1 ? 'category' : 'categories'}
                      </span>
                    </div>
                  </div>

                  {/* Rotating Chevron for smooth interactive feel */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    <ChevronDown size={16} />
                  </div>
                </div>

                {/* Header Metrics Block */}
                <div
                  style={{
                    background: 'var(--bg-primary)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    border: '1px solid var(--border-color)',
                    marginBottom: 12
                  }}
                >
                  {dashboardMode === 'combined' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                          Estimate Budget
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {currencyService.format(secInfo.totalBudget)}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                          Actual
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: accentColor }}>
                          {currencyService.format(secInfo.totalActual)}
                        </span>
                      </div>
                    </div>
                  )}

                  {dashboardMode === 'estimate' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                          Estimate Plan
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {currencyService.format(secInfo.totalBudget)}
                        </span>
                      </div>
                    </div>
                  )}

                  {dashboardMode === 'actual' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                          Actual Amount
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: accentColor }}>
                          {currencyService.format(secInfo.totalActual)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress Bar + % Badge with 4-stage color */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 6, width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, pctValue))}%`,
                          height: '100%',
                          background: badgeColor,
                          borderRadius: 4,
                          transition: 'width 0.35s ease'
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: `${badgeColor}22`,
                      color: badgeColor,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {pctLabel}
                  </span>
                </div>

                {/* Uniform Subtext Row on ALL 3 cards with fixed 18px height */}
                <div
                  style={{
                    fontSize: 11,
                    color: subtextColor,
                    marginTop: 6,
                    height: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {subtextLabel}
                </div>

                {/* Subtle Click affordance indicator */}
                <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', opacity: 0.75 }}>
                  {isExpanded ? '▲ Click to collapse' : '▼ Click to expand breakdown'}
                </div>
              </div>

              {/* Smooth Expandable Body using CSS Grid-Template-Rows transition */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: isExpanded ? '1fr' : '0fr',
                  transition: 'grid-template-rows 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderTop: isExpanded ? '1px solid var(--border-color)' : '1px solid transparent',
                  transitionProperty: 'grid-template-rows, border-top-color'
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '16px 18px 20px',
                      opacity: isExpanded ? 1 : 0,
                      transform: isExpanded ? 'translateY(0)' : 'translateY(-6px)',
                      transition: 'opacity 0.28s ease, transform 0.28s ease'
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <th style={{ padding: '8px 4px', fontWeight: 600 }}>Category</th>
                          {dashboardMode !== 'actual' && (
                            <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Estimate</th>
                          )}
                          {dashboardMode !== 'estimate' && (
                            <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Actual</th>
                          )}
                          <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {secInfo.rows.map(row => {
                          let rowPct = 0;
                          if (dashboardMode === 'combined' || dashboardMode === 'actual') {
                            if (pctBasis === 'income') {
                              rowPct = metrics.actualIncome > 0 ? Math.round((row.actual / metrics.actualIncome) * 100) : 0;
                            } else {
                              rowPct = row.pctUsed;
                            }
                          } else {
                            // estimate mode
                            rowPct = metrics.estimateIncome > 0 ? Math.round((row.budget / metrics.estimateIncome) * 100) : 0;
                          }

                          const rowColor = getPercentageColor(rowPct, sec === 'expense');

                          return (
                            <tr
                              key={row.name}
                              style={{
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                transition: 'background 0.15s'
                              }}
                            >
                              <td style={{ padding: '9px 4px' }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                                  {row.name}
                                </div>
                                <div style={{ marginTop: 4, height: 4, width: '100%', maxWidth: 100, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${Math.min(100, Math.max(0, rowPct))}%`,
                                      height: '100%',
                                      background: rowColor,
                                      borderRadius: 2
                                    }}
                                  />
                                </div>
                              </td>

                              {dashboardMode !== 'actual' && (
                                <td style={{ padding: '9px 4px', textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                  {row.budget > 0 ? currencyService.format(row.budget) : '—'}
                                </td>
                              )}

                              {dashboardMode !== 'estimate' && (
                                <td style={{ padding: '9px 4px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                  {row.actual > 0 ? currencyService.format(row.actual) : '—'}
                                </td>
                              )}

                              <td style={{ padding: '9px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: `${rowColor}22`,
                                    color: rowColor
                                  }}
                                >
                                  {rowPct}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. CREDIT CARD OVERVIEW PANEL (Point 3 - Matching User Image 2 Mockup!) */}
      <div
        className="credit-card-overview-panel"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 14,
          padding: '18px 22px',
          marginBottom: 28,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={18} color="var(--accent-indigo)" />
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Credit Card Overview
            </h3>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Total: <strong style={{ color: 'var(--text-primary)' }}>{currencyService.format(totalCreditSpent)}</strong>
          </div>
        </div>

        {/* Horizontal Card Grid matching Image 2 */}
        {creditCards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>No credit cards added yet</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Visit the Credit Cards tab to add your cards and track limits and expenditures.
            </p>
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {cardStats.map(card => {
            const accent = card.accent || '#3B82F6';
            return (
              <div
                key={card.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 24,
                        height: 16,
                        borderRadius: 3,
                        background: accent,
                        opacity: 0.9
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {card.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        •• {card.last4}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {currencyService.format(card.spent)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                    {card.usedPct}% used
                  </div>
                </div>

                {/* Card mini progress bar */}
                <div style={{ height: 4, width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, card.usedPct)}%`,
                      height: '100%',
                      background: accent,
                      borderRadius: 2
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* 7. Bottom Full-Width Growth Trend & Trade Performance Panel (Point 4) */}
      <div
        className="glass-card full-width-trend-panel"
        style={{
          background: isLight ? 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)' : 'linear-gradient(180deg, var(--bg-secondary) 0%, rgba(15, 23, 42, 0.75) 100%)',
          borderRadius: 16,
          border: '1px solid var(--border-color)',
          padding: '24px 28px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Panel Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: trendMetric === 'income'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : trendMetric === 'expense'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: trendMetric === 'income' ? '#10B981' : trendMetric === 'expense' ? '#EF4444' : '#3B82F6',
                border: `1px solid ${trendMetric === 'income' ? 'rgba(16, 185, 129, 0.3)' : trendMetric === 'expense' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
              }}
            >
              <TrendingUp size={22} />
            </div>
            <div>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', display: 'block', letterSpacing: '-0.01em' }}>
                Financial Growth & Trajectory Analytics
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Continuous 12-month cumulative progression trajectory across {selectedYear} • {dashboardMode.toUpperCase()} MODE
              </span>
            </div>
          </div>

          {/* Quick Metric Pills */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.25)',
              padding: '4px 6px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              backdropFilter: 'blur(8px)'
            }}
          >
            {[
              { id: 'savings', label: 'Savings', color: '#3B82F6' },
              { id: 'income', label: 'Income', color: '#10B981' },
              { id: 'expense', label: 'Expenses', color: '#EF4444' },
              { id: 'net', label: 'Net Surplus', color: '#8B5CF6' }
            ].map(tab => {
              const isActive = trendMetric === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTrendMetric(tab.id as any)}
                  style={{
                    background: isActive ? `${tab.color}25` : 'transparent',
                    border: isActive ? `1px solid ${tab.color}60` : '1px solid transparent',
                    color: isActive ? tab.color : 'var(--text-secondary)',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 12,
                    padding: '6px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isActive ? `0 2px 10px ${tab.color}30` : 'none'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* High-Level Stat Summary Chips */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 22
          }}
        >
          <div
            style={{
              background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 3
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Cumulative Annual {trendMetric === 'savings' ? 'Savings' : trendMetric === 'income' ? 'Income' : trendMetric === 'expense' ? 'Expenses' : 'Surplus'}
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
              {currencyService.format(trendStats.total)}
            </span>
          </div>

          <div
            style={{
              background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 3
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Monthly Average
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-indigo)' }}>
              {currencyService.format(trendStats.avg)} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>/ mo</span>
            </span>
          </div>

          <div
            style={{
              background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 3
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Peak Performance Month
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#10B981' }}>
              {trendStats.peakMonth} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>({currencyService.format(trendStats.peakVal)})</span>
            </span>
          </div>

          <div
            style={{
              background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 3
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Overall Trajectory
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: trendStats.total >= 0 ? '#10B981' : '#EF4444',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>{trendStats.total >= 0 ? '▲ Upward Growth' : '▼ Downward Deficit'}</span>
            </span>
          </div>
        </div>

        {/* Full-width Smooth Bezier Chart Canvas */}
        <div style={{ height: 350, width: '100%', position: 'relative' }}>
          <Line data={smoothTrendChartData} options={smoothChartOptions} />
        </div>
      </div>
    </main>
  );
};
