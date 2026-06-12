# RUDY → App Store (iOS native via Capacitor)

This doc covers the App Store track only. The web/PWA on GitHub Pages
keeps working unchanged — Capacitor just bundles the same web build
into a native iOS app for App Store distribution.

## What you'll need before starting

- **Mac with Xcode 15+** (App Store builds REQUIRE a Mac — there's no
  way around this. Xcode is free from the Mac App Store)
- **Apple Developer Program** active ($99/year — Pat is in
  Enrollment Pending; wait for the approval email)
- **App Store Connect** access (auto-included with Developer Program)
- **Node 18+** on the Mac

## One-time setup on the Mac

```bash
# 1. Clone the repo on your Mac
git clone https://github.com/chitipat-web/timetrack.git
cd timetrack

# 2. Install JS dependencies (Capacitor)
npm install

# 3. Generate the iOS project (creates ios/ folder via Xcode template)
npm run ios:add

# 4. Open in Xcode
npm run ios:open
```

In Xcode (one-time):
1. Select the **App** target → **Signing & Capabilities**
2. Set **Team** to your Apple Developer account
3. **Bundle Identifier** is already `com.chitipat.rudy` — change if needed
4. (Optional but recommended) **Capabilities**:
   - Push Notifications (only if you want native iOS push instead of
     web push; web push works on iOS 16.4+ already)
   - Background Modes → Remote notifications
5. Set the app **Display Name** to `RUDY`

## Every web release after that

```bash
# 1. Pull the latest web changes
git pull

# 2. Sync the web build into the iOS project
npm run ios:sync

# 3. Open Xcode, bump the version in the App target, then:
#    Product → Archive → Distribute App → App Store Connect
```

## What Capacitor does

- Copies the contents of `www/` (mirror of the web build at repo root)
  into the iOS app bundle
- WKWebView loads `index.html` from `capacitor://localhost`
- Firebase / Gemini / FCM calls work unchanged (they go out over HTTPS
  the same way they do in Safari)
- App icon comes from `ios/App/App/Assets.xcassets/AppIcon.appiconset/` —
  copy `icon-180.png` (1024×1024 will be made by Xcode; or supply a
  1024×1024 master) into there once

## App Store submission checklist

Apple Review will check these — handle them BEFORE submitting:

- [ ] **Privacy Policy URL** — required. Publish a short page at
      `chitipat-web.github.io/timetrack/privacy.html` and link it
      from App Store Connect
- [ ] **Privacy nutrition labels** in App Store Connect → declare what
      Firebase collects (email, work records)
- [ ] **Test account** — give the reviewer a dummy admin + employee
      login in the "Notes for the Reviewer" field
- [ ] **Screenshots** — 6.7" iPhone (1290×2796), 6.5" iPhone
      (1242×2688) at minimum
- [ ] **App description, keywords, support URL, marketing URL**
- [ ] **Encryption export compliance** — answer "Uses standard
      encryption (HTTPS)" → exempt
- [ ] **Guideline 4.2 risk** — RUDY has check-in/out, calendar,
      stats, AI helper → has native-app-tier functionality, should
      pass. If reviewer pushes back, point to those features

## What Capacitor does NOT solve for you

- **Live JS updates without App Store** — every web release also needs
  an Xcode archive + App Store submission. (Capacitor's "Live Updates"
  is a paid SaaS; self-hosted is possible but extra work.)
- **iOS-only native APIs** — if you ever want Touch ID / Face ID,
  Apple Wallet, etc., you'll add Capacitor plugins for them.
- **First Apple Review** — typically takes 24-48 hours. Bug fixes
  after that can use "Expedited Review" once or twice a year.

## Faster track if you only need internal distribution

If the audience is only the 3-person team, **TestFlight** skips public
review pain:

1. Archive in Xcode → upload to App Store Connect
2. In App Store Connect → TestFlight tab → add internal testers (up to
   100, by Apple ID email)
3. Testers install the **TestFlight** app, accept the invite, install
   RUDY from there
4. Build expires every 90 days — re-archive and re-upload to refresh

TestFlight builds need a brief Apple review (faster than App Store
review, usually a few hours) only for *external* testers; internal
testers (members of your Apple Developer team) skip it entirely.
