import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type PreferencesState = {
  zip: string;
  selectedStoreIds: string[];
  locationConfirmed: boolean;
  hasHydrated: boolean;
  setZip: (zip: string) => void;
  confirmLocation: (zip: string, selectedStoreIds?: string[]) => void;
  setSelectedStoreIds: (storeIds: string[]) => void;
  resetStores: () => void;
  resetLocation: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};

type PersistedPreferencesState = Pick<
  PreferencesState,
  'zip' | 'selectedStoreIds' | 'locationConfirmed'
>;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      zip: '',
      selectedStoreIds: [],
      locationConfirmed: false,
      hasHydrated: false,
      setZip: (zip) => set({ zip, selectedStoreIds: [], locationConfirmed: false }),
      confirmLocation: (zip, selectedStoreIds = []) =>
        set({ zip, selectedStoreIds, locationConfirmed: true }),
      setSelectedStoreIds: (selectedStoreIds) => set({ selectedStoreIds }),
      resetStores: () => set({ selectedStoreIds: [] }),
      resetLocation: () => set({ zip: '', selectedStoreIds: [], locationConfirmed: false }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'cartwise-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        zip: state.zip,
        selectedStoreIds: state.selectedStoreIds,
        locationConfirmed: state.locationConfirmed,
      }),
      version: 1,
      migrate: (persistedState) => persistedState as PersistedPreferencesState,
      onRehydrateStorage: (state) => (rehydratedState, error) => {
        if (error || !rehydratedState) {
          state.setHasHydrated(true);
          return;
        }

        rehydratedState.setHasHydrated(true);
      },
    },
  ),
);

export function useNeedsOnboarding() {
  return usePreferencesStore(
    (state) => !state.locationConfirmed || !/^\d{5}$/.test(state.zip),
  );
}
