// Shared Selected Year Synchronization Service

const YEAR_STORAGE_KEY = 'fintrack_selected_year';

export const yearService = {
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
