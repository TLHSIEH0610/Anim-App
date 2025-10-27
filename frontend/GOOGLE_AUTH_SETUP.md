# Google Authentication Setup

The mobile app now uses [`@react-native-google-signin/google-signin`](https://react-native-google-signin.github.io/docs/install), so you authenticate through the native Google SDKs instead of the Expo browser flow. Follow the steps below to provision the correct credentials and wire them into the Android/iOS projects.

## 1. Create OAuth 2.0 credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select your project → **APIs & Services → Credentials**.
2. Create (or reuse) the following OAuth clients:
   - **Web client** – required. Use it for server-side verification and when calling `GoogleSignin.getTokens()`. Add any deployed domains that will talk to Google on your behalf (no redirect URIs are needed for mobile).
   - **Android client** – choose *Android*, set the package name to `com.arnie.animapp`, and provide the SHA-1 fingerprint of the keystore you build with (current debug keystore: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`). If you sign releases with another keystore, register that SHA-1 as well.
   - **iOS client (optional)** – choose *iOS*, set the bundle ID to `com.arnie.animapp`, and download the `GoogleService-Info.plist` if you plan to ship on iOS later.

## 2. Update environment variables

Populate `frontend/.env` with the client IDs you just created. The Expo-specific client ID is no longer used, but the existing env naming works with Metro/dev builds.

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com   # optional
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
```

Restart Metro/Gradle after editing the file so the new IDs are compiled into the app.

## 3. Backend configuration

1. Add the same client IDs to your backend environment (either `backend/.env` or `infra/.env` when using Docker):
   ```env
   GOOGLE_OAUTH_CLIENT_IDS=your-android-client-id.apps.googleusercontent.com,your-web-client-id.apps.googleusercontent.com
   ```
   Multiple IDs can be comma-separated.
2. The `/auth/google` endpoint verifies each ID token with Google’s `tokeninfo` API, ensures the audience matches one of the configured IDs, and auto-creates the user (random password) if they don’t already exist.
3. The response payload includes a JWT and the user profile (`id`, `email`, `name`, `picture`). The frontend stores those values via `AuthContext`.

## 4. Android configuration

1. The Gradle project already includes `implementation("com.google.android.gms:play-services-auth:21.2.0")`. When you run `npx react-native run-android`, the Google Sign-In native module is linked automatically.
2. Ensure the OAuth **Android** client in Google Cloud lists **every** SHA-1 you plan to sign with (debug + release). Mismatched SHA-1 fingerprints are the most common “App Not Authorized” error.
3. No additional manifest entries are needed—the library wires up the required activities via autolinking.

## 5. iOS configuration (when you add the iOS project)

1. Place the downloaded `GoogleService-Info.plist` inside `ios/AnimApp/`.
2. In Xcode, open `Info.plist` and add a `URL Type` whose `URL Schemes` value is the `REVERSED_CLIENT_ID` from the plist. This lets the Google SDK redirect back into your app after authentication.
3. Run `cd ios && pod install` so the `RNGoogleSignin` pod is integrated.

## Troubleshooting

- `16: SignInFailedError` usually means the SHA-1 or client ID on Google Cloud does not match the build you are running.
- `12501: user cancelled` bubbles through as `statusCodes.SIGN_IN_CANCELLED`.
- If Google Play Services is missing or outdated, the SDK throws `statusCodes.PLAY_SERVICES_NOT_AVAILABLE`. Prompt the user to update Play Services or install them on emulators.

With these steps complete, tapping “Continue with Google” inside the app will trigger the native Google Sign-In UI and return control directly to your React Native screens—no browser tabs or Expo proxy required.
