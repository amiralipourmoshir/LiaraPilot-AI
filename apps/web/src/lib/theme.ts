import { create } from 'zustand';
import { persist } from 'zustand/middleware';
type Theme = 'dark' | 'light' | 'system';
const initialTheme = (): Theme => {
  try {
    const value = localStorage.getItem('liarapilot-theme');
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch {
    return 'dark';
  }
};
export const useTheme = create<{ theme: Theme; setTheme: (theme: Theme) => void }>()(
  persist(
    (set) => ({
      theme: initialTheme(),
      setTheme: (theme) => {
        try {
          localStorage.setItem('liarapilot-theme', theme);
        } catch {
          /* Storage may be disabled. */
        }
        set({ theme });
      },
    }),
    { name: 'liarapilot-preferences' },
  ),
);
