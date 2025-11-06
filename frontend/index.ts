import { registerRootComponent } from "expo";
import App from "./App";
// Initialize Sentry (safe no-op if not installed yet)
import "./src/lib/sentry";

// Wrap the app with Sentry's error boundary if available
let wrap: ((C: any) => any) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  wrap = require("sentry-expo").wrap;
} catch (_) {
  wrap = undefined;
}

const Root = wrap ? wrap(App) : App;
registerRootComponent(Root);
