import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_STORAGE_KEY = 'cartwise-device-id';

function createUuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function getDeviceId() {
  const existingDeviceId = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existingDeviceId) {
    return existingDeviceId;
  }

  const deviceId = createUuid();
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}
