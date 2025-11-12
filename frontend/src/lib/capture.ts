function optionalRequire(name: string): any | null {
  try {
    // eslint-disable-next-line no-new-func
    const req = (Function('return require')() as any);
    return req ? req(name) : null;
  } catch {
    return null;
  }
}

export function captureException(error: any, context?: Record<string, any>) {
  const Sentry: any = optionalRequire('sentry-expo');
  const sentry = (Sentry?.Native || Sentry);
  if (sentry?.captureException) {
    try {
      sentry.captureException(error, { extra: context || {} });
    } catch {}
  }
}
