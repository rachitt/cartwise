import { describe, expect, it } from "vitest";

import { sendPriceDropPush, type ExpoPushMessage } from "./push.js";

describe("sendPriceDropPush", () => {
  it("formats a price drop message for Expo", async () => {
    const sent: ExpoPushMessage[][] = [];

    await sendPriceDropPush(
      {
        expo: {
          async sendPushNotificationsAsync(messages) {
            sent.push(messages);
          },
        },
      },
      "ExponentPushToken[test]",
      {
        product: "Milk",
        store: "A Market",
        oldPrice: 4,
        newPrice: 2.99,
      },
    );

    expect(sent).toEqual([
      [
        {
          to: "ExponentPushToken[test]",
          sound: "default",
          title: "Price drop",
          body: "Price drop: Milk now $2.99 at A Market (was $4.00)",
          data: {
            type: "price-drop",
            product: "Milk",
            store: "A Market",
            oldPrice: 4,
            newPrice: 2.99,
          },
        },
      ],
    ]);
  });
});
