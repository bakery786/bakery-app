# Setup guide: Firebase, then GitHub

Menu names in Firebase and GitHub change slightly over time. If a button is worded a little differently, look for the closest match.
Do Part A first (you need its config before GitHub builds the app). Total time: about 30 minutes. Everything here is free.

## Part A: Firebase (the live database)

**A1. Create the project**
1. Open https://console.firebase.google.com and sign in with a Google account.
2. Click **Create a project** (or **Add project**). Name it, for example `my-bakery`. Continue.
3. Turn **Google Analytics off**. Click **Create project**, wait, then **Continue**.

**A2. Create the database**
1. Left menu: **Build → Firestore Database → Create database**.
2. Location: choose the closest (for Pakistan, `asia-south1 (Mumbai)` if listed). You cannot change it later.
3. Choose **Start in production mode**, then **Create**.

**A3. Turn on sign-in and create your login**
1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → switch on the first toggle → **Save**.
3. **Users** tab → **Add user** → type your email and a strong password → **Add user**. This is the login for the business app.
4. **Settings** tab → **User actions** → untick **Enable create (sign-up)** → **Save**. This stops strangers registering.
5. Same Settings page → **Authorized domains** → **Add domain** → type `YOURNAME.github.io` (your GitHub username, which you choose in Part B).

**A4. Get your app config**
1. Click the gear icon beside **Project Overview → Project settings**.
2. **General** tab → scroll to **Your apps** → click the web icon **`</>`**.
3. App nickname: `bakery` → leave Hosting unticked → **Register app**.
4. You will see a block called `firebaseConfig`. Copy the values of `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
5. Open `public/firebase-config.js` from the zip and replace each `PASTE...` value with yours. Keep the quotes. (The apiKey in a web app is not a secret; your rules protect the data.)

**A5. Publish the security rules**
1. Open `firestore.rules` from the zip. Replace `CHANGE-ME@example.com` with the exact email from A3.
2. Firebase: **Firestore Database → Rules** tab. Delete everything, paste the full file, click **Publish**.

## Part B: GitHub (builds the APK and hosts the customer link)

**B1. Account and repository**
1. Create an account at https://github.com (remember your username).
2. Click **+ → New repository**. Name: `bakery-app`. Choose **Public** (free Pages hosting needs this). Do not tick any "Add" boxes. **Create repository**.

**B2. Upload the files**
Easiest on a computer:
1. Unzip `bakery-app.zip`. Open the `bakery-app` folder.
2. On the new repository page click **uploading an existing file**.
3. Select everything inside the folder (including the hidden `.github` folder) and drag it in. Wait for it to finish, then click **Commit changes**.

If you only have a phone (GitHub's phone upload cannot send folders): use **Add file → Create new file**, type the full name such as `public/app.js` (typing `/` makes the folder), paste the file's text, and commit. Repeat for each file. Do `.github/workflows/build-apk.yml` and `.github/workflows/pages.yml` the same way.

Check afterwards that the repo shows: `.github`, `public`, `README.md`, `package.json`, `capacitor.config.json`, `firebase.json`, `firestore.rules`.

**B3. Switch on hosting for the customer link**
1. Repository → **Settings → Pages**.
2. Under **Build and deployment → Source** choose **GitHub Actions**.

**B4. Run the builds**
1. Open the **Actions** tab. If asked, click **I understand my workflows, enable them**.
2. Click **Deploy order page** → **Run workflow** → **Run workflow**. After about a minute it turns green.
3. Click **Build Android APK** → **Run workflow**. It takes 5 to 10 minutes. (Both also run automatically whenever you change a file.)
4. Open the finished APK run, scroll to **Artifacts**, tap **bakery-manager-apk** to download. Unzip it to get `app-debug.apk`.

**B5. Install the business app**
1. Open `app-debug.apk` on the phone. Allow **install from this source** when asked, then install. (Play Protect may warn because it is your own unsigned app; choose install anyway.)
2. Sign in with the email and password from A3.

**B6. Your customer link**
It is `https://YOURNAME.github.io/bakery-app/order.html` (also shown in Settings → Pages).

## Part C: First-time app setup

1. In the app open **Settings**: bakery name, WhatsApp number for orders, advance %, your JazzCash / Easypaisa / bank / SadaPay account numbers. Paste the customer link into **Order page web address**. **Save settings**.
2. Open **Products** → **+ Product**, add each item with a price and a photo.
3. Place a test order from the customer link on another phone. The order appears in **Orders** with a sound. Mark it **Advance received**, then move it to Delivered.
4. Share the link from **Settings → Share order link**.

## Part D: Phone alerts when the app is closed

1. Install the free **ntfy** app from Google Play on the phone that receives orders.
2. In ntfy tap **+**, keep the default server, and type the topic shown in the app's **Settings → Phone alerts**. Subscribe.
3. In the Bakery app tap **Send test alert**. A notification should arrive.
4. In Android settings, set ntfy's battery use to **Unrestricted** so alerts arrive while the phone is idle.

The alert text contains only the order number and total. Anyone who knows the topic name could read or send alerts, so do not share it.

## Updating the app later

Edit a file on GitHub (open it, pencil icon, change, **Commit**). The website updates by itself in about a minute. For a new APK, run **Build Android APK** again and reinstall.

## Troubleshooting

- **"Access denied" toast or empty lists after sign-in**: the email in `firestore.rules` does not match your login, or the rules were not published (A5).
- **Customer page shows "Setup needed"**: `firebase-config.js` still has the PASTE values.
- **Customer sees no menu**: you have not added products, or the rules are not published.
- **Order number looks like BK-123456**: the counter was not created. Sign in to the business app once, then retry.
- **APK build fails**: open the failed run, read the red step, and send me the message.
- **A payment app does not open**: in Settings fix its Android package id. The number is still copied.

## Part E: Hardening (5 minutes, recommended before real customers)

1. **Protect your Google account** with 2-Step Verification. Whoever controls it controls the Firebase project.
2. **Restrict the API key.** Google Cloud console → APIs & Services → Credentials → open the "Browser key" of your project → Application restrictions: **Websites** → add `https://YOURNAME.github.io/*` → Save. (The key is public by design; this stops other websites using it.)
3. **Check the rules are live:** Firestore → Rules shows your email, not `CHANGE-ME@example.com`.
4. **Sign-up disabled:** Authentication → Settings → User actions → "Enable create (sign-up)" is off.
5. **Budget alert:** Google Cloud console → Billing → Budgets → create one with a low limit so abuse can never surprise you. (Firestore's free quota is plenty for a home bakery.)
6. **Optional, stops fake-order floods:** Firebase → Build → App Check → register the web app with reCAPTCHA. This needs an extra code change; ask me and I will add it.
7. **Phone:** keep a screen lock on the phone that has the business app. Signing out in the app also wipes its offline copy of your data.

## First real test (do this before sharing the link)

1. Place a test order from the customer link on another phone.
2. Pay nothing, but attach any photo as the slip. It must say **Slip received**. If it fails, the security rules rejected it: tell me the exact message.
3. On the business phone check the order, the slip image and the phone alert, then mark it Delivered and look at Reports.
