export interface UpdateRequiredInfo {
  code?: string;
  platform?: string | null;
  min_build?: number | null;
  update_url?: string | null;
}

type UpdateListener = (info: UpdateRequiredInfo) => void;

let updateListeners: UpdateListener[] = [];

export function onUpdateRequired(listener: UpdateListener): () => void {
  updateListeners.push(listener);
  return () => {
    updateListeners = updateListeners.filter((l) => l !== listener);
  };
}

export function emitUpdateRequired(info: UpdateRequiredInfo): void {
  const snapshot = [...updateListeners];
  for (const listener of snapshot) {
    try {
      listener(info);
    } catch {
      // Ignore handler errors to avoid breaking global flow
    }
  }
}

