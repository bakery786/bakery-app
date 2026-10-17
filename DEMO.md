# Try it on your computer first (no Firebase, no GitHub)

Needs only Python 3 (Windows: install from python.org and tick "Add to PATH"; Mac/Linux usually have it).

1. Unzip `bakery-app.zip`.
2. Open a terminal in the `bakery-app` folder and run:  `python3 run-demo.py`  (Windows: `python run-demo.py`)
3. In the **same browser** open two tabs:
   - Business: http://localhost:8123/index.html  — sign in with `owner@test.com` / `pass1234`
   - Customer: http://localhost:8123/order.html
4. Suggested walk-through (10 minutes):
   - Business → Settings: add shop name, WhatsApp number, a JazzCash number. Save.
   - Products: add 3 items with photos and one with stock tracking.
   - Customer tab: add items, checkout, place the order, tap a payment app, attach any photo as the slip, tap WhatsApp.
   - Business tab: the order appears instantly. Mark advance received, move through the stages, deliver.
   - Invoices, Raw material, Tools & assets, Expenses & loss, Customers, Reports: add a few records and check the numbers.
   - Try a bad order: in Settings set advance to 50, then check the warnings and sold-out behaviour.
5. Press Ctrl+C in the terminal to stop. Data lives only in that browser (clear site data to reset).

What the demo cannot show: real syncing between two different phones, real payment-app opening, phone alerts, WhatsApp sending, the Android APK. Those need Firebase, GitHub and a phone (see SETUP-GUIDE.md).
To test on a phone on the same Wi-Fi, run `python3 run-demo.py` and open `http://<computer-ip>:8123` only after changing `127.0.0.1` to `0.0.0.0` in run-demo.py. Note that phone and computer would then have separate data, because the demo stores data in each browser.
