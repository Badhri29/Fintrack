import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, PiggyBank, TrendingDown, Plus } from 'lucide-react';
import api from '../services/api';

interface BudgetPlanningViewProps {
  onOpenNewTransaction: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface BudgetItem {
  id: string;
  name: string;
  values: number[];
}

export const BudgetPlanningView: React.FC<BudgetPlanningViewProps> = ({ onOpenNewTransaction }) => {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [incomeExpanded, setIncomeExpanded] = useState<boolean>(true);
  const [savingsExpanded, setSavingsExpanded] = useState<boolean>(true);
  const [expenseExpanded, setExpenseExpanded] = useState<boolean>(true);

  const [maxMonthIndex, setMaxMonthIndex] = useState<number>(0);
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);

  const [incomeItems, setIncomeItems] = useState<BudgetItem[]>([]);
  const [savingsItems, setSavingsItems] = useState<BudgetItem[]>([]);
  const [expenseItems, setExpenseItems] = useState<BudgetItem[]>([]);

  useEffect(() => {
    fetchBudgetTransactions();
  }, [selectedYear]);

  const fetchBudgetTransactions = async () => {
    try {
      const res = await api.get('/transactions');
      const allTransactions = res?.data?.success ? res.data.data : [];

      // Calculate unique available years from database transactions
      const uniqueYears: number[] = Array.from(
        new Set<number>(
          allTransactions
            .map((t: any) => (t.date ? parseInt(String(t.date).substring(0, 4), 10) : NaN))
            .filter((y: number) => !isNaN(y) && y > 1900 && y < 2100)
        )
      ).sort((a: number, b: number) => a - b);

      const yrs = uniqueYears.length > 0 ? uniqueYears : [new Date().getFullYear()];
      setAvailableYears(yrs);

      // Filter by selected year
      const yearStr = String(selectedYear);
      const filtered = allTransactions.filter((t: any) => t.date && String(t.date).startsWith(yearStr));

      // Build default categories with all 0s
      const incomeMap: { [name: string]: number[] } = {
        'Salary': new Array(12).fill(0),
        'Bonus & Incentives': new Array(12).fill(0),
        'Other Income': new Array(12).fill(0)
      };

      const savingsMap: { [name: string]: number[] } = {
        'Investments': new Array(12).fill(0),
        'Emergency Fund': new Array(12).fill(0),
        'Mutual Funds': new Array(12).fill(0)
      };

      const expenseMap: { [name: string]: number[] } = {
        'Housing & Rent': new Array(12).fill(0),
        'Food & Groceries': new Array(12).fill(0),
        'Utilities & Internet': new Array(12).fill(0),
        'Dining & Entertainment': new Array(12).fill(0),
        'Shopping & Travel': new Array(12).fill(0),
        'Health & Insurance': new Array(12).fill(0)
      };

      let maxIdx = 0;

      // Populate real transactions into corresponding category array
      filtered.forEach((t: any) => {
        const monthIndex = parseInt(String(t.date).substring(5, 7), 10) - 1;
        if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return;

        if (monthIndex > maxIdx) {
          maxIdx = monthIndex;
        }

        const catName = t.category || t.subcategory || 'Other';
        const amt = Number(t.amount) || 0;

        if (t.type === 'income') {
          if (!incomeMap[catName]) incomeMap[catName] = new Array(12).fill(0);
          incomeMap[catName][monthIndex] += amt;
        } else if (catName === 'Investments' || catName === 'Savings' || catName === 'Mutual Funds') {
          if (!savingsMap[catName]) savingsMap[catName] = new Array(12).fill(0);
          savingsMap[catName][monthIndex] += amt;
        } else {
          if (!expenseMap[catName]) expenseMap[catName] = new Array(12).fill(0);
          expenseMap[catName][monthIndex] += amt;
        }
      });

      setMaxMonthIndex(maxIdx);

      setIncomeItems(
        Object.entries(incomeMap).map(([name, values], idx) => ({
          id: `inc-${idx}`,
          name,
          values
        }))
      );

      setSavingsItems(
        Object.entries(savingsMap).map(([name, values], idx) => ({
          id: `sav-${idx}`,
          name,
          values
        }))
      );

      setExpenseItems(
        Object.entries(expenseMap).map(([name, values], idx) => ({
          id: `exp-${idx}`,
          name,
          values
        }))
      );
    } catch (err) {
      const zeros = () => new Array(12).fill(0);
      setMaxMonthIndex(0);
      setIncomeItems([
        { id: 'inc-0', name: 'Salary', values: zeros() },
        { id: 'inc-1', name: 'Bonus & Incentives', values: zeros() },
        { id: 'inc-2', name: 'Other Income', values: zeros() }
      ]);
      setSavingsItems([
        { id: 'sav-0', name: 'Investments', values: zeros() },
        { id: 'sav-1', name: 'Emergency Fund', values: zeros() },
        { id: 'sav-2', name: 'Mutual Funds', values: zeros() }
      ]);
      setExpenseItems([
        { id: 'exp-0', name: 'Housing & Rent', values: zeros() },
        { id: 'exp-1', name: 'Food & Groceries', values: zeros() },
        { id: 'exp-2', name: 'Utilities & Internet', values: zeros() },
        { id: 'exp-3', name: 'Dining & Entertainment', values: zeros() },
        { id: 'exp-4', name: 'Shopping & Travel', values: zeros() },
        { id: 'exp-5', name: 'Health & Insurance', values: zeros() }
      ]);
    }
  };

  const calculateRowTotal = (values: number[]) => values.reduce((a, b) => a + b, 0);

  const calculateSectionMonthlyTotals = (items: BudgetItem[]) => {
    const totals = new Array(12).fill(0);
    items.forEach(item => {
      item.values.forEach((v, idx) => {
        totals[idx] += v;
      });
    });
    return totals;
  };

  const incomeMonthlyTotals = calculateSectionMonthlyTotals(incomeItems);
  const savingsMonthlyTotals = calculateSectionMonthlyTotals(savingsItems);
  const expenseMonthlyTotals = calculateSectionMonthlyTotals(expenseItems);

  const netCashFlowMonthly = incomeMonthlyTotals.map((inc, i) => inc - expenseMonthlyTotals[i]);

  const formatCurr = (num: number) => '₹' + Math.round(num || 0).toLocaleString('en-IN');

  const visibleMonthsCount = Math.max(1, maxMonthIndex + 1);
  const visibleMonths = MONTHS.slice(0, visibleMonthsCount);

  return (
    <main>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Budget Planning (Spreadsheet)</h1>
          <p className="page-subtitle">Hierarchical financial planner displaying columns dynamically up to latest data availability</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="segmented-control">
            {availableYears.map(yr => (
              <button
                key={yr}
                className={`segmented-btn ${selectedYear === yr ? 'active' : ''}`}
                onClick={() => setSelectedYear(yr)}
              >
                {yr}
              </button>
            ))}
          </div>

          <button className="btn-primary" onClick={onOpenNewTransaction}>
            <Plus size={16} />
            Add Entry
          </button>
        </div>
      </div>

      {/* Spreadsheet Table */}
      <div className="spreadsheet-container">
        <table className="spreadsheet-table">
          <thead>
            <tr>
              <th className="sticky-col" style={{ width: 240 }}>Category / Subcategory</th>
              {visibleMonths.map(m => (
                <th key={m}>{m} {selectedYear}</th>
              ))}
              <th className="col-year-total">Total {selectedYear}</th>
            </tr>
          </thead>
          <tbody>
            {/* 1. INCOME SECTION */}
            <tr
              style={{ background: 'rgba(16, 185, 129, 0.08)' }}
              onClick={() => setIncomeExpanded(!incomeExpanded)}
            >
              <td className="sticky-col spreadsheet-row-header section-income">
                {incomeExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <TrendingUp size={16} />
                <span>INCOME</span>
              </td>
              {visibleMonths.map((_, idx) => (
                <td key={idx} style={{ fontWeight: 700, color: '#10B981' }}>
                  {formatCurr(incomeMonthlyTotals[idx])}
                </td>
              ))}
              <td className="col-year-total" style={{ color: '#10B981' }}>
                {formatCurr(calculateRowTotal(incomeMonthlyTotals))}
              </td>
            </tr>
            {incomeExpanded &&
              incomeItems.map(item => (
                <tr key={item.id}>
                  <td className="sticky-col" style={{ paddingLeft: 36, color: 'var(--text-primary)' }}>
                    {item.name}
                  </td>
                  {item.values.slice(0, visibleMonthsCount).map((v, i) => (
                    <td key={i}>{formatCurr(v)}</td>
                  ))}
                  <td className="col-year-total">{formatCurr(calculateRowTotal(item.values))}</td>
                </tr>
              ))}

            {/* 2. SAVINGS & INVESTMENTS SECTION */}
            <tr
              style={{ background: 'rgba(59, 130, 246, 0.08)' }}
              onClick={() => setSavingsExpanded(!savingsExpanded)}
            >
              <td className="sticky-col spreadsheet-row-header section-savings">
                {savingsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <PiggyBank size={16} />
                <span>SAVINGS & INVESTMENTS</span>
              </td>
              {visibleMonths.map((_, idx) => (
                <td key={idx} style={{ fontWeight: 700, color: '#3B82F6' }}>
                  {formatCurr(savingsMonthlyTotals[idx])}
                </td>
              ))}
              <td className="col-year-total" style={{ color: '#60A5FA' }}>
                {formatCurr(calculateRowTotal(savingsMonthlyTotals))}
              </td>
            </tr>
            {savingsExpanded &&
              savingsItems.map(item => (
                <tr key={item.id}>
                  <td className="sticky-col" style={{ paddingLeft: 36, color: 'var(--text-primary)' }}>
                    {item.name}
                  </td>
                  {item.values.slice(0, visibleMonthsCount).map((v, i) => (
                    <td key={i}>{formatCurr(v)}</td>
                  ))}
                  <td className="col-year-total">{formatCurr(calculateRowTotal(item.values))}</td>
                </tr>
              ))}

            {/* 3. EXPENSES SECTION */}
            <tr
              style={{ background: 'rgba(239, 68, 68, 0.08)' }}
              onClick={() => setExpenseExpanded(!expenseExpanded)}
            >
              <td className="sticky-col spreadsheet-row-header section-expense">
                {expenseExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <TrendingDown size={16} />
                <span>EXPENSES</span>
              </td>
              {visibleMonths.map((_, idx) => (
                <td key={idx} style={{ fontWeight: 700, color: '#EF4444' }}>
                  {formatCurr(expenseMonthlyTotals[idx])}
                </td>
              ))}
              <td className="col-year-total" style={{ color: '#F87171' }}>
                {formatCurr(calculateRowTotal(expenseMonthlyTotals))}
              </td>
            </tr>
            {expenseExpanded &&
              expenseItems.map(item => (
                <tr key={item.id}>
                  <td className="sticky-col" style={{ paddingLeft: 36, color: 'var(--text-primary)' }}>
                    {item.name}
                  </td>
                  {item.values.slice(0, visibleMonthsCount).map((v, i) => (
                    <td key={i}>{formatCurr(v)}</td>
                  ))}
                  <td className="col-year-total">{formatCurr(calculateRowTotal(item.values))}</td>
                </tr>
              ))}

            {/* NET CASH FLOW ROW */}
            <tr style={{ background: 'rgba(99, 102, 241, 0.15)', fontWeight: 800 }}>
              <td className="sticky-col" style={{ color: 'var(--text-primary)', fontSize: 14 }}>
                NET CASH FLOW (INCOME - EXPENSE)
              </td>
              {visibleMonths.map((_, idx) => (
                <td key={idx} style={{ color: netCashFlowMonthly[idx] >= 0 ? '#10B981' : '#EF4444', fontSize: 14 }}>
                  {(netCashFlowMonthly[idx] >= 0 ? '+' : '') + formatCurr(netCashFlowMonthly[idx])}
                </td>
              ))}
              <td className="col-year-total" style={{ color: '#A78BFA', fontSize: 15 }}>
                {formatCurr(calculateRowTotal(netCashFlowMonthly))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
};
