import { create } from 'zustand';

interface UiStore {
  quickAddOpen: boolean;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  quickAddOpen: false,
  openQuickAdd: () => {
    set({ quickAddOpen: true });
  },
  closeQuickAdd: () => {
    set({ quickAddOpen: false });
  },
}));
