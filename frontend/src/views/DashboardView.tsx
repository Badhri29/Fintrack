import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Award,
  Wallet,
  Activity,
  Percent,
  ShieldCheck,
  Plus
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';
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
  ArcElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import api from '../services/api';
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
  ArcElement
);

interface DashboardViewProps {
  onOpenNewTransaction: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenNewTransaction }) => {
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === 'light';
  const [, setCurrencyTick] = useState<number>(0);

  useEffect(() => {
    const onCurChange = () => setCurrencyTick(t => t + 1);
    window.addEventListener('fintrack-currency-change', onCurChange);
    window.addEventListener('fintrack-currency-rates-updated', onCurChange);
    return () => {
      window.removeEventListener('fintrack-currency-change', onCurChange);
      window.removeEventListener('fintrack-currency-rates-updated', onCurChange);
    };
  }, []);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<any>({
    totalIncome: 0,
    totalExpenses: 0,
    totalSavings: 0,
    netWorth: 0,
    cashFlow: 0,
    budgetRemaining: 0,
    savingsRate: 0,
    healthScore: 0
  });

  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [topCategories, setTopCategories] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedYear]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [sumRes, monthRes, catRes, txRes] = await Promise.all([
        api.get('/dashboard/summary').catch(() => null),
        api.get(`/dashboard/monthly?year=${selectedYear}`).catch(() => null),
        api.get('/dashboard/top-categories?limit=5').catch(() => null),
        api.get('/transactions').catch(() => null)
      ]);

      if (txRes?.data?.success && Array.isArray(txRes.data.data)) {
        const uniqueYears: number[] = Array.from(
          new Set<number>(
            txRes.data.data
              .map((t: any) => (t.date ? parseInt(String(t.date).substring(0, 4), 10) : NaN))
              .filter((y: number) => !isNaN(y) && y > 1900 && y < 2100)
          )
        ).sort((a: number, b: number) => a - b);

        const yrs = uniqueYears.length > 0 ? uniqueYears : [new Date().getFullYear()];
        setAvailableYears(yrs);
      }

      if (sumRes?.data?.success && sumRes.data.data) {
        setSummary(sumRes.data.data);
      } else {
        setSummary({
          totalIncome: 0,
          totalExpenses: 0,
          totalSavings: 0,
          netWorth: 0,
          cashFlow: 0,
          budgetRemaining: 0,
          savingsRate: 0,
          healthScore: 0
        });
      }

      const emptyMonths = [
        { month: 'Jan', income: 0, expense: 0, savings: 0 },
        { month: 'Feb', income: 0, expense: 0, savings: 0 },
        { month: 'Mar', income: 0, expense: 0, savings: 0 },
        { month: 'Apr', income: 0, expense: 0, savings: 0 },
        { month: 'May', income: 0, expense: 0, savings: 0 },
        { month: 'Jun', income: 0, expense: 0, savings: 0 },
        { month: 'Jul', income: 0, expense: 0, savings: 0 },
        { month: 'Aug', income: 0, expense: 0, savings: 0 },
        { month: 'Sep', income: 0, expense: 0, savings: 0 },
        { month: 'Oct', income: 0, expense: 0, savings: 0 },
        { month: 'Nov', income: 0, expense: 0, savings: 0 },
        { month: 'Dec', income: 0, expense: 0, savings: 0 }
      ];

      if (monthRes?.data?.success && Array.isArray(monthRes.data.data)) {
        setMonthlyData(monthRes.data.data);
      } else {
        setMonthlyData(emptyMonths);
      }

      if (catRes?.data?.success && Array.isArray(catRes.data.data)) {
        setTopCategories(catRes.data.data);
      } else {
        setTopCategories([]);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return currencyService.format(val);
  };

  // Chart configurations
  const barChartData = {
    labels: monthlyData.map(d => d.month),
    datasets: [
      {
        label: 'Income',
        data: monthlyData.map(d => Math.round(currencyService.convertFromBase(d.income) * 100) / 100),
        backgroundColor: '#10B981',
        borderRadius: 6,
      },
      {
        label: 'Expenses',
        data: monthlyData.map(d => Math.round(currencyService.convertFromBase(d.expense) * 100) / 100),
        backgroundColor: '#EF4444',
        borderRadius: 6,
      },
      {
        label: 'Net Savings',
        data: monthlyData.map(d => Math.round(currencyService.convertFromBase(d.savings) * 100) / 100),
        backgroundColor: '#3B82F6',
        borderRadius: 6,
      }
    ]
  };

  const barChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#94A3B8',
          font: { family: 'Plus Jakarta Sans', weight: '600' }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(11, 14, 20, 0.9)',
        titleColor: '#F8FAFC',
        bodyColor: '#E2E8F0',
        borderColor: '#232D42',
        borderWidth: 1,
        padding: 12
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(35, 45, 66, 0.4)' },
        ticks: { color: '#94A3B8', font: { weight: '600' } }
      },
      y: {
        grid: { color: 'rgba(35, 45, 66, 0.4)' },
        ticks: { color: '#94A3B8', font: { weight: '600' } }
      }
    }
  };

  const doughnutData = {
    labels: topCategories.map(c => c.category),
    datasets: [
      {
        data: topCategories.map(c => Math.round(currencyService.convertFromBase(c.amount) * 100) / 100),
        backgroundColor: [
          '#6366F1',
          '#10B981',
          '#3B82F6',
          '#F59E0B',
          '#EC4899'
        ],
        borderColor: isLight ? '#FFFFFF' : '#151B28',
        borderWidth: 2
      }
    ]
  };

  const doughnutOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#94A3B8',
          font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
          padding: 16
        }
      }
    }
  };

  if (loading && !summary) {
    return (
      <main style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading dashboard metrics...
      </main>
    );
  }

  return (
    <main>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Dashboard</h1>
          <p className="page-subtitle">Real-time summary of your income, expenses, net worth & savings</p>
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
            Add Transaction
          </button>
        </div>
      </div>

      {/* KPI Cards Grid - 8 Cards matching Figma exactly */}
      <div className="kpi-grid">
        <KpiCard
          label="Total Income"
          value={formatCurrency(summary.totalIncome)}
          year={String(selectedYear)}
          icon={<TrendingUp size={22} />}
          iconColor="#10B981"
          iconBg="rgba(16, 185, 129, 0.15)"
        />

        <KpiCard
          label="Total Expenses"
          value={formatCurrency(summary.totalExpenses)}
          year={String(selectedYear)}
          icon={<TrendingDown size={22} />}
          iconColor="#EF4444"
          iconBg="rgba(239, 68, 68, 0.15)"
        />

        <KpiCard
          label="Total Savings"
          value={formatCurrency(summary.totalSavings)}
          year={String(selectedYear)}
          icon={<PiggyBank size={22} />}
          iconColor="#00C4FF"
          iconBg="rgba(0, 196, 255, 0.15)"
        />

        <KpiCard
          label="Net Worth"
          value={formatCurrency(summary.netWorth)}
          year={String(selectedYear)}
          icon={<Award size={22} />}
          iconColor="#8B5CF6"
          iconBg="rgba(139, 92, 246, 0.15)"
        />

        <KpiCard
          label="Cash Flow"
          value={(summary.cashFlow > 0 ? '+' : '') + formatCurrency(summary.cashFlow)}
          year={String(selectedYear)}
          icon={<Activity size={22} />}
          iconColor="#6366F1"
          iconBg="rgba(99, 102, 241, 0.15)"
        />

        <KpiCard
          label="Budget Remaining"
          value={formatCurrency(summary.budgetRemaining)}
          year={String(selectedYear)}
          icon={<Wallet size={22} />}
          iconColor="#F59E0B"
          iconBg="rgba(245, 158, 11, 0.15)"
        />

        <KpiCard
          label="Savings Rate"
          value={`${summary.savingsRate || 0}%`}
          year={String(selectedYear)}
          icon={<Percent size={22} />}
          iconColor="#EC4899"
          iconBg="rgba(236, 72, 153, 0.15)"
        />

        <KpiCard
          label="Financial Health Score"
          value={`${summary.healthScore || 78}/100`}
          year={String(selectedYear)}
          icon={<ShieldCheck size={22} />}
          iconColor="#10B981"
          iconBg="rgba(16, 185, 129, 0.15)"
        />
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Left Bar Chart */}
        <div className="glass-card chart-panel">
          <div className="chart-title">
            <span>12-Month Cash Flow & Savings Trend</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedYear}</span>
          </div>
          <div style={{ height: 320 }}>
            <Bar data={barChartData} options={barChartOptions} />
          </div>
        </div>

        {/* Right Doughnut Chart */}
        <div className="glass-card chart-panel">
          <div className="chart-title">
            <span>Top Spending Categories</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Expenses</span>
          </div>
          <div style={{ height: 320 }}>
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>
      </div>
    </main>
  );
};
