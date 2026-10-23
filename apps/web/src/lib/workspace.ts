import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createContext, useContext } from 'react';
import type { SessionDto } from '../../../../packages/shared/src/index';
import { demoProjects } from '../demo/data';
export type WorkspaceMode = 'DEMO' | 'LOCAL' | 'LIVE';
export const useWorkspaceUi = create<{
  mode: WorkspaceMode;
  selectedProject: string;
  setMode: (mode: WorkspaceMode) => void;
  setProject: (id: string) => void;
}>()(
  persist(
    (set) => ({
      mode: 'LOCAL',
      selectedProject: 'all',
      setMode: (mode) => set({ mode, selectedProject: 'all' }),
      setProject: (id) =>
        set({
          selectedProject:
            id === 'all' || demoProjects.some((project) => project.id === id) ? id : 'all',
        }),
    }),
    {
      name: 'liarapilot-workspace-v3',
      version: 1,
      partialize: (state) => ({ mode: state.mode, selectedProject: state.selectedProject }),
    },
  ),
);
export const WorkspaceContext = createContext<{
  base: string;
  preview: boolean;
  mode: WorkspaceMode;
  user: SessionDto['user'];
} | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('Workspace context missing');
  return context;
}
export const persianNumber = (value: number, decimals = 0) =>
  new Intl.NumberFormat('fa-IR', { maximumFractionDigits: decimals }).format(value);
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('fa-IR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tehran',
  }).format(new Date(value));
