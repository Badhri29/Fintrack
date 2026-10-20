import React, { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  effectiveTheme: 'dark' | 'light';
}

export const resolveEffectiveTheme = (mode: ThemeMode): 'dark' | 'light' => {
  if (mode === 'system') {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
};

export const applyThemeToDOM = (resolved: 'dark' | 'light') => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
  document.body.setAttribute('data-theme', resolved);
  if (resolved === 'light') {
    document.documentElement.classList.add('light-theme');
    document.documentElement.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  } else {
    document.documentElement.classList.add('dark-theme');
    document.documentElement.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  }
  window.dispatchEvent(new CustomEvent('fintrack-theme-change', { detail: { theme: resolved } }));
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  effectiveTheme: 'dark'
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = (typeof window !== 'undefined' ? localStorage.getItem('fintrack_theme') : null) as ThemeMode;
    const initialMode = saved || 'system';
    // Immediately apply to DOM on load so there is zero initial flash
    const initialResolved = resolveEffectiveTheme(initialMode);
    applyThemeToDOM(initialResolved);
    return initialMode;
  });

  const effectiveTheme = resolveEffectiveTheme(theme);

  // Synchronously update DOM if system preference changes
  useLayoutEffect(() => {
    applyThemeToDOM(effectiveTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        const resolved = resolveEffectiveTheme('system');
        applyThemeToDOM(resolved);
        // Force re-render to update effectiveTheme
        setThemeState('system');
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    localStorage.setItem('fintrack_theme', newTheme);
    // CRITICAL: Synchronously apply to DOM BEFORE React even re-renders!
    const resolved = resolveEffectiveTheme(newTheme);
    applyThemeToDOM(resolved);
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
