export interface ExpoPushMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: {
    type: "price-drop";
    product: string;
    store: string;
    oldPrice: number;
    newPrice: number;
  };
}

export interface ExpoClient {
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<unknown>;
}

export interface PriceDropPushInfo {
  product: string;
  store: string;
  oldPrice: number;
  newPrice: number;
}

export interface PushDeps {
  expo?: ExpoClient;
}

export async function sendPriceDropPush(
  deps: PushDeps,
  token: string,
  alertInfo: PriceDropPushInfo,
): Promise<void> {
  const expo = deps.expo ?? (await createExpoClient());
  const message: ExpoPushMessage = {
    to: token,
    sound: "default",
    title: "Price drop",
    body: `Price drop: ${alertInfo.product} now ${formatMoney(alertInfo.newPrice)} at ${alertInfo.store} (was ${formatMoney(alertInfo.oldPrice)})`,
    data: {
      type: "price-drop",
      product: alertInfo.product,
      store: alertInfo.store,
      oldPrice: alertInfo.oldPrice,
      newPrice: alertInfo.newPrice,
    },
  };

  await expo.sendPushNotificationsAsync([message]);
}

async function createExpoClient(): Promise<ExpoClient> {
  const moduleName = "expo-server-sdk";
  const expoModule = (await import(moduleName)) as { Expo: new () => ExpoClient };
  return new expoModule.Expo();
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}
