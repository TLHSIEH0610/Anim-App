export type ServerUnreachablePayload = {
  message?: string | null;
};

type Listener = (payload?: ServerUnreachablePayload) => void;

let listeners: Listener[] = [];

export function onServerUnreachable(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function emitServerUnreachable(payload?: ServerUnreachablePayload): void {
  const snapshot = [...listeners];
  for (const listener of snapshot) {
    try {
      listener(payload);
    } catch {
      // Swallow handler errors to avoid breaking the flow
    }
  }
}
