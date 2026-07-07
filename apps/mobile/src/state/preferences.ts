import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type PreferencesState = {
  zip: string;
  locationConfirmed: boolean;
  hasHydrated: boolean;
  setZip: (zip: string) => void;
  confirmLocation: (zip: string) => void;
  resetLocation: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};

type PersistedPreferencesState = Pick<
  PreferencesState,
  'zip' | 'locationConfirmed'
>;

// Expo Router pre-renders the app in Node for web, where AsyncStorage's
// localStorage backend does not exist; persist against a no-op there.
const canUseDeviceStorage = typeof window !== 'undefined';

const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      zip: '',
      locationConfirmed: false,
      hasHydrated: false,
      setZip: (zip) => set({ zip, locationConfirmed: false }),
      confirmLocation: (zip) => set({ zip, locationConfirmed: true }),
      resetLocation: () => set({ zip: '', locationConfirmed: false }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'cartwise-preferences',
      storage: createJSONStorage(() => (canUseDeviceStorage ? AsyncStorage : noopStorage)),
      partialize: (state) => ({
        zip: state.zip,
        locationConfirmed: state.locationConfirmed,
      }),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<PersistedPreferencesState>;

        return {
          zip: state.zip ?? '',
          locationConfirmed: state.locationConfirmed ?? false,
        };
      },
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
