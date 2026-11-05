import api from './api';
import { getUserStorageKey } from './storageHelper';
import { getActiveUserEmail } from './cardService';

export type CategorySection = 'expense' | 'income' | 'savings';

export interface ApiCategory {
  id?: number;
  name: string;
  type: string;
  userId?: number;
}

export interface ApiSubcategory {
  id?: number;
  categoryId?: number;
  name: string;
  userId?: number;
}

export const DEFAULT_CATEGORIES: Record<CategorySection, string[]> = {
  income: ['Salary', 'Bonus & Incentives', 'Other Income', 'Investments'],
  savings: ['Investments', 'Emergency Fund', 'Mutual Funds', 'Savings'],
  expense: [
    'Food & Dining',
    'Housing',
    'Maintanance & Insurance',
    'Utilities & Internet',
    'Dining & Entertainment',
    'Shopping & Travel',
    'Health & Insurance',
    'Loans & EMI',
    'Repair & Maintenance',
  ],
};

export const DEFAULT_SUBCATEGORIES_BY_CATEGORY: Record<string, string[]> = {
  'Salary': ['Monthly Salary', 'Bonus & Incentives', 'Overtime'],
  'Bonus & Incentives': ['Performance Bonus', 'Festival Bonus', 'Incentives'],
  'Other Income': ['Cash in Hand', 'Freelance & Consulting', 'Rental Income', 'Dividends', 'Side Business'],
  'Investments': ['Mutual Funds', 'Stocks & Equity', 'Fixed Deposit', 'Dividends', 'Capital Gains', 'Gold'],
  'Emergency Fund': ['Savings Account', 'Liquid Funds', 'Emergency Reserve'],
  'Mutual Funds': ['SIP Investment', 'Index Funds', 'ELSS / Tax Saver'],
  'Savings': ['Emergency Fund', 'Recurring Deposit', 'High-Yield Savings'],
  'Food & Dining': ['Groceries', 'Restaurants', 'Food Delivery', 'Supermarket', 'Cafes & Snacks'],
  'Housing': ['Rent/Mortgage', 'Utilities', 'Rent', 'Gas', 'Electricity', 'Maintenance'],
  'Housing & Rent': ['Rent/Mortgage', 'Maintenance', 'Property Tax', 'Electricity', 'Water', 'Gas'],
  'Food & Groceries': ['Groceries', 'Supermarket', 'Vegetables & Fruits', 'Dairy & Milk'],
  'Maintanance & Insurance': ['Health Insurance', 'Life Insurance', 'Medicine', 'Vehicle Insurance', 'Home Maintenance'],
  'Utilities & Internet': ['Network & Internet', 'Electricity', 'Water Bill', 'Mobile Recharge', 'Gas'],
  'Dining & Entertainment': ['Restaurants', 'Food Delivery', 'Movies & OTT', 'Outing & Events'],
  'Shopping & Travel': ['Clothing', 'Electronics', 'Petrol & Fuel', 'Travel & Commute', 'Personal Care'],
  'Health & Insurance': ['Medicine', 'Doctor Consultation', 'Health Insurance', 'Life Insurance'],
  'Loans & EMI': ['ChitFund', 'Credit Card Bill', 'Personal Loan', 'Home Loan EMI', 'KreditBee'],
  'Repair & Maintance': ['Bike Maintenance', 'Car Service', 'Home Repair', 'Appliance Repair'],
  'Repair & Maintenance': ['Bike Maintenance', 'Car Service', 'Home Repair', 'Appliance Repair'],
};

// Deleted Category Blacklist Helpers
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

// Renamed Category & Subcategory Mapping Helpers
export const getRenamedCategoryMap = (email?: string): Record<string, string> => {
  try {
    const raw = localStorage.getItem(`fintrack_renamed_categories_${email || 'global'}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setRenamedCategoryMap = (email: string | undefined, map: Record<string, string>) => {
  try {
    localStorage.setItem(`fintrack_renamed_categories_${email || 'global'}`, JSON.stringify(map));
  } catch {}
};

export const getRenamedSubcategoryMap = (email?: string): Record<string, string> => {
  try {
    const raw = localStorage.getItem(`fintrack_renamed_subcategories_${email || 'global'}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setRenamedSubcategoryMap = (email: string | undefined, map: Record<string, string>) => {
  try {
    localStorage.setItem(`fintrack_renamed_subcategories_${email || 'global'}`, JSON.stringify(map));
  } catch {}
};

export const categoryService = {
  getStorageKey(email?: string): string {
    const userEmail = getActiveUserEmail(email);
    return getUserStorageKey('fintrack_categories_by_type', userEmail);
  },

  getCachedCategoriesByType(email?: string): Record<CategorySection, Record<string, string[]>> {
    const primaryKey = this.getStorageKey(email);
    const userEmail = getActiveUserEmail(email);
    const deletedSet = getDeletedCategorySet(userEmail);
    const renamedCatMap = getRenamedCategoryMap(userEmail);
    const renamedSubMap = getRenamedSubcategoryMap(userEmail);

    let cached: Record<CategorySection, Record<string, string[]>> | null = null;
    try {
      const stored = localStorage.getItem(primaryKey);
      if (stored) {
        cached = JSON.parse(stored);
      }
    } catch {}

    if (!cached || !cached.expense || Object.keys(cached.expense).length === 0) {
      // Build from defaults + renames
      const fallback: Record<CategorySection, Record<string, string[]>> = {
        expense: {},
        income: {},
        savings: {},
      };

      (['expense', 'income', 'savings'] as CategorySection[]).forEach((sec) => {
        (DEFAULT_CATEGORIES[sec] || []).forEach((catName) => {
          const clean = catName.trim().toLowerCase();
          if (deletedSet.has(clean) || deletedSet.has(`${sec}:${clean}`)) return;

          const finalCatName = renamedCatMap[`${sec}:${clean}`] || renamedCatMap[clean] || catName;
          const defaultSubs = DEFAULT_SUBCATEGORIES_BY_CATEGORY[catName] || DEFAULT_SUBCATEGORIES_BY_CATEGORY[finalCatName] || ['General'];
          const finalSubs = defaultSubs.map((sub) => {
            const cleanSub = sub.trim().toLowerCase();
            const cleanCat = finalCatName.trim().toLowerCase();
            return renamedSubMap[`${cleanCat}:${cleanSub}`] || renamedSubMap[cleanSub] || sub;
          });

          fallback[sec][finalCatName] = finalSubs;
        });
      });

      return fallback;
    }

    // Filter out deleted and apply renames to cached
    const result: Record<CategorySection, Record<string, string[]>> = {
      expense: {},
      income: {},
      savings: {},
    };

    (['expense', 'income', 'savings'] as CategorySection[]).forEach((sec) => {
      const secMap = cached![sec] || {};
      Object.keys(secMap).forEach((catName) => {
        const clean = catName.trim().toLowerCase();
        if (deletedSet.has(clean) || deletedSet.has(`${sec}:${clean}`)) return;

        const finalCatName = renamedCatMap[`${sec}:${clean}`] || renamedCatMap[clean] || catName;
        const subs = secMap[catName] || [];
        const finalSubs = subs.map((sub) => {
          const cleanSub = sub.trim().toLowerCase();
          const cleanCat = finalCatName.trim().toLowerCase();
          return renamedSubMap[`${cleanCat}:${cleanSub}`] || renamedSubMap[cleanSub] || sub;
        });

        result[sec][finalCatName] = Array.from(new Set(finalSubs));
      });
    });

    return result;
  },

  async fetchCategoriesFromDb(email?: string): Promise<Record<CategorySection, Record<string, string[]>>> {
    const userEmail = getActiveUserEmail(email);
    const deletedSet = getDeletedCategorySet(userEmail);
    const renamedCatMap = getRenamedCategoryMap(userEmail);
    const renamedSubMap = getRenamedSubcategoryMap(userEmail);

    try {
      const [catsRes, subcatsRes] = await Promise.all([
        api.get('/categories').catch(() => ({ data: { data: [] } })),
        api.get('/subcategories').catch(() => ({ data: { data: [] } })),
      ]);

      const cats: ApiCategory[] = catsRes.data?.success && Array.isArray(catsRes.data.data)
        ? catsRes.data.data
        : (Array.isArray(catsRes.data) ? catsRes.data : []);

      const subcats: ApiSubcategory[] = subcatsRes.data?.success && Array.isArray(subcatsRes.data.data)
        ? subcatsRes.data.data
        : (Array.isArray(subcatsRes.data) ? subcatsRes.data : []);

      // Sanitize deletedSet: any active category in DB must NOT be marked deleted
      cats.forEach((cat) => {
        if (cat?.name) {
          const clean = cat.name.trim().toLowerCase();
          deletedSet.delete(clean);
          deletedSet.delete(`income:${clean}`);
          deletedSet.delete(`expense:${clean}`);
          deletedSet.delete(`savings:${clean}`);
        }
      });

      const structured: Record<CategorySection, Record<string, string[]>> = {
        expense: {},
        income: {},
        savings: {},
      };

      // 1. Add categories from DB
      cats.forEach((cat) => {
        if (!cat?.name) return;
        const rawType = (cat.type || 'expense').toLowerCase();
        const section: CategorySection =
          rawType === 'income' ? 'income' : rawType === 'savings' ? 'savings' : 'expense';

        const finalCatName = renamedCatMap[`${section}:${cat.name.trim().toLowerCase()}`] ||
                             renamedCatMap[cat.name.trim().toLowerCase()] ||
                             cat.name.trim();

        if (!structured[section][finalCatName]) {
          structured[section][finalCatName] = [];
        }
      });

      // 2. Add subcategories from DB
      subcats.forEach((sub) => {
        if (!sub?.name) return;
        const parent = cats.find((c) => String(c.id) === String(sub.categoryId));
        if (parent) {
          const rawType = (parent.type || 'expense').toLowerCase();
          const section: CategorySection =
            rawType === 'income' ? 'income' : rawType === 'savings' ? 'savings' : 'expense';

          const finalCatName = renamedCatMap[`${section}:${parent.name.trim().toLowerCase()}`] ||
                               renamedCatMap[parent.name.trim().toLowerCase()] ||
                               parent.name.trim();

          const finalSubName = renamedSubMap[`${finalCatName.toLowerCase()}:${sub.name.trim().toLowerCase()}`] ||
                               renamedSubMap[sub.name.trim().toLowerCase()] ||
                               sub.name.trim();

          if (!structured[section][finalCatName]) {
            structured[section][finalCatName] = [];
          }
          if (!structured[section][finalCatName].includes(finalSubName)) {
            structured[section][finalCatName].push(finalSubName);
          }
        }
      });

      // 3. Fallback for default categories if DB doesn't have them yet and they weren't deleted
      (['expense', 'income', 'savings'] as CategorySection[]).forEach((sec) => {
        (DEFAULT_CATEGORIES[sec] || []).forEach((catName) => {
          const clean = catName.trim().toLowerCase();
          if (deletedSet.has(clean) || deletedSet.has(`${sec}:${clean}`)) return;

          const finalCatName = renamedCatMap[`${sec}:${clean}`] || renamedCatMap[clean] || catName;
          if (!structured[sec][finalCatName]) {
            structured[sec][finalCatName] = [];
          }

          if (structured[sec][finalCatName].length === 0) {
            const defaultSubs = DEFAULT_SUBCATEGORIES_BY_CATEGORY[catName] || DEFAULT_SUBCATEGORIES_BY_CATEGORY[finalCatName] || ['General'];
            defaultSubs.forEach((sub) => {
              const cleanSub = sub.trim().toLowerCase();
              const cleanCat = finalCatName.trim().toLowerCase();
              const finalSub = renamedSubMap[`${cleanCat}:${cleanSub}`] || renamedSubMap[cleanSub] || sub;
              if (!structured[sec][finalCatName].includes(finalSub)) {
                structured[sec][finalCatName].push(finalSub);
              }
            });
          }
        });
      });

      // Ensure every category has at least one subcategory
      (['expense', 'income', 'savings'] as CategorySection[]).forEach((sec) => {
        Object.keys(structured[sec]).forEach((cat) => {
          if (structured[sec][cat].length === 0) {
            const defaultSubs = DEFAULT_SUBCATEGORIES_BY_CATEGORY[cat] || ['General'];
            structured[sec][cat] = defaultSubs;
          }
        });
      });

      // Persist to storage cache
      try {
        localStorage.setItem(this.getStorageKey(email), JSON.stringify(structured));
        window.dispatchEvent(new CustomEvent('fintrack-categories-changed', { detail: { categoriesByType: structured } }));
      } catch {}

      return structured;
    } catch (err) {
      console.warn('Failed to fetch categories from DB, returning cached/fallback:', err);
      return this.getCachedCategoriesByType(email);
    }
  },

  async addCategory(name: string, type: CategorySection, email?: string): Promise<any> {
    const cleanName = name.trim();
    if (!cleanName) return null;

    unmarkDeletedCategory(email, cleanName);

    try {
      const res = await api.post('/categories', { name: cleanName, type });
      await this.fetchCategoriesFromDb(email);
      window.dispatchEvent(new CustomEvent('fintrack-categories-changed'));
      return res.data?.data;
    } catch (err) {
      console.error('Failed to create category on backend:', err);
      // Update local cache as fallback
      const cached = this.getCachedCategoriesByType(email);
      if (!cached[type][cleanName]) {
        cached[type][cleanName] = DEFAULT_SUBCATEGORIES_BY_CATEGORY[cleanName] || ['General'];
        localStorage.setItem(this.getStorageKey(email), JSON.stringify(cached));
        window.dispatchEvent(new CustomEvent('fintrack-categories-changed'));
      }
      return { name: cleanName, type };
    }
  },

  async addSubcategory(categoryId: number | string | undefined, categoryName: string, name: string, type: CategorySection, email?: string): Promise<any> {
    const cleanName = name.trim();
    if (!cleanName) return null;

    try {
      if (categoryId && !isNaN(Number(categoryId))) {
        await api.post('/subcategories', { categoryId: Number(categoryId), name: cleanName });
      }
      await this.fetchCategoriesFromDb(email);
      window.dispatchEvent(new CustomEvent('fintrack-categories-changed'));
    } catch (err) {
      console.error('Failed to create subcategory on backend:', err);
      const cached = this.getCachedCategoriesByType(email);
      if (cached[type][categoryName] && !cached[type][categoryName].includes(cleanName)) {
        cached[type][categoryName].push(cleanName);
        localStorage.setItem(this.getStorageKey(email), JSON.stringify(cached));
        window.dispatchEvent(new CustomEvent('fintrack-categories-changed'));
      }
    }
  },

  async renameCategory(id: number | string | undefined, oldName: string, newName: string, type: CategorySection, email?: string): Promise<void> {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanNew || cleanOld.toLowerCase() === cleanNew.toLowerCase()) return;

    // 1. Update local rename map
    const catMap = getRenamedCategoryMap(email);
    catMap[`${type}:${cleanOld.toLowerCase()}`] = cleanNew;
    catMap[cleanOld.toLowerCase()] = cleanNew;
    setRenamedCategoryMap(email, catMap);

    // 2. Mark old as deleted and unmark new
    addDeletedCategory(email, [cleanOld, `${type}:${cleanOld}`]);
    unmarkDeletedCategory(email, cleanNew);

    // 3. Sync to backend
    try {
      if (id && !isNaN(Number(id))) {
        await api.put(`/categories/${id}`, { name: cleanNew }).catch(() => {});
      }
      await api.put('/categories', { oldName: cleanOld, newName: cleanNew, type }).catch(() => {});
    } catch {}

    // 4. Invalidate and re-fetch
    await this.fetchCategoriesFromDb(email);
    window.dispatchEvent(new CustomEvent('fintrack-category-updated', { detail: { oldName: cleanOld, newName: cleanNew, section: type } }));
    window.dispatchEvent(new CustomEvent('fintrack-categories-changed'));
  },

  async renameSubcategory(id: number | string | undefined, parentCategoryName: string, oldName: string, newName: string, type: CategorySection, email?: string): Promise<void> {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanNew || cleanOld.toLowerCase() === cleanNew.toLowerCase()) return;

    const subMap = getRenamedSubcategoryMap(email);
    if (parentCategoryName) {
      subMap[`${parentCategoryName.toLowerCase()}:${cleanOld.toLowerCase()}`] = cleanNew;
    }
    subMap[cleanOld.toLowerCase()] = cleanNew;
    setRenamedSubcategoryMap(email, subMap);

    try {
      const rawSubId = String(id || '').replace(/^sub:?/, '');
      if (!isNaN(Number(rawSubId)) && Number(rawSubId) > 0) {
        await api.put(`/subcategories/${rawSubId}`, { name: cleanNew }).catch(() => {});
      }
    } catch {}

    await this.fetchCategoriesFromDb(email);
    window.dispatchEvent(new CustomEvent('fintrack-category-updated', { detail: { oldName: cleanOld, newName: cleanNew, section: type } }));
    window.dispatchEvent(new CustomEvent('fintrack-categories-changed'));
  },

  async deleteCategory(id: number | string | undefined, name: string, type: CategorySection, email?: string): Promise<void> {
    const cleanName = name.trim();
    addDeletedCategory(email, [cleanName, `${type}:${cleanName}`]);

    try {
      if (id && !isNaN(Number(id))) {
        await api.delete(`/categories/${id}`).catch(() => {});
      }
      await api.delete('/categories', { params: { type, name: cleanName } }).catch(() => {});
    } catch {}

    await this.fetchCategoriesFromDb(email);
    window.dispatchEvent(new CustomEvent('fintrack-categories-changed'));
  },

  async deleteSubcategory(id: number | string | undefined, _name?: string, email?: string): Promise<void> {
    try {
      const rawSubId = String(id || '').replace(/^sub:?/, '');
      if (!isNaN(Number(rawSubId)) && Number(rawSubId) > 0) {
        await api.delete(`/subcategories/${rawSubId}`).catch(() => {});
      }
    } catch {}

    await this.fetchCategoriesFromDb(email);
    window.dispatchEvent(new CustomEvent('fintrack-categories-changed'));
  }
};
export default categoryService;
