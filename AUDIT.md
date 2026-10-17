# Audit report

## How it was tested
- **Real headless Chrome** drove both pages (business app and customer page) at phone size through a full day of use: sign-in, settings, products with photos, customer order, payment buttons, slip upload, WhatsApp link, phone alert, order stages, delivery, invoices, stock, raw material, assets, expenses and losses, reports, deletes.
- The Firebase SDK was replaced by a stand-in that behaves like Firestore (live updates, batches, transactions) and **enforces a copy of `firestore.rules`**. 59 checks, including 22 attacks as an anonymous customer and script-injection payloads.
- A second run with the strict Content-Security-Policy enforced (no inline or outside scripts allowed).
- The real Firebase emulator and a real Firebase project could not be used in the test environment (network blocked and it needs your Google account).

## Found and fixed
| # | Finding | Fix |
|---|---|---|
| 1 | Checkout form wiped if the menu changed while a customer typed | Live updates no longer redraw the form |
| 2 | Customers could add junk fields to an order | Rules allow only the listed fields |
| 3 | Unlimited text in the payment-app field | Limited to 40 characters |
| 4 | "Slip" could be any text, not a photo | Rules require a JPEG image, under 800 KB |
| 5 | Advance due could exceed the total | Rules reject it |
| 6 | A customer editing prices in the browser went unnoticed | Business app shows "Check price" when totals, prices or advance do not match the menu |
| 7 | Out-of-stock item could still be ordered from an old screen | Re-checked at checkout |
| 8 | Photo preview in the form was huge | CSS class clash fixed |
| 9 | Firebase code loaded from a public CDN | Copied into the project (`public/vendor`), no outside scripts |
| 10 | No script policy | Strict Content-Security-Policy on both pages |
| 11 | Android backup could copy app data; web debugging possible | Backup off in the APK build; web debugging off |
| 12 | Offline copy of business data stayed after sign-out | Sign-out wipes it |
| 13 | Bots could submit orders | Hidden trap field (basic only) |

## Attacks that were blocked
Listing or reading other orders, invoices, customers; changing order status or "advance received"; deleting orders; editing products, shop settings or payment accounts; jumping the order counter; creating an already-delivered order; script injection through name, address, note, item names, payment app (nothing executed on either side).

## Not covered / still open
- Firestore rules syntax and the slip-photo check were **not run on the real engine**. Do the "First real test" in `SETUP-GUIDE.md` first.
- The APK build, real payment-app launching, WhatsApp sharing and ntfy delivery on a real Android phone were not tested.
- Order spam: anyone with the link can place fake orders. Hidden field only. App Check would stop it properly.
- The alert topic is stored in public shop settings (the order page must know it). Alert text has only order number and total. Anyone who learns the topic could send fake alerts.
- The order counter can be bumped by one by anyone (skips numbers, harmless).
- Anyone who holds an order's link-id can see that order and its slip. Ids are random and unguessable.
- The APK is a debug build (installable, not Play Store ready).

## About encryption
- Everything travels over HTTPS/TLS (Firebase, GitHub Pages, ntfy).
- Google encrypts Firestore data at rest by default.
- Slips and customer details are readable by you (the owner) in the app and Firebase console, and by nobody else through the rules. Extra end-to-end encryption would stop the app searching, summing and showing them, so it is not added.
