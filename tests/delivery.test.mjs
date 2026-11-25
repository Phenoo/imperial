import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultDelivery } from "../lib/commerce.ts";
import { estimateDelivery } from "../lib/delivery-estimate.ts";

test("shared defaults use the eligible Lagos fees and free-delivery threshold", () => {
  assert.deepEqual(estimateDelivery("", 75000, defaultDelivery, []), { kind: "unselected" });
  assert.deepEqual(estimateDelivery("island", 74999, defaultDelivery, []), { kind: "priced", fee: 3000, time: "1–2 business days" });
  assert.deepEqual(estimateDelivery("mainland", 74999, defaultDelivery, []), { kind: "priced", fee: 3500, time: "1–2 business days" });
  assert.deepEqual(estimateDelivery("outer", 74999, defaultDelivery, []), { kind: "priced", fee: 5000, time: "2–3 business days" });
  assert.deepEqual(estimateDelivery("mainland", 75000, defaultDelivery, []), { kind: "priced", fee: 0, time: "1–2 business days" });
  assert.deepEqual(estimateDelivery("outside-lagos", 90000, defaultDelivery, []), { kind: "quote" });
});

test("merchant-configured limits and bulky items require the appropriate delivery decision", () => {
  const delivery = { ...defaultDelivery, minimumSubtotal: 5000, quoteAboveWeightGrams: 10000 };
  const weighed = [{ product: { shippingWeightGrams: 5000 }, quantity: 2 }];
  assert.deepEqual(estimateDelivery("island", 4999, delivery, weighed), { kind: "minimum", minimum: 5000 });
  assert.equal(estimateDelivery("island", 5000, delivery, weighed).kind, "priced");
  assert.deepEqual(estimateDelivery("island", 80000, delivery, [{ ...weighed[0], quantity: 3 }]), { kind: "quote" });
  assert.deepEqual(estimateDelivery("island", 80000, delivery, [{ product: {}, quantity: 1 }]), { kind: "quote" });
  assert.deepEqual(estimateDelivery("island", 80000, defaultDelivery, [{ product: { deliveryQuoteOnly: true }, quantity: 1 }]), { kind: "quote" });
});
