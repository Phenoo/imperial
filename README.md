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
```

The integration tests require a running local app and both emulators. They create and clean up their own test data and accounts. Use `TEST_STORE_URL` for a different local port.

## Set up a live store

1. Create or select the merchant’s Firebase project, enable Cloud Firestore and Email/Password Authentication, and register a Firebase Web App. Deploy `firestore.rules` with `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`. All access to Firestore runs through the Next.js server; rules deny direct browser access.
2. On your Node.js host, configure `FIREBASE_PROJECT_ID` and the matching `NEXT_PUBLIC_FIREBASE_*` web app values from `.env.example`. Omit all emulator settings. Use Application Default Credentials on Google Cloud or inject the service account JSON through the host’s secret manager. The server needs Firestore access plus Firebase Auth access to verify staff sessions. Never commit a credential or put it in a public variable.
3. To give an existing Firebase user staff access, run `STAFF_EMAIL=owner@example.com npm run seed -- --live --admin-only` in a trusted environment with those project settings. If the user does not exist, provide a strong `STAFF_PASSWORD` through your local environment. Staff API routes require the `admin: true` custom claim and check for revoked tokens. To remove access, remove the claim and revoke the user's refresh tokens from a trusted Admin SDK process.
4. Enter approved prices, inventory and carton sizes. Set `STORE_LAGOS_DELIVERY_RULES` with the confirmed rates and estimates, plus `STORE_SUPPORT_EMAIL` and `STORE_SUPPORT_WHATSAPP` with public business contacts. Verify the FAQ, returns and privacy information against the business’s operations. See [photo sources](IMAGE-CREDITS.md) for the starter assets.
5. Deploy the Next.js build to a Node.js host, set production environment variables before building, and configure HTTPS and traffic limits for the public order and tracking endpoints. Test fulfilment with the team before inviting customers.

## Payments and receipts

- Set `STORE_URL` to the checkout’s public HTTPS origin. Bachs requires a publicly reachable return URL. For local sandbox testing, use an HTTPS tunnel that routes back to the same local Firebase emulators.
- Add the server-only `BACHS_API_KEY` with payment read and write scopes. Register `/api/checkout/bachs-webhook` for `collection.succeeded`, `checkout.completed`, and `checkout.expired`, then set `BACHS_WEBHOOK_SECRET` to the signing secret for that endpoint. Keep sandbox and live credentials separate. [Bachs checkout documentation](https://docs.bachs.io/guides/checkout/checkout-sessions)
- The server calculates the naira total and reserves inventory once when it creates the order. It verifies the checkout reference, currency, and amount against Bachs before releasing the order for fulfilment. Staff can refresh payment status in the dashboard. A cancellation of a paid order flags it for a refund in the Bachs dashboard, and staff can refresh the refund status afterwards.
- Set `RESEND_API_KEY` and `STORE_ORDER_FROM` to send receipts and tracking links to customers who provide an email. The sender must be configured in Resend.
- For hosted demos, set `STORE_DEMO_CATALOG=1` and use Bachs sandbox credentials. To launch live, use merchant-approved catalogue data, confirm delivery and support settings, remove demo mode, then configure the live Bachs API key and webhooks. Staff can set their password from the dashboard sign-in screen.
