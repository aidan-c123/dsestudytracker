# Android app

A thin WebView shell around the deployed site. It contains no copy of the app:
the phone loads the same files Vercel serves, so redeploying updates the app
without a new APK.

The MongoDB connection string stays in Vercel. Nothing in this folder holds a
key, so building and installing needs no setup step and no secret.

## Build

Needs a JDK 17 and the Android SDK (build-tools 34, platform 34). No Gradle.

```bash
ANDROID_SDK=/path/to/sdk ./build.sh      # writes StarShooter.apk
```

The first run creates `keystore.jks`. Keep it: Android only installs an update
over an existing app if it is signed with the same key. Losing it means users
must uninstall before installing a new build.

## Pointing it somewhere else

`res/values/strings.xml` holds `app_url`. Change the one line, rebuild, done.
The host in that URL is also the only host kept inside the app — every other
link opens in the browser.

## Installing on a phone

Copy the APK over (USB, Google Drive, chat) and tap it. Android will ask to
allow installs from that source the first time. It is signed, so no developer
mode is needed.

## What the shell adds

- Back walks through the app's screens before leaving.
- The session cookie persists across cold starts, so the password is asked once
  per 30 days.
- The recovery code and the JSON export are written to Downloads. A WebView
  cannot follow a `data:`/`blob:` download, so without this those two buttons
  would do nothing.
- Status and navigation bars follow the app's light/dark theme.
- A launch with no connection shows the app's own page instead of the
  WebView's "webpage not available" wall.
- The "Install on your phone" card is hidden, since there is nothing to add.

## Version bumps

Change `android:versionCode` (must increase) and `android:versionName` in
`AndroidManifest.xml` before shipping an update.
