import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isUsingMocks, registerPushToken } from '@/api/client';

export type PushPermissionStatus = 'denied' | 'granted' | 'undetermined' | 'unsupported';

export type PushRegistrationResult =
  | { status: 'registered'; expoPushToken: string }
  | { status: 'denied' | 'error' | 'unsupported'; message: string };

const MOCK_EXPO_PUSH_TOKEN = 'ExponentPushToken[mock-cartwise-price-alerts]';
const PLACEHOLDER_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
const EAS_PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getProjectId() {
  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  return projectId?.trim();
}

function isConfiguredProjectId(projectId: string | undefined) {
  return Boolean(
    projectId &&
      projectId !== PLACEHOLDER_PROJECT_ID &&
      EAS_PROJECT_ID_PATTERN.test(projectId),
  );
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (isUsingMocks()) {
    return 'granted';
  }

  if (Platform.OS === 'web') {
    return 'unsupported';
  }

  const permissions = await Notifications.getPermissionsAsync();
  return permissions.status === 'granted' || permissions.status === 'denied'
    ? permissions.status
    : 'undetermined';
}

export async function registerForPriceAlerts(): Promise<PushRegistrationResult> {
  if (isUsingMocks()) {
    await registerPushToken(MOCK_EXPO_PUSH_TOKEN);
    return { status: 'registered', expoPushToken: MOCK_EXPO_PUSH_TOKEN };
  }

  if (Platform.OS === 'web') {
    return {
      status: 'unsupported',
      message: 'Price alerts are available in the iOS and Android app.',
    };
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('price-alerts', {
        name: 'Price alerts',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const existingPermissions = await Notifications.getPermissionsAsync();
    const finalPermissions =
      existingPermissions.status === 'granted'
        ? existingPermissions
        : await Notifications.requestPermissionsAsync();

    if (finalPermissions.status !== 'granted') {
      return {
        status: 'denied',
        message: 'Notifications are off. Enable notifications in system settings to receive price alerts.',
      };
    }

    if (!Device.isDevice) {
      return {
        status: 'unsupported',
        message: 'Push alerts need a physical iOS or Android device.',
      };
    }

    const projectId = getProjectId();
    if (!isConfiguredProjectId(projectId)) {
      return {
        status: 'unsupported',
        message: 'Push alerts are not configured for this build. Set a real EAS project ID and rebuild Cartwise.',
      };
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token.data);

    return { status: 'registered', expoPushToken: token.data };
  } catch {
    return {
      status: 'error',
      message: 'Could not enable price alerts right now. Check your connection and try again.',
    };
  }
}
