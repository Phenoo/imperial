# Imperial Foods & Beverages

A Next.js and Tailwind grocery store with delivery across Nigeria. The storefront has catalogue search and filters, selling-unit details, saved shopping lists, guest checkout and private order tracking. Checkout calculates eligible Lagos rates and prepares WhatsApp delivery enquiries for baskets that need a quote. The Firebase staff dashboard manages products, inventory, wholesale quotations, delivery rules, business details, support and approved reviews.

## Run locally

Use Node 22.13+ (22 LTS) or Node 24+, Java 21+, and the [Firebase CLI](https://firebase.google.com/docs/cli). From the project directory:

```sh
npm ci
cp .env.example .env.local
npm run emulators
```

In a second terminal, seed the emulators and start the store:

```sh
STAFF_EMAIL=staff@imperial.test STAFF_PASSWORD='replace-with-a-local-password' npm run seed
npm run dev -- --port 3640
```

Open [the store](http://localhost:3640) or [staff sign-in](http://localhost:3640/admin). Use the same email and password you supplied to the seed command. Seeding creates only missing products; it preserves any edits made in the dashboard. The emulator uses in-memory data by default; to keep it, use the Firebase CLI’s import/export flags with a private local directory.

Without Firebase settings the store displays the starter catalogue. With the emulators running, checkout and the dashboard use the same Firestore records. The starter catalogue is for enquiries until staff verify the exact pack, inventory and price. The emulator tests create and remove their own approved fixture products.

Products with unconfirmed specifications, prices or stock show **Price on request**. In **Staff dashboard → Products**, confirm the selling unit and contents, set the price and stock in that selling unit, and approve it for checkout. Bulk adjustments are available for approved products. Use the [merchant handover](MERCHANT-HANDOVER.md) to collect the remaining approved information.

## Verify

```sh
npm run lint
npm run typecheck
npm run build
npm run test:integration
node --experimental-strip-types --test tests/product.test.mjs tests/delivery.test.mjs
node --env-file-if-exists=.env.local --test tests/business.integration.test.mjs
node --env-file-if-exists=.env.local --conditions=react-server --experimental-transform-types --test tests/paystack.integration.test.mjs
```

The integration tests require a running local app and both emulators. They create and clean up their own test data and accounts. Use `TEST_STORE_URL` for a different local port.
Run the original fulfilment integration suite with `STORE_DEMO_CATALOG=0` on the local app, with no payment credentials. The Paystack suite uses a mock gateway and local emulators; it does not contact Paystack or place real orders.

## Set up a live store

1. Create or select the merchant’s Firebase project, enable Cloud Firestore and Email/Password Authentication, and register a Firebase Web App. Deploy `firestore.rules` with `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`. All access to Firestore runs through the Next.js server; rules deny direct browser access.
2. On your Node.js host, configure `FIREBASE_PROJECT_ID` and the matching `NEXT_PUBLIC_FIREBASE_*` web app values from `.env.example`. Omit all emulator settings. Use Application Default Credentials on Google Cloud or inject the service account JSON through the host’s secret manager. The server needs Firestore access plus Firebase Auth access to verify staff sessions. Never commit a credential or put it in a public variable.
3. To give an existing Firebase user staff access, run `STAFF_EMAIL=owner@example.com npm run seed -- --live --admin-only` in a trusted environment with those project settings. If the user does not exist, provide a strong `STAFF_PASSWORD` through your local environment. Staff API routes require the `admin: true` custom claim and check for revoked tokens. To remove access, remove the claim and revoke the user's refresh tokens from a trusted Admin SDK process.
4. Enter approved prices, inventory and carton sizes. Set `STORE_LAGOS_DELIVERY_RULES` with the confirmed rates and estimates, plus `STORE_SUPPORT_EMAIL` and `STORE_SUPPORT_WHATSAPP` with public business contacts. Verify the FAQ, returns and privacy information against the business’s operations. See [photo sources](IMAGE-CREDITS.md) for the starter assets.
5. Deploy the Next.js build to a Node.js host, set production environment variables before building, and configure HTTPS and traffic limits for the public order and tracking endpoints. Test fulfilment with the team before inviting customers.

## Payments and receipts

- Set server-only `PAYSTACK_SECRET_KEY` to the merchant’s `sk_test_` key. The Paystack key selects Paystack for new checkouts. Keep `STORE_DEMO_CATALOG=1` for test mode. No public key or card details are required on the storefront.
- Set `STORE_URL` to the storefront’s HTTPS origin. Register `/api/checkout/paystack-webhook` in the Paystack test dashboard. If the account uses a `whsec_` webhook signing secret, set `PAYSTACK_WEBHOOK_SECRET`. Accounts using the legacy `x-paystack-signature` header are verified with the test secret key until a signing secret is configured.
- Paystack requires a customer email for online checkout. Amounts and delivery charges are calculated by the server and converted from naira to kobo. Callbacks and signed webhooks verify the reference, NGN amount and test/live environment before marking a payment confirmed.
- Existing Bachs orders retain their original provider and can still be reconciled when the Bachs credentials remain configured. Keep `/api/checkout/bachs-webhook` registered for those orders.
- Stock reservations, releases and verified late payments are processed transactionally. Test purchases remain simulated and cannot enter fulfilment or send real fulfilment notifications.
- Refunds are issued through the original provider dashboard. Refresh payment status after a full reversal. Partial Paystack refunds require staff review in Paystack.
- Set `RESEND_API_KEY` and `STORE_ORDER_FROM` to send receipts and tracking links to customers who provide an email. The sender must be verified in Resend. Simulated orders do not send fulfilment messages.

## Branded domain, search and analytics

- Set `STORE_URL` and `STORE_PUBLIC_URL` to `https://www.imperialgroupfoodsng.com` on the domain's production project. Canonicals, product enquiry links, payment callbacks and the sitemap use this origin.
- Set `GOOGLE_SITE_VERIFICATION` to the merchant's Search Console HTML verification token, verify ownership and submit `/sitemap.xml` in Search Console.
- `STORE_SEARCH_INDEXING=1` allows catalogue indexing while `STORE_DEMO_CATALOG=1` keeps transactions simulated. Preview deployments remain excluded, as do private staff, checkout, tracking and catalogue invitation routes. Indexing does not activate payments.
- Set `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` to the merchant's GA4 web stream ID. Analytics loads only after consent, excludes private page views and URL query strings, and forwards the existing shopping event names without customer details. Disable enhanced measurement in the Google web stream: page views and shopping events are sent explicitly. Advertising signals are disabled. No purchase event is emitted for sandbox transactions.
- Visitors can withdraw consent through **Analytics preferences**. Configure the GA4 `commerce_mode` event dimension to distinguish sandbox activity from live commerce if reporting is enabled.
