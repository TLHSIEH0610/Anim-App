type LogoutListener = () => void;

let logoutListeners: LogoutListener[] = [];

export function onLogoutRequested(listener: LogoutListener): () => void {
  logoutListeners.push(listener);
  return () => {
    logoutListeners = logoutListeners.filter((l) => l !== listener);
  };
}

export function emitLogoutRequested(): void {
  // Snapshot listeners in case handlers mutate the list
  const snapshot = [...logoutListeners];
  for (const listener of snapshot) {
    try {
      listener();
    } catch {
      // Swallow handler errors to avoid breaking global flow
    }
  }
}

