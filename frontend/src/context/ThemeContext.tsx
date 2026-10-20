import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  effectiveTheme: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  effectiveTheme: 'dark'
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('fintrack_theme') as ThemeMode;
    return saved || 'system';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const updateTheme = () => {
      let resolved: 'dark' | 'light' = 'dark';
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolved = prefersDark ? 'dark' : 'light';
      } else {
        resolved = theme;
      }
      setEffectiveTheme(resolved);
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

    updateTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => updateTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    localStorage.setItem('fintrack_theme', newTheme);
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
