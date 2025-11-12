import { registerRootComponent } from "expo";
import App from "./App";
import "./src/lib/sentry"; // side-effect init only when DSN present

function optionalRequire(name: string): any | null {
  try {
    // eslint-disable-next-line no-new-func
    const req = (Function('return require')() as any);
    return req ? req(name) : null;
  } catch {
    return null;
  }
}

let Root: any = App;
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  const sentryExpo = optionalRequire('sentry-expo');
  const wrap = sentryExpo?.wrap;
  if (typeof wrap === 'function') {
    try {
      Root = wrap(App);
    } catch {
      Root = App;
    }
  }
}
registerRootComponent(Root);
