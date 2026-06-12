# RUDY → App Store (no-Mac workflow via Codemagic)

This doc covers the App Store track for an owner who has only an
iPhone — Apple builds need macOS somewhere in the chain, but Codemagic
runs that Mac on their cloud so the owner can ship from Safari on iOS.

The web/PWA on GitHub Pages keeps working unchanged. Capacitor
packages the same web build into a native iOS app; Codemagic builds
it and uploads to TestFlight / App Store Connect.

## One-time setup (≈ 2–3 hours)

### 1. Apple Developer Program

You've already enrolled. Wait for the approval email (24–48h). Once
in, sign in to https://appstoreconnect.apple.com on Safari.

### 2. Register the app in App Store Connect

- App Store Connect → **My Apps** → **+** → **New App**
- Platform: iOS
- Name: **RUDY**
- Primary Language: Thai
- Bundle ID: **com.chitipat.rudy** (must match `capacitor.config.json`)
- SKU: `rudy-001` (any unique string)
- User Access: Full Access

### 3. Create an App Store Connect API key

This is what lets Codemagic upload builds for you.

- App Store Connect → **Users and Access** → **Integrations** tab → 
  **App Store Connect API**
- **Generate API Key**
- Name: `Codemagic CI`
- Access: **App Manager**
- Download the **.p8 file** (you only get one chance — save it)
- Copy the **Issuer ID** (top of the page) and **Key ID** (the row you
  just created)

### 4. Set up Codemagic

- Open https://codemagic.io on Safari → **Sign up with GitHub**
- Authorize Codemagic to read your `chitipat-web/timetrack` repo
- After connecting: **Teams** → your team → **Integrations** →
  **Developer Portal** → **App Store Connect**
- Paste **Issuer ID**, **Key ID**, upload the **.p8 file** from step 3
- Codemagic will from now on auto-create signing certificates and
  provisioning profiles for you. No Xcode required.

### 5. Privacy policy URL

App Store Connect requires one. We've published a stub at:

> **https://chitipat-web.github.io/timetrack/privacy.html**

Paste that URL into App Store Connect → App Information → Privacy
Policy URL. Edit `privacy.html` in the repo whenever it needs updates.

### 6. App icon (1024×1024)

App Store needs a 1024×1024 master. The PWA's `icon-512.png` will get
upscaled by Capacitor at build time but quality won't be ideal. To
upgrade: drop a `icon-1024.png` into the repo root and we'll wire
Capacitor to use it. For first submission, the upscaled 512 is fine.

## Shipping a build

Everything else is now triggered from your iPhone:

```bash
# Tag the commit you want to ship (from GitHub mobile web or any
# git client; even a `gh` command via Codespaces in Safari works)
git tag ios-v1.0
git push origin ios-v1.0
```

That pushes a tag matching the pattern `ios-v*`, which is the only
thing that fires the Codemagic build (regular web commits don't burn
macOS minutes).

Codemagic will:

1. Spin up a Mac mini M2 runner
2. `npm ci` → install Capacitor
3. `npm run build:web` → mirror web assets into `www/`
4. `npx cap add ios` (first build only) and `npx cap sync ios`
5. CocoaPods install
6. Fetch / create signing certificates from App Store Connect
7. Build the IPA
8. **Upload to App Store Connect → TestFlight**

You'll get an email when it lands in TestFlight (usually 15–20 min
after the tag is pushed).

## Installing the TestFlight build on iPhone

- Install Apple's **TestFlight** app from the App Store
- App Store Connect (web) → TestFlight tab → **Internal Testing** →
  add yourself + the 2 teammates as **App Manager** users
- They receive an email, click "View in TestFlight", install
- Internal builds skip Apple's review, available immediately
- TestFlight builds expire after 90 days → just push a new `ios-v*` tag

## Going to the public App Store

When the TestFlight build is happy:

1. App Store Connect → your app → **App Store** tab → **Prepare for
   Submission**
2. Fill in:
   - Description, keywords, support URL
   - Screenshots (6.7" iPhone 1290×2796 + 6.5" 1242×2688). Use the
     real iPhone — Settings → Accessibility → AssistiveTouch can
     capture clean screenshots without your hand in frame.
   - Privacy nutrition labels: declare Email + Identifiers (FCM
     token) + User Content (work records). All "linked to user",
     none "used for tracking".
3. Select the TestFlight build to submit
4. **Notes for the Reviewer** field — give Apple a dummy login:
   ```
   Test admin:    review-admin@example.com / Review#2026
   Test employee: review-emp@example.com   / Review#2026
   ```
   Create those accounts in Firebase Auth ahead of time.
5. Submit → review takes 24–48h typically

## Risk: Guideline 4.2 (web wrapper rejection)

Apple sometimes rejects apps that are "just a website wrapped in a
WebView". RUDY has check-in/out, calendar, stats, AI helper, history,
team management → that's well above the 4.2 bar. If they push back,
reply in App Review with: "RUDY provides native time-tracking
functionality including check-in/out workflows, calendar
visualization, statistics, and team management — not just web
content. See screen X, Y, Z."

## What this setup does NOT cover (deferred)

- **Native iOS push notifications**. Current web push works on iOS
  16.4+ via Add-to-Home-Screen PWA but may not work the same way
  inside a Capacitor app. If push breaks in the App Store build,
  add `@capacitor/push-notifications` plugin + APNs key configured
  in App Store Connect → Keys.
- **Sign in with Apple**. Not required because RUDY uses only
  email/password (Guideline 4.8 triggers on Google/Facebook login
  presence, not on every iOS app).
- **Live JavaScript updates without re-submission**. Capacitor
  Voltage or Ionic Appflow can do this for $; for now every web
  release that needs to reach App Store users requires a new
  `ios-v*` tag and a new App Store build.
