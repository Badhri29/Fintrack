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

  getTransactionsStorageKey(year: number, email?: string): string {
    return getUserStorageKey(`fintrack-budget-transactions-${year}`, getActiveUserEmail(email));
  },

  getBudgetTransactionsMap(year: number, email?: string): Record<string, any[]> {
    try {
      const txKey = this.getTransactionsStorageKey(year, email);
      const raw = localStorage.getItem(txKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  },

  splitServerBudgets(serverBudgets: Record<string, any>): {
    serverValues: Record<string, number[]>;
    serverTxs: Record<string, any[]>;
  } {
    const serverValues: Record<string, number[]> = {};
    const serverTxs: Record<string, any[]> = {};

    if (serverBudgets && typeof serverBudgets === 'object') {
      Object.entries(serverBudgets).forEach(([key, val]: [string, any]) => {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
          const cleanKey = key.startsWith('sub:') ? key.replace('sub:', '') : key;
          serverTxs[cleanKey] = val;
          serverTxs[key] = val;
        } else if (Array.isArray(val)) {
          serverValues[key] = val;
        }
      });
    }
    return { serverValues, serverTxs };
  },

  /**
   * Keeps the local `fintrack-budget-{year}` cache aligned when line items change locally
   * so Dashboard reads consistent estimates immediately without waiting for a server round-trip.
   */
  syncLocalBudgetEntry(year: number, primaryKeyName: string, aliasKeys: string[], value: any, email?: string): void {
    const userEmail = getActiveUserEmail(email);
    const primaryKey = this.getStorageKey(year, userEmail);
    try {
      const current = this.getBudgetMap(year, userEmail);
      const next: Record<string, any> = { ...current, [primaryKeyName]: value };
      for (const alias of aliasKeys) {
        if (alias && alias !== primaryKeyName && Object.prototype.hasOwnProperty.call(next, alias)) {
          next[alias] = value;
        }
      }
      localStorage.setItem(primaryKey, JSON.stringify(next));
    } catch (err) {
      console.debug('Could not sync local budget cache entry:', err);
    }
  },

  async fetchBudgetFromServer(year: number, email?: string): Promise<Record<string, any>> {
    const userEmail = getActiveUserEmail(email);
    const primaryKey = this.getStorageKey(year, userEmail);
    const txKey = this.getTransactionsStorageKey(year, userEmail);
    try {
      const res = await api.get('/budgets', { params: { year } });
      if (res.data?.success && res.data.data !== undefined) {
        const serverBudgets = res.data.data || {};
        const oldStr = localStorage.getItem(primaryKey);
        const newStr = JSON.stringify(serverBudgets);

        if (oldStr !== newStr) {
          localStorage.setItem(primaryKey, newStr);
          window.dispatchEvent(new CustomEvent('fintrack-budget-changed', { detail: { year, budgetMap: serverBudgets, source: 'server' } }));
        }

        const { serverTxs } = this.splitServerBudgets(serverBudgets);
        if (Object.keys(serverTxs).length > 0 || userEmail !== 'demo@fintrack.io') {
          const oldTxStr = localStorage.getItem(txKey);
          const newTxStr = JSON.stringify(serverTxs);
          if (oldTxStr !== newTxStr) {
            localStorage.setItem(txKey, newTxStr);
            window.dispatchEvent(new CustomEvent('fintrack-budget-transactions-changed', { detail: { year, source: 'server' } }));
          }
        }
        return serverBudgets;
      }
    } catch (err) {
      console.debug('Could not fetch budgets from server:', err);
    }
    return this.getBudgetMap(year, userEmail);
  }
};
