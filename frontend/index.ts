import { registerRootComponent } from "expo";
import App from "./App";
import "./src/lib/sentry"; // side-effect init only when DSN present

let Root: any = App;
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { wrap } = require('sentry-expo');
    Root = wrap ? wrap(App) : App;
  } catch {
    Root = App;
  }
}
registerRootComponent(Root);
