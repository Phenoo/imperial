import "server-only";
import { onlinePaymentMode, onlinePaymentProvider } from "./payments";
import { paymentProviderName } from "./commerce";
import { payOnDeliveryEnabled } from "./store-settings";

export function checkoutPolicy() {
  const mode = onlinePaymentMode();
  const provider = paymentProviderName(onlinePaymentProvider());
  const payOnDelivery = payOnDeliveryEnabled();
  const options = [
    ...(payOnDelivery ? ["pay on delivery"] : []),
    ...(mode === "live" ? [`pay online through ${provider}`] : []),
  ];
  return {
    options: options.length ? `For an eligible delivery address, you can ${options.join(" or ")} when that option is shown at checkout.` : null,
    sandbox: mode === "sandbox", provider,
  };
}
