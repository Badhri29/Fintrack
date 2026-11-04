import api from './api';
import { getUserStorageKey } from './storageHelper';
import { getActiveUserEmail } from './cardService';

export const budgetService = {
  getStorageKey(year: number, email?: string): string {
    const userEmail = getActiveUserEmail(email);
    return getUserStorageKey(`fintrack-budget-${year}`, userEmail);
  },

  getBudgetMap(year: number, email?: string): Record<string, any> {
    const userEmail = getActiveUserEmail(email);
    const primaryKey = this.getStorageKey(year, userEmail);
    try {
      const stored = localStorage.getItem(primaryKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Error reading budget from storage:', err);
    }

    // Only allow guest / demo users to search legacy fallback keys
    if (userEmail === 'anonymous' || userEmail === 'guest' || userEmail === 'demo@fintrack.io') {
      const candidateKeys = [
        `fintrack-budget-${year}`,
        `fintrack-budget-${year}_guest`,
        `fintrack-budget-${year}_${userEmail || ''}`
      ];
      for (const key of candidateKeys) {
        if (key === primaryKey) continue;
        try {
          const legacyStored = localStorage.getItem(key);
          if (legacyStored) {
            const parsed = JSON.parse(legacyStored);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
              return parsed;
            }
          }
        } catch {}
      }
    }

    return {};
  },

  saveBudgetMap(year: number, budgetMap: Record<string, any>, email?: string): void {
    const userEmail = getActiveUserEmail(email);
    const primaryKey = this.getStorageKey(year, userEmail);
    try {
      localStorage.setItem(primaryKey, JSON.stringify(budgetMap));
      window.dispatchEvent(new CustomEvent('fintrack-budget-changed', { detail: { year, budgetMap } }));
    } catch (err) {
      console.error('Error saving budget to storage:', err);
    }

    // Persist to backend API asynchronously (Database is Source of Truth)
    api.post('/budgets/sync', { year, budgets: budgetMap }).catch((err) => {
      console.debug('Async budget sync to backend notice:', err?.message);
    });
  },

  saveCategoryBudget(year: number, categoryKey: string, monthlyAmounts: any, email?: string): void {
    const userEmail = getActiveUserEmail(email);
    const current = this.getBudgetMap(year, userEmail);
    current[categoryKey] = monthlyAmounts;
    this.saveBudgetMap(year, current, userEmail);

    api.post('/budgets', { year, categoryKey, monthlyAmounts }).catch((err) => {
      console.debug('Async budget category save notice:', err?.message);
    });
  },

  async deleteBudgetCategory(year: number, categoryKey: string, email?: string): Promise<void> {
    const userEmail = getActiveUserEmail(email);
    const current = this.getBudgetMap(year, userEmail);
    delete current[categoryKey];
    delete current[`sub:${categoryKey}`];
    if (categoryKey.startsWith('sub:')) {
      delete current[categoryKey.replace('sub:', '')];
    }
    const primaryKey = this.getStorageKey(year, userEmail);
    try {
      localStorage.setItem(primaryKey, JSON.stringify(current));
      window.dispatchEvent(new CustomEvent('fintrack-budget-changed', { detail: { year, budgetMap: current } }));
    } catch {}

    try {
      await api.delete('/budgets/category', { params: { year, categoryKey } });
    } catch (err: any) {
      // Fallback: post empty array if delete endpoint unavailable
      api.post('/budgets', { year, categoryKey, monthlyAmounts: [] }).catch(() => {});
    }
  },

  async fetchBudgetFromServer(year: number, email?: string): Promise<Record<string, any>> {
    const userEmail = getActiveUserEmail(email);
    const primaryKey = this.getStorageKey(year, userEmail);
    try {
      const res = await api.get('/budgets', { params: { year } });
      if (res.data?.success && res.data.data !== undefined) {
        const serverBudgets = res.data.data || {};
        const oldStr = localStorage.getItem(primaryKey);
        const newStr = JSON.stringify(serverBudgets);
        // Only overwrite and dispatch event if server data is actually different from current cache
        if (oldStr !== newStr) {
          localStorage.setItem(primaryKey, newStr);
          window.dispatchEvent(new CustomEvent('fintrack-budget-changed', { detail: { year, budgetMap: serverBudgets, source: 'server' } }));
        }
        return serverBudgets;
      }
    } catch (err) {
      console.debug('Could not fetch budgets from server:', err);
    }
    return this.getBudgetMap(year, userEmail);
  }
};
