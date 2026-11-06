import { AppUser, Table, MenuItem, Transaction, Expense } from '../types';

export interface SyncedWorkspace {
  user: AppUser;
  tables: Table[];
  menu: MenuItem[];
  transactions: Transaction[];
  expenses: Expense[];
  updatedAt: number;
}

// Unique per-tab/per-device identifier to prevent echo loops
const getOrCreateDeviceId = (): string => {
  const key = 'daporku_device_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
};

export const DEVICE_ID = getOrCreateDeviceId();

export function reviveWorkspaceDates(raw: any): SyncedWorkspace {
  return {
    user: raw.user,
    tables: Array.isArray(raw.tables)
      ? raw.tables.map((t: any) => ({
          ...t,
          orderStartTime: t.orderStartTime ? new Date(t.orderStartTime) : undefined,
        }))
      : [],
    menu: Array.isArray(raw.menu) ? raw.menu : [],
    transactions: Array.isArray(raw.transactions)
      ? raw.transactions.map((tx: any) => ({
          ...tx,
          timestamp: tx.timestamp ? new Date(tx.timestamp) : new Date(),
        }))
      : [],
    expenses: Array.isArray(raw.expenses)
      ? raw.expenses.map((exp: any) => ({
          ...exp,
          timestamp: exp.timestamp ? new Date(exp.timestamp) : new Date(),
        }))
      : [],
    updatedAt: Number(raw.updatedAt || Date.now()),
  };
}

export async function fetchServerUsers(): Promise<AppUser[]> {
  try {
    const res = await fetch('/api/sync/users');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.users) ? data.users : [];
  } catch (err) {
    console.error('Failed to fetch server users:', err);
    return [];
  }
}

export async function registerServerUser(
  user: AppUser,
  initialWorkspace?: {
    tables?: Table[];
    menu?: MenuItem[];
    transactions?: Transaction[];
    expenses?: Expense[];
  },
  allowUpsert = false
): Promise<SyncedWorkspace> {
  const res = await fetch('/api/sync/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, initialWorkspace, allowUpsert }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Registration failed on server.');
  }
  return reviveWorkspaceDates(data.workspace);
}

export async function loginServerUser(
  identifier: string,
  passwordHash: string
): Promise<SyncedWorkspace> {
  const res = await fetch('/api/sync/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, passwordHash }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Login failed.');
  }
  return reviveWorkspaceDates(data.workspace);
}

export async function fetchServerWorkspace(
  userId: string
): Promise<{ workspace: SyncedWorkspace; connectedDevices: number } | null> {
  try {
    const res = await fetch(`/api/sync/workspace/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      workspace: reviveWorkspaceDates(data.workspace),
      connectedDevices: Number(data.connectedDevices || 1),
    };
  } catch (err) {
    console.error('Error fetching workspace from server:', err);
    return null;
  }
}

export async function pushServerWorkspaceUpdate(
  userId: string,
  payload: {
    user?: AppUser;
    tables?: Table[];
    menu?: MenuItem[];
    transactions?: Transaction[];
    expenses?: Expense[];
  }
): Promise<void> {
  try {
    await fetch(`/api/sync/workspace/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        ...payload,
      }),
    });
  } catch (err) {
    console.error('Failed to push workspace update to server:', err);
  }
}

export function subscribeToMultiDeviceSync(
  userId: string,
  callbacks: {
    onInit: (workspace: SyncedWorkspace | null, connectedDevices: number) => void;
    onRemoteUpdate: (workspace: SyncedWorkspace, connectedDevices: number) => void;
    onPresenceUpdate: (connectedDevices: number) => void;
    onConnectionChange: (online: boolean) => void;
  }
): () => void {
  const url = `/api/sync/events/${encodeURIComponent(userId)}?deviceId=${encodeURIComponent(
    DEVICE_ID
  )}`;
  const es = new EventSource(url);

  es.onopen = () => {
    callbacks.onConnectionChange(true);
  };

  es.onerror = () => {
    callbacks.onConnectionChange(false);
  };

  es.addEventListener('init', (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data);
      const ws = parsed.workspace ? reviveWorkspaceDates(parsed.workspace) : null;
      callbacks.onConnectionChange(true);
      callbacks.onInit(ws, Number(parsed.connectedDevices || 1));
    } catch (e) {
      console.error('Error parsing SSE init event:', e);
    }
  });

  es.addEventListener('workspace:updated', (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data);
      callbacks.onPresenceUpdate(Number(parsed.connectedDevices || 1));
      // Guard against echoing our own device's mutation
      if (parsed.sourceDeviceId === DEVICE_ID) {
        return;
      }
      if (parsed.workspace) {
        callbacks.onRemoteUpdate(
          reviveWorkspaceDates(parsed.workspace),
          Number(parsed.connectedDevices || 1)
        );
      }
    } catch (e) {
      console.error('Error parsing SSE workspace:updated event:', e);
    }
  });

  es.addEventListener('presence:updated', (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data);
      callbacks.onPresenceUpdate(Number(parsed.connectedDevices || 1));
    } catch (e) {
      console.error('Error parsing SSE presence:updated event:', e);
    }
  });

  return () => {
    es.close();
  };
}
