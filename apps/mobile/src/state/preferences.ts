import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type PreferencesState = {
  zip: string;
  selectedStoreIds: string[];
  hasHydrated: boolean;
  setZip: (zip: string) => void;
  setSelectedStoreIds: (storeIds: string[]) => void;
  resetStores: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      zip: '',
      selectedStoreIds: [],
      hasHydrated: false,
      setZip: (zip) => set({ zip }),
      setSelectedStoreIds: (selectedStoreIds) => set({ selectedStoreIds }),
      resetStores: () => set({ selectedStoreIds: [] }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'cartwise-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        zip: state.zip,
        selectedStoreIds: state.selectedStoreIds,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export function useNeedsOnboarding() {
  return usePreferencesStore((state) => state.zip.length !== 5 || state.selectedStoreIds.length < 2);
}
