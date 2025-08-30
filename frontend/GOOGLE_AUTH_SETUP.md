# Google Authentication Setup

To enable Google authentication, you need to set up Google OAuth credentials:

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API and Google OAuth2 API

## 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application"
4. Add authorized redirect URIs:
   - For development: `https://auth.expo.io/@your-username/anim-app`
   - For web: `http://localhost:19006/oauth/redirect`
   - For custom scheme: `animapp://oauth/redirect`

## 3. Configure the App

1. Update the `.env` file with your Google Client ID:
   ```
   EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-actual-client-id-here.apps.googleusercontent.com
   ```
2. The app is configured to use the scheme `animapp://` for redirects
3. Restart the Expo development server after updating the `.env` file

## 4. Backend Integration (Optional)

Currently, the app uses a mock JWT token. To integrate with your backend:

1. Update `handleGoogleSignIn` in `LoginScreen.tsx` to send the Google access token to your backend
2. Your backend should verify the Google token and return your own JWT token
3. Update the `uploadImage` function to use the real authentication token

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