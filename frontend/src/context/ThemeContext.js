import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('pfy_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
      document.documentElement.classList.remove('dark-mode');
      // 인라인 스타일 직접 적용 (CSS 우선순위 문제 완전 해결)
      document.documentElement.style.backgroundColor = '#f2f2f2';
      document.body.style.backgroundColor = '#f2f2f2';
      document.body.style.color = '#111';
    } else {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
      document.documentElement.classList.add('dark-mode');
      document.documentElement.classList.remove('light-mode');
      document.documentElement.style.backgroundColor = '#141414';
      document.body.style.backgroundColor = '#141414';
      document.body.style.color = '#fff';
    }
    localStorage.setItem('pfy_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}