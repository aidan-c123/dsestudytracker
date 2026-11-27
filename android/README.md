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

## Home-screen widgets

Four widgets, added from the launcher's widget picker.

| Widget | Shows | Tap does |
|---|---|---|
| Countdown | Days to the first written paper, results day | Opens the Desk |
| Quick log | Open-task and red-ink counts | Log a paper, add a red-ink entry, create a task |
| Focus | Today's minutes against the goal, or time left in a running block | Starts a 25-minute block |
| Red-ink log | The three most recent mistakes | Opens the log, or adds an entry |

Each is an `AppWidgetProvider` with a layout in `res/layout/` and metadata in
`res/xml/`. There is no Glance, no Jetpack: a `RemoteViews` layout and a plain
`AppWidgetProvider`, to match the rest of this folder's no-dependencies rule.

### How the data reaches them

A widget runs in the launcher's process, so it cannot call the API and must
never be given the connection string. The flow is one way:

```
app.js render → public/widgets.js snapshot()
             → StarShooterAndroid.widgetData(json)      (MainActivity bridge)
             → WidgetData.save()                        (private prefs)
             → WidgetUi.refreshAll()                    (redraw)
```

`WidgetData` is the only thing that reads the snapshot. Nothing in a widget
touches the network, and nothing needs a permission.

**A widget is as fresh as the last time the app was opened.** Each one prints
`Updated 14:05` from the snapshot's `savedAt`, so a stale figure reads as stale.
The countdown is the exception: it is sent the exam instant as epoch millis and
keeps counting on its own, since a number of days does not change second by
second.

The snapshot carries counts and dates only — no levels, percentages or email,
because a widget is readable on a locked phone. Red-ink topics are the one
deliberate exception.

### Taps

A tap opens the app with `#/view?act=action`, for example
`#/focus?act=focus&min=25`. `runWidgetAction()` in `public/actions.js` maps the
name onto the same handler the on-screen button uses, so a widget can never
diverge from the app. If the app is already running, `onNewIntent` dispatches a
`starshooter:widget-action` event instead of reloading the page.

Adding a widget action means three edits, and the test fails if you miss one:
the name in `runWidgetAction()`, the deep link in the provider, and the list in
`test/widgets.test.mjs`.

## Version bumps

Change `android:versionCode` (must increase) and `android:versionName` in
`AndroidManifest.xml`, **and** the `--version-code` / `--version-name` flags in
`build.sh` — `aapt2 link` takes them from the command line, so editing only the
manifest has no effect on the built APK.

Current: versionCode 3, versionName 1.2.
