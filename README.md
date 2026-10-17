# Bakery Manager

Two parts that share one Firebase database, so changes appear on both sides live:

- **`public/order.html`** – customer order page (a web link, no install). Menu with photos, cart, order number, advance-payment buttons, slip upload, WhatsApp message, live order status.
- **`public/index.html`** – business app (sign-in required). Orders, sale and purchase invoices, products and stock, raw material, tools/assets, expenses and losses, customers, profit report, settings. Photos can be attached to products, raw material, tools, expenses and invoices. Packaged as an Android APK by GitHub.

**Full step-by-step setup (Firebase, then GitHub, then phone alerts): see `SETUP-GUIDE.md`.**

## How the order flow works

1. Customer picks items, enters details, taps **Place order**. They get an order number (BK-0001…). The order appears on the business side instantly with a sound alert, and a phone alert (ntfy) is sent even if the app is closed.
2. Customer taps their payment app. The account number is **copied automatically** and the app is opened if installed. They paste, pay, then attach the slip screenshot.
3. **Send on WhatsApp** opens the share sheet with the order number and the slip image, or a WhatsApp chat with the message prefilled. The slip is also saved on the order itself.
4. Business taps **Advance received**, then moves the order through Confirm, Baking, Ready, Delivered. Delivering creates the sale invoice, updates stock and adds the customer. The customer sees each status change live.

## Known limits

- A web page cannot type into another app's fields. The account number is copied instead. If a payment app does not open, correct its **Android package id** in Settings.
- WhatsApp cannot be sent silently; the customer must press send.
- Phone alerts use the free public ntfy.sh service and need the ntfy app. Alert text has only the order number and total.
- Photos are shrunk and stored inside the database records (no paid storage needed). Keep product photos to a reasonable number.
- Net profit = sales − material purchases − expenses − losses (no recipe costing).
- Customers could in theory tamper with prices in their own browser, so check each order's total before confirming.
