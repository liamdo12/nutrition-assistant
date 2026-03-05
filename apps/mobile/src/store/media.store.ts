import { create } from 'zustand';

export interface MediaItem {
  uri: string;
  type: 'photo' | 'video' | 'audio';
  createdAt: number;
}

interface MediaState {
  items: MediaItem[];
  addItem: (item: MediaItem) => void;
  clearItems: () => void;
}

export const useMediaStore = create<MediaState>(set => ({
  items: [],
  addItem: item => set(state => ({ items: [...state.items, item] })),
  clearItems: () => set({ items: [] }),
}));
