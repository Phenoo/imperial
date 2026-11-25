# Imperial Foods & Beverages merchant handover

Use the staff dashboard to approve information before publishing it. The live catalogue can continue to accept wholesale enquiries while product details are being confirmed.

| Confirm | Where to enter it |
| --- | --- |
| The exact selling unit, weight or volume per item, items per pack, carton contents, total size, minimum quantity and purchase route for each SKU. Confirm the price and stock in that same selling unit. | **Products**. Verify stock and approve the product for checkout. Use a separate SKU for each new size or pack. Allocate stock separately across individual packs and cartons. |
| Ingredients, allergens, manufacturer, origin, verified product registration, storage and after-opening instructions, preparation and any verified batch or remaining shelf life detail. Supply readable front and label photos. | **Products**. Leave batch-dependent or unconfirmed details blank until verified. |
| Public trading and registration details, address, public phone, support and privacy email, service hours, official social links, and business photos. Confirm collection address, hours and instructions before offering collection. | **Business → Public details** |
| Approved changes to Lagos fees and estimates, eligible free-delivery subtotal, any minimum subtotal, maximum verified shipping weight or SKU that needs a delivery quote. | **Delivery**, and **Products** for verified shipping weight and items that need a quote. |
| Exact wholesale pack contents, minimum quantities, approved prices and discounts, delivery charges, and quote expiry. Confirm any response expectation before publishing it. | **Wholesale** to prepare a saved quotation. **Business** to publish an approved response expectation. Share quotations through the customer’s agreed contact channel. |
| Approved refund-processing expectation and any customer service timelines. | **Business**. Review the public delivery, returns, terms and privacy pages against current operations. |
| Genuine customer feedback and permission to publish it, including permission for any name or photo used. | **Business → Customer reviews** |
| Verified branded storefront domain and any customer messaging services. | Set `STORE_PUBLIC_URL` after the domain is connected and verified. Order emails use the existing verified Resend sender and `STORE_URL` when the service is configured. |

The catalogue uses stock in selling units per SKU. A separate individual SKU and carton SKU each need their own allocated stock. Stock pools shared across SKUs and opt-in restock reminders are not implemented. A reminder launch needs a real messaging service, customer consent and a withdrawal mechanism.

Shop interactions emit a first-party browser event. To collect daily counts in Firestore, set `NEXT_PUBLIC_STORE_ANALYTICS=1` and deploy. Use production request limits for the anonymous endpoint before enabling collection at scale. The counters distinguish demo traffic, exclude customer details and do not represent payments or completed purchases.
