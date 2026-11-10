// Shared Selected Year Synchronization Service
// Default policy: Every website login or browser page refresh ALWAYS starts strictly at current year and current month.

const YEAR_STORAGE_KEY = 'fintrack_selected_year';

// Purge any persisted stale year/month so page reloads or fresh logins always default to the current date
try {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(YEAR_STORAGE_KEY);
    localStorage.removeItem(YEAR_STORAGE_KEY);
    localStorage.removeItem('fintrack_selected_month');
    sessionStorage.removeItem('fintrack_selected_month');
  }
} catch {}

export const yearService = {
  getCurrentYear(): number {
    return new Date().getFullYear();
  },

  getCurrentMonth(): number {
    return new Date().getMonth();
  },

  getSelectedYear(): number {
    try {
      const stored = sessionStorage.getItem(YEAR_STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= 1990 && parsed <= 2100) {
          return parsed;
        }
      }
    } catch {}
    return new Date().getFullYear();
  },

  setSelectedYear(year: number) {
    try {
      sessionStorage.setItem(YEAR_STORAGE_KEY, String(year));
      window.dispatchEvent(new CustomEvent('fintrack-year-changed', { detail: year }));
    } catch {}
  },

  resetToCurrentYear(): number {
    const currentYear = new Date().getFullYear();
    try {
      sessionStorage.removeItem(YEAR_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('fintrack-year-changed', { detail: currentYear }));
    } catch {}
    return currentYear;
  }
};
