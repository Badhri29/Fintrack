// Demo Budget & Sample Data Initializer for 5 Years (2022 - 2026)
import { getUserStorageKey } from './storageHelper';

export const seedDemoBudgetData = (force: boolean = false) => {
  if (typeof window === 'undefined') return;

  const DEMO_EMAIL = 'demo@fintrack.io';
  const SEED_VERSION = 'v7';
  const alreadySeeded = localStorage.getItem('fintrack_demo_budget_seed_version') === SEED_VERSION;

  if (alreadySeeded && !force) return;

  // Purge any legacy global un-scoped demo keys so new accounts stay 100% empty
  localStorage.removeItem('fintrack_credit_cards');
  localStorage.removeItem('fintrack_loans_list');
  [2022, 2023, 2024, 2025, 2026].forEach(y => {
    localStorage.removeItem(`fintrack-budget-${y}`);
    localStorage.removeItem(`fintrack-budget-transactions-${y}`);
  });

  const years = [2022, 2023, 2024, 2025, 2026];

  // 1. Pre-populate Realistic Credit Cards
  const DEMO_CARDS = [
    {
      id: 'card-1',
      name: 'HDFC Regalia Gold',
      bank: 'HDFC Bank',
      network: 'Visa',
      last4: '4281',
      limit: 400000,
      billingDay: 15,
      dueDay: 5,
      gradient: 'linear-gradient(135deg, #1E293B 0%, #0F172A 60%, #334155 100%)',
      accent: '#F59E0B'
    },
    {
      id: 'card-2',
      name: 'ICICI Amazon Pay',
      bank: 'ICICI Bank',
      network: 'Visa',
      last4: '8819',
      limit: 250000,
      billingDay: 12,
      dueDay: 2,
      gradient: 'linear-gradient(135deg, #0369A1 0%, #075985 60%, #0C4A6E 100%)',
      accent: '#38BDF8'
    },
    {
      id: 'card-3',
      name: 'SBI Cashback',
      bank: 'SBI Card',
      network: 'Mastercard',
      last4: '3014',
      limit: 150000,
      billingDay: 20,
      dueDay: 10,
      gradient: 'linear-gradient(135deg, #047857 0%, #065F46 60%, #064E3B 100%)',
      accent: '#34D399'
    },
    {
      id: 'card-4',
      name: 'Axis Bank Magnus',
      bank: 'Axis Bank',
      network: 'Visa',
      last4: '7192',
      limit: 500000,
      billingDay: 25,
      dueDay: 15,
      gradient: 'linear-gradient(135deg, #831843 0%, #4C0519 60%, #1E1B4B 100%)',
      accent: '#F43F5E'
    }
  ];
  localStorage.setItem(getUserStorageKey('fintrack_credit_cards', DEMO_EMAIL), JSON.stringify(DEMO_CARDS));

  // 2. Pre-populate Realistic Loans & EMIs
  const DEMO_LOANS = [
    {
      id: 'loan-1',
      name: 'HDFC Home Loan',
      lender: 'HDFC Bank',
      type: 'Home Loan',
      principal: 3500000,
      interestRate: 8.5,
      tenureMonths: 240,
      paidMonths: 58,
      startDate: '2021-08-01',
      dueDay: 5
    },
    {
      id: 'loan-2',
      name: 'SBI Car Loan',
      lender: 'State Bank of India',
      type: 'Auto Loan',
      principal: 800000,
      interestRate: 8.9,
      tenureMonths: 60,
      paidMonths: 32,
      startDate: '2023-11-01',
      dueDay: 10
    },
    {
      id: 'loan-3',
      name: 'Apple iPhone 16 Pro EMI',
      lender: 'HDFC SmartEMI',
      type: 'Consumer Durable',
      principal: 119900,
      interestRate: 0,
      tenureMonths: 6,
      paidMonths: 4,
      startDate: '2024-06-15',
      dueDay: 15
    },
    {
      id: 'loan-4',
      name: 'ICICI Personal Loan',
      lender: 'ICICI Bank',
      type: 'Personal Loan',
      principal: 500000,
      interestRate: 10.5,
      tenureMonths: 36,
      paidMonths: 18,
      startDate: '2023-04-01',
      dueDay: 20
    }
  ];
  localStorage.setItem(getUserStorageKey('fintrack_loans_list', DEMO_EMAIL), JSON.stringify(DEMO_LOANS));

  // 3. Populate 5 Full Years (2022 - 2026) of Budget Values and Budget Planner Transactions
  years.forEach(year => {
    const salaryBudget = 95000 + (year - 2022) * 10000;
    const rentBudget = 23000 + (year - 2022) * 1500;
    const foodBudget = 14000 + (year - 2022) * 1000;
    const utilBudget = 5000 + (year - 2022) * 300;
    const diningBudget = 7500 + (year - 2022) * 500;
    const shoppingBudget = 10000 + (year - 2022) * 1000;
    const transportBudget = 6000 + (year - 2022) * 400;
    const healthBudget = 3000 + (year - 2022) * 200;
    const emiBudget = year >= 2024 ? (16564 + 19983) : 16564;
    const investBudget = 22000 + (year - 2022) * 2000;
    const emergencyBudget = 6000;

    const repeat12 = (val: number) => new Array(12).fill(val);
    const bonusArr = [0, 0, 40000, 0, 0, 0, 0, 0, 0, 0, 0, 40000];
    const otherIncomeArr = [15000, 0, 15000, 0, 20000, 0, 15000, 0, 15000, 0, 20000, 15000];

    // Master budget map with every ID, category name, and subcategory variant
    const budgetMap: Record<string, number[]> = {
      // Income Categories & Subcategories
      'income:Salary': repeat12(salaryBudget),
      'Salary': repeat12(salaryBudget),
      'income:Base Salary': repeat12(salaryBudget),
      'Base Salary': repeat12(salaryBudget),
      'Monthly Salary': repeat12(salaryBudget),
      'sub:1': repeat12(salaryBudget),

      'income:Bonus & Incentives': bonusArr,
      'Bonus & Incentives': bonusArr,
      'Bonus': bonusArr,
      'sub:2': bonusArr,

      'income:Other Income': otherIncomeArr,
      'Other Income': otherIncomeArr,
      'income:Dividends': [3000, 3000, 5000, 3000, 3000, 6000, 3000, 3000, 5000, 3000, 3000, 6000],
      'Dividends': [3000, 3000, 5000, 3000, 3000, 6000, 3000, 3000, 5000, 3000, 3000, 6000],
      'sub:3': [3000, 3000, 5000, 3000, 3000, 6000, 3000, 3000, 5000, 3000, 3000, 6000],
      'Capital Gains': [8000, 0, 10000, 0, 12000, 0, 8000, 0, 10000, 0, 12000, 10000],
      'sub:4': [8000, 0, 10000, 0, 12000, 0, 8000, 0, 10000, 0, 12000, 10000],

      'income:Government Subsidy': repeat12(0),
      'Government Subsidy': repeat12(0),
      'income:Rewards and Cashback': repeat12(1000),
      'Rewards and Cashback': repeat12(1000),
      'income:Borrow / Debt Collected': repeat12(0),
      'Borrow / Debt Collected': repeat12(0),

      // Expense Categories & Subcategories
      'expense:Housing & Rent': repeat12(rentBudget),
      'Housing & Rent': repeat12(rentBudget),
      'expense:Housing': repeat12(rentBudget),
      'Housing': repeat12(rentBudget),
      'expense:Apartment Rent': repeat12(rentBudget),
      'Apartment Rent': repeat12(rentBudget),
      'Rent/Mortgage': repeat12(rentBudget),
      'sub:5': repeat12(rentBudget),

      'expense:Food & Groceries': repeat12(foodBudget),
      'Food & Groceries': repeat12(foodBudget),
      'expense:Food & Dining': repeat12(foodBudget),
      'Food & Dining': repeat12(foodBudget),
      'expense:Supermarket & Staples': repeat12(foodBudget),
      'Supermarket & Staples': repeat12(foodBudget),
      'Groceries': repeat12(foodBudget),
      'sub:7': repeat12(foodBudget),

      'expense:Utilities & Internet': repeat12(utilBudget),
      'Utilities & Internet': repeat12(utilBudget),
      'expense:Electricity & Wifi': repeat12(utilBudget),
      'Electricity & Wifi': repeat12(utilBudget),
      'Utilities': repeat12(utilBudget),
      'sub:6': repeat12(utilBudget),

      'expense:Dining & Entertainment': repeat12(diningBudget),
      'Dining & Entertainment': repeat12(diningBudget),
      'expense:Restaurants & Dining Out': repeat12(diningBudget),
      'Restaurants & Dining Out': repeat12(diningBudget),
      'Restaurants': repeat12(diningBudget),
      'sub:8': repeat12(diningBudget),

      'expense:Shopping & Travel': repeat12(shoppingBudget),
      'Shopping & Travel': repeat12(shoppingBudget),
      'expense:Electronics & Online Shopping': repeat12(shoppingBudget),
      'Electronics & Online Shopping': repeat12(shoppingBudget),
      'Quick Commerce & Blinkit': repeat12(3500),
      'Flight & Hotel Booking': repeat12(15000),

      'expense:Transportation & Auto': repeat12(transportBudget),
      'Transportation & Auto': repeat12(transportBudget),
      'expense:Fuel & Cab Rides': repeat12(transportBudget),
      'Fuel & Cab Rides': repeat12(transportBudget),

      'expense:Healthcare & Medical': repeat12(healthBudget),
      'Healthcare & Medical': repeat12(healthBudget),
      'expense:Pharmacy & Health Checks': repeat12(healthBudget),
      'Pharmacy & Health Checks': repeat12(healthBudget),

      'expense:Debt Repayment': repeat12(emiBudget),
      'Debt Repayment': repeat12(emiBudget),
      'expense:Home Loan EMI': repeat12(30375),
      'Home Loan EMI': repeat12(30375),
      'SBI Car Loan EMI': repeat12(16564),
      'Consumer Durable EMI': repeat12(year >= 2024 ? 19983 : 0),

      // Savings Categories & Subcategories
      'savings:Investments': repeat12(investBudget),
      'Investments': repeat12(investBudget),
      'savings:Mutual Funds SIP': repeat12(investBudget),
      'Mutual Funds SIP': repeat12(investBudget),
      'Mutual Funds': repeat12(investBudget),
      'savings:Mutual Funds': repeat12(investBudget),

      'savings:Emergency Fund': repeat12(emergencyBudget),
      'Emergency Fund': repeat12(emergencyBudget),
      'savings:High Yield Savings Deposit': repeat12(emergencyBudget),
      'High Yield Savings Deposit': repeat12(emergencyBudget),
      'Fixed Deposits': repeat12(10000),
      'Retirement Savings': repeat12(15000)
    };

    // Planned Budget Transactions Structure for Budget Planner table
    const budgetTxMap: Record<string, any[]> = {};

    Object.keys(budgetMap).forEach(key => {
      const parts = key.split(':');
      const catName = parts[1] || key;
      const values = budgetMap[key];

      budgetTxMap[key] = [
        {
          id: `seed-${key}-${year}`,
          name: `Estimate Plan: ${catName}`,
          date: `${year}-01-01`,
          values
        }
      ];
    });

    localStorage.setItem(getUserStorageKey(`fintrack-budget-${year}`, DEMO_EMAIL), JSON.stringify(budgetMap));
    localStorage.setItem(getUserStorageKey(`fintrack-budget-transactions-${year}`, DEMO_EMAIL), JSON.stringify(budgetTxMap));
  });

  localStorage.setItem('fintrack_demo_budget_seed_version', SEED_VERSION);
  console.log('Sample budget, credit cards, and loans data seeded successfully for 2022-2026!');
};
