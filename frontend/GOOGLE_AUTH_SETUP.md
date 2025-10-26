# Google Authentication Setup

To enable Google authentication, you need to set up Google OAuth credentials:

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API and Google OAuth2 API

## 2. Create OAuth 2.0 Credentials

You will need multiple credentials so that Google login works on Expo Go, EAS builds, and the web.

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID" for each platform:
   - **Expo Go / Web preview**: choose **Web application** and add `https://auth.expo.io/@your-username/anim-app` as an authorized redirect URI.
   - **iOS**: choose **iOS** and enter your bundle identifier (`com.arnie.animapp` in `app.json`).
   - **Android**: choose **Android** and enter your package name (`com.arnie.animapp`). Download and keep the generated `google-services.json` if you plan to use the native Google SDK later.
   - **Production Web (optional)**: add `http://localhost:19006` plus any deployed domain you will serve from.
3. For native/EAS builds, also add the custom scheme `animapp://oauthredirect` to the list of authorized redirect URIs inside each credential.

## 3. Configure the App

1. Update `frontend/.env` with every client ID you created:
   ```env
   EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID=your-expo-go-client-id.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
   ```
2. The app already declares the `animapp` scheme in `app.json`. This lets EAS builds perform the OAuth redirect without relying on the Expo proxy.
3. Restart the Expo dev server (`npx expo start -c`) so the new environment variables are picked up.

## 4. Backend Integration (Optional)

Currently, the app uses a mock JWT token. To integrate with your backend:

1. Update `handleGoogleSignIn` in `LoginScreen.tsx` to send the Google access token to your backend
2. Your backend should verify the Google token and return your own JWT token
3. Update the `uploadImage` function to use the real authentication token

## EAS Build Tips

- When running through `expo run:ios`/`expo run:android` or EAS Build, the app bypasses the Expo proxy. Make sure **both** iOS and Android client IDs are populated; otherwise the OAuth screen will fail to open.
- Keep the `animapp://` redirect URI in every credential. Google must be able to redirect back to your native scheme after the user authorises.
- If you rotate bundle identifiers, regenerate the native OAuth credentials and update the env vars accordingly.

## Example Backend Integration

```javascript
const handleGoogleSignIn = async (accessToken) => {
  // Send to your backend
  const response = await fetch('YOUR_BACKEND_URL/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ google_token: accessToken })
  });
  
  const { token, user } = await response.json();
  await login(token, user);
};
```
