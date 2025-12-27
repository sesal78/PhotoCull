import { create } from 'zustand';
import { ImageFile, EditState, DEFAULT_EDIT_STATE, Flag } from '../types';

interface AppState {
  folderPath: string | null;
  files: ImageFile[];
  editStates: Record<string, EditState>;
  thumbnails: Record<string, string>;
  selectedIndex: number;
  previewUrl: string | null;
  isLoading: boolean;
  error: string | null;
  cropMode: boolean;
  
  setFolder: (path: string, files: ImageFile[], editStates: Record<string, EditState>) => void;
  setSelectedIndex: (index: number) => void;
  setThumbnail: (fileId: string, url: string) => void;
  setPreviewUrl: (url: string | null) => void;
  updateEdit: (fileId: string, updates: Partial<EditState>) => void;
  setRating: (fileId: string, rating: number) => void;
  setFlag: (fileId: string, flag: Flag) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCropMode: (enabled: boolean) => void;
  reset: () => void;
  
  selectedFile: () => ImageFile | null;
  selectedEditState: () => EditState;
}

export const useAppStore = create<AppState>((set, get) => ({
  folderPath: null,
  files: [],
  editStates: {},
  thumbnails: {},
  selectedIndex: 0,
  previewUrl: null,
  isLoading: false,
  error: null,
  cropMode: false,

  setFolder: (path, files, editStates) => set({
    folderPath: path,
    files,
    editStates,
    selectedIndex: 0,
    previewUrl: null,
    error: null,
  }),

  setSelectedIndex: (index) => set({ selectedIndex: index, previewUrl: null }),

  setThumbnail: (fileId, url) => set((state) => ({
    thumbnails: { ...state.thumbnails, [fileId]: url },
  })),

  setPreviewUrl: (url) => set({ previewUrl: url }),

  updateEdit: (fileId, updates) => set((state) => ({
    editStates: {
      ...state.editStates,
      [fileId]: { ...(state.editStates[fileId] || DEFAULT_EDIT_STATE), ...updates },
    },
  })),

  setRating: (fileId, rating) => {
    const clamped = Math.max(0, Math.min(5, rating));
    get().updateEdit(fileId, { rating: clamped });
  },

  setFlag: (fileId, flag) => {
    get().updateEdit(fileId, { flag });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setCropMode: (enabled) => set({ cropMode: enabled }),

  reset: () => set({
    folderPath: null,
    files: [],
    editStates: {},
    thumbnails: {},
    selectedIndex: 0,
    previewUrl: null,
    isLoading: false,
    error: null,
    cropMode: false,
  }),

  selectedFile: () => {
    const { files, selectedIndex } = get();
    return files[selectedIndex] || null;
  },

  selectedEditState: () => {
    const file = get().selectedFile();
    if (!file) return DEFAULT_EDIT_STATE;
    return get().editStates[file.id] || DEFAULT_EDIT_STATE;
  },
}));
