import "server-only";
import { onlinePaymentMode } from "./bachs";
import { payOnDeliveryEnabled } from "./store-settings";

export function checkoutPolicy() {
  const mode = onlinePaymentMode();
  const payOnDelivery = payOnDeliveryEnabled();
  const options = [
    ...(payOnDelivery ? ["pay on delivery"] : []),
    ...(mode === "live" ? ["pay online through Bachs"] : []),
  ];
  return {
    options: options.length ? `For an eligible delivery address, you can ${options.join(" or ")} when that option is shown at checkout.` : null,
    sandbox: mode === "sandbox",
  };
}
