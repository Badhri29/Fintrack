import api from './api';
import { getUserStorageKey } from './storageHelper';
import { getActiveUserEmail } from './cardService';

export const budgetService = {
  getStorageKey(year: number, email?: string): string {
    const userEmail = getActiveUserEmail(email);
    return getUserStorageKey(`fintrack-budget-${year}`, userEmail);
  },

  getBudgetMap(year: number, email?: string): Record<string, number[]> {
    const primaryKey = this.getStorageKey(year, email);
    try {
      const stored = localStorage.getItem(primaryKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Error reading budget from storage:', err);
    }

    // Fallback & automatic migration from legacy keys
    const userEmail = getActiveUserEmail(email);
    const candidateKeys = [
      `fintrack-budget-${year}`,
      `fintrack-budget-${year}_guest`,
      `fintrack-budget-${year}_${userEmail || ''}`,
      `fintrack_budget_${year}`,
      `fintrack_budget_${year}_${userEmail || ''}`,
      `fintrack-budget-${year}_global`
    ];

    for (const key of candidateKeys) {
      if (key === primaryKey) continue;
      try {
        const legacyStored = localStorage.getItem(key);
        if (legacyStored) {
          const parsed = JSON.parse(legacyStored);
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            localStorage.setItem(primaryKey, JSON.stringify(parsed));
            // Sync legacy budget to server
            api.post('/budgets/sync', { year, budgets: parsed }).catch(() => {});
            return parsed;
          }
        }
      } catch {}
    }

    // Deep search in all localStorage keys for year match
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k !== primaryKey && k.includes(String(year)) && (k.startsWith('fintrack-budget') || k.startsWith('fintrack_budget'))) {
          const val = localStorage.getItem(k);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
              localStorage.setItem(primaryKey, JSON.stringify(parsed));
              api.post('/budgets/sync', { year, budgets: parsed }).catch(() => {});
              return parsed;
            }
          }
        }
      }
    } catch {}

    return {};
  },

  saveBudgetMap(year: number, budgetMap: Record<string, number[]>, email?: string): void {
    const primaryKey = this.getStorageKey(year, email);
    try {
      localStorage.setItem(primaryKey, JSON.stringify(budgetMap));
      window.dispatchEvent(new CustomEvent('fintrack-budget-changed', { detail: { year, budgetMap } }));
    } catch (err) {
      console.error('Error saving budget to storage:', err);
    }

    // Persist to backend API asynchronously
    api.post('/budgets/sync', { year, budgets: budgetMap }).catch((err) => {
      console.debug('Async budget sync to backend notice:', err?.message);
    });
  },

  saveCategoryBudget(year: number, categoryKey: string, monthlyAmounts: number[], email?: string): void {
    const current = this.getBudgetMap(year, email);
    current[categoryKey] = monthlyAmounts;
    this.saveBudgetMap(year, current, email);

    api.post('/budgets', { year, categoryKey, monthlyAmounts }).catch((err) => {
      console.debug('Async budget category save notice:', err?.message);
    });
  },

  async fetchBudgetFromServer(year: number, email?: string): Promise<Record<string, number[]>> {
    try {
      const res = await api.get('/budgets', { params: { year } });
      if (res.data?.success && res.data.data) {
        const serverBudgets = res.data.data;
        const localBudgets = this.getBudgetMap(year, email);

        if (Object.keys(serverBudgets).length > 0) {
          localStorage.setItem(this.getStorageKey(year, email), JSON.stringify(serverBudgets));
          window.dispatchEvent(new CustomEvent('fintrack-budget-changed', { detail: { year, budgetMap: serverBudgets } }));
          return serverBudgets;
        } else if (Object.keys(localBudgets).length > 0) {
          // Sync local budgets to server
          api.post('/budgets/sync', { year, budgets: localBudgets }).catch(() => {});
          return localBudgets;
        }
      }
    } catch (err) {
      console.debug('Could not fetch budgets from server:', err);
    }
    return this.getBudgetMap(year, email);
  }
};
