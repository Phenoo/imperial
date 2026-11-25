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
| Any customer messaging services. | The branded domain is connected at **https://www.imperialgroupfoodsng.com**. Order emails require a configured, verified Resend sender; no email service has been enabled for this sandbox launch. |

The catalogue uses stock in selling units per SKU. A separate individual SKU and carton SKU each need their own allocated stock. Stock pools shared across SKUs and opt-in restock reminders are not implemented. A reminder launch needs a real messaging service, customer consent and a withdrawal mechanism.

Shop interactions emit a first-party browser event. To collect daily counts in Firestore, set `NEXT_PUBLIC_STORE_ANALYTICS=1` and deploy. Use production request limits for the anonymous endpoint before enabling collection at scale. The counters distinguish demo traffic, exclude customer details and do not represent payments or completed purchases.

## Connected services — 25 November 2026

- Production is **Imperial → imperial** (`imperial-b3f3/imperial`) on Vercel, deployed from **Phenoo/imperial** on GitHub. The earlier `logicleads-projects/imperial-foods-beverages` deployment is a separate legacy project.
- The branded domain uses the existing **imperial-foods-and-beverages** Firebase database and staff accounts. Its public hostnames are authorised in Firebase Authentication. Staff APIs still require an authenticated account with the admin claim.
- New checkouts use **Paystack test mode**. The secret key is stored server-side as a Vercel Secret. Test callback and signed webhook URLs point to the branded domain. A hosted sandbox payment, tracking, duplicate requests, stock restoration and the fulfilment block were verified. Keep `STORE_DEMO_CATALOG=1`; no live activation has been performed.
- Search Console ownership is verified using the homepage HTML tag under Ochor's Google account. `/sitemap.xml` was submitted successfully and contains 86 product URLs plus 10 public pages. Preserve the verification token. Public indexing is enabled independently of sandbox payments; private routes remain excluded.
- GA4 property **565847563**, account **417449750**, stream **16412489234**, measurement ID **G-NC2Y2YKK54** are owned by Ochor's Google account. The web stream uses Nigeria time and NGN. Enhanced measurement and optional account data sharing are disabled. The consented tag sends public page views and existing shopping event names with `commerce_mode=sandbox`; it does not send purchase events for test payments. General Analytics properties exclude customer contact details, search text and order references.
- Visitors can decline analytics or withdraw through **Privacy → Cookie settings**. The footer preference control has been removed. Google reports may take time to populate after the first events arrive. No reviews, sales totals or customer counts have been manufactured.

## Public catalogue resilience

Public catalogue, business, delivery and approved-review reads use a shared five-minute Next.js data cache. Staff product/catalogue, business/review and delivery saves invalidate the relevant cache after a successful authorised write. Checkout, stock transactions, order tracking and staff records continue to read Firestore directly. Public stock may lag until the next cache refresh; checkout always rechecks the current selling unit, price and stock.

If a public database read fails or exceeds its 2.5-second rendering deadline, the site can still show the 86 existing catalogue photos and descriptions. Fallback products are enquiry-only with no published prices or confirmed stock. This keeps browsing available; it does not make database-dependent checkout, staff saves or stored enquiries work during an exhausted Firestore quota. The underlying SDK read may finish after the rendering deadline. Firebase billing remains disabled; no paid plan was activated.

Branded HTML/plain-text order email code is deployed with a monitored Reply-To setting. Resend account access, sender-domain verification and the setup test are still pending Google sign-in verification. Customer messages remain disabled until the provider is configured; simulated orders remain excluded.

Before activating real payments in a separate approved task, review merchant-approved catalogue data, delivery operations, business contact details, fulfilment procedures and notification configuration. Existing unresolved pack specifications continue through the quotation route.
