import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerAppUser {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
  address: string;
  isCloudSynced?: boolean;
  createdAt?: string;
}

interface WorkspaceRecord {
  user: ServerAppUser;
  tables: any[];
  menu: any[];
  transactions: any[];
  expenses: any[];
  updatedAt: number;
}

interface StoreData {
  workspaces: Record<string, WorkspaceRecord>;
}

const DEFAULT_TABLES = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    number: (i + 1).toString().padStart(2, '0'),
    status: 'Available',
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: 13 + i,
    number: `TAPAU ${(i + 1).toString().padStart(2, '0')}`,
    status: 'Available',
  })),
];

const DEFAULT_MENU = [
  { id: '1', name: 'Nasi Goreng Special', price: 12.5, category: 'Food', description: 'Fragrant fried rice with shrimp and sunny side up egg.' },
  { id: '2', name: 'Beef Rendang', price: 15.0, category: 'Food', description: 'Slow-cooked beef in rich coconut milk and spices.' },
  { id: '3', name: 'Iced Teh Tarik', price: 3.5, category: 'Drink', description: 'Frothy pulled tea with condensed milk.' },
  { id: '4', name: 'Es Campur', price: 5.5, category: 'Dessert', description: 'Mixed shaved ice with tropical fruits and jellies.' },
];

function ensureDefaultTablesServer(tables: any[]): any[] {
  const map = new Map<number, any>();
  if (Array.isArray(tables)) {
    tables.forEach((t) => {
      if (t && typeof t.id === 'number') {
        map.set(t.id, t);
      }
    });
  }
  DEFAULT_TABLES.forEach((def) => {
    if (!map.has(def.id)) {
      map.set(def.id, { ...def });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_FILE = path.resolve(DATA_DIR, 'pos-store.json');

function loadStoreFromDisk(): StoreData {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.workspaces === 'object') {
        // Ensure all workspaces have TAPAU 01-05 tables
        for (const uid of Object.keys(parsed.workspaces)) {
          parsed.workspaces[uid].tables = ensureDefaultTablesServer(
            parsed.workspaces[uid].tables
          );
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load pos-store.json:', err);
  }
  return { workspaces: {} };
}

function saveStoreToDisk(store: StoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save pos-store.json:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '5mb' }));

  // Authoritative server-side multi-device state
  const store: StoreData = loadStoreFromDisk();

  // Active SSE connections per userId
  const sseClients = new Map<
    string,
    Set<{ clientId: string; deviceId: string; res: express.Response }>
  >();

  const getConnectedDeviceCount = (userId: string): number => {
    const set = sseClients.get(userId);
    if (!set) return 1;
    const uniqueDevices = new Set(Array.from(set).map((c) => c.deviceId));
    return Math.max(1, uniqueDevices.size);
  };

  const broadcastToUserDevices = (
    userId: string,
    eventType: string,
    payload: Record<string, any>
  ) => {
    const clients = sseClients.get(userId);
    if (!clients) return;
    const message = `event: ${eventType}\ndata: ${JSON.stringify({
      ...payload,
      connectedDevices: getConnectedDeviceCount(userId),
      timestamp: Date.now(),
    })}\n\n`;
    for (const client of clients) {
      try {
        client.res.write(message);
      } catch (_e) {
        clients.delete(client);
      }
    }
  };

  // Multi-Device Sync API: List all registered users
  app.get('/api/sync/users', (_req, res) => {
    const users = Object.values(store.workspaces).map((w) => w.user);
    res.json({ users });
  });

  // Multi-Device Sync API: Register or upsert a user and their initial workspace
  app.post('/api/sync/register', (req, res) => {
    const { user, initialWorkspace } = req.body;
    if (!user || !user.id || !user.name || !user.phone || !user.passwordHash) {
      return res.status(400).json({ error: 'Invalid user registration payload.' });
    }

    const cleanPhone = String(user.phone).replace(/[^0-9]/g, '');
    const duplicate = Object.values(store.workspaces).find(
      (w) =>
        w.user.id !== user.id &&
        ((cleanPhone.length >= 3 && w.user.phone.replace(/[^0-9]/g, '') === cleanPhone) ||
          w.user.name.trim().toLowerCase() === String(user.name).trim().toLowerCase())
    );

    if (duplicate && !req.body.allowUpsert) {
      return res.status(409).json({
        error: 'An account with this phone number or name is already registered. Please sign in.',
      });
    }

    const targetId = duplicate ? duplicate.user.id : user.id;
    const existing = store.workspaces[targetId];

    const record: WorkspaceRecord = {
      user: {
        id: targetId,
        name: String(user.name).slice(0, 100),
        phone: String(user.phone).slice(0, 30),
        passwordHash: String(user.passwordHash).slice(0, 256),
        address: String(user.address || '123 Culinary Ave, Foodie City').slice(0, 200),
        isCloudSynced: Boolean(user.isCloudSynced),
        createdAt: existing?.user?.createdAt || user.createdAt || new Date().toISOString(),
      },
      tables: ensureDefaultTablesServer(
        existing?.tables?.length ? existing.tables : initialWorkspace?.tables || DEFAULT_TABLES
      ),
      menu: existing?.menu?.length ? existing.menu : initialWorkspace?.menu || DEFAULT_MENU,
      transactions: existing?.transactions?.length
        ? existing.transactions
        : initialWorkspace?.transactions || [],
      expenses: existing?.expenses?.length
        ? existing.expenses
        : initialWorkspace?.expenses || [],
      updatedAt: Date.now(),
    };

    store.workspaces[targetId] = record;
    saveStoreToDisk(store);

    res.json({ workspace: record });
  });

  // Multi-Device Sync API: Authenticate user from any device
  app.post('/api/sync/login', (req, res) => {
    const { identifier, passwordHash } = req.body;
    if (!identifier || !passwordHash) {
      return res.status(400).json({ error: 'Identifier and password are required.' });
    }

    const trimmedId = String(identifier).trim().toLowerCase();
    const cleanInputPhone = String(identifier).replace(/[^0-9]/g, '');

    const matchedWorkspace = Object.values(store.workspaces).find((w) => {
      const u = w.user;
      const uPhoneClean = u.phone.replace(/[^0-9]/g, '');
      const phoneMatch =
        u.phone.trim().toLowerCase() === trimmedId ||
        (cleanInputPhone.length >= 3 && uPhoneClean === cleanInputPhone);
      const nameMatch = u.name.trim().toLowerCase() === trimmedId;
      return phoneMatch || nameMatch;
    });

    if (!matchedWorkspace) {
      return res.status(404).json({
        error: 'No registered user found with that phone number or name. Please register first.',
      });
    }

    if (matchedWorkspace.user.passwordHash !== passwordHash) {
      return res.status(401).json({
        error: 'Incorrect password. Please try again.',
      });
    }

    matchedWorkspace.tables = ensureDefaultTablesServer(matchedWorkspace.tables);
    res.json({ workspace: matchedWorkspace });
  });

  // Multi-Device Sync API: Get authoritative workspace state for a user
  app.get('/api/sync/workspace/:userId', (req, res) => {
    const { userId } = req.params;
    const workspace = store.workspaces[userId];
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }
    workspace.tables = ensureDefaultTablesServer(workspace.tables);
    res.json({
      workspace,
      connectedDevices: getConnectedDeviceCount(userId),
    });
  });

  // Multi-Device Sync API: Update workspace state & broadcast to all connected devices
  app.post('/api/sync/workspace/:userId', (req, res) => {
    const { userId } = req.params;
    const { deviceId, user, tables, menu, transactions, expenses } = req.body;

    let workspace = store.workspaces[userId];
    if (!workspace) {
      if (!user) {
        return res.status(404).json({ error: 'Workspace not found.' });
      }
      workspace = {
        user,
        tables: ensureDefaultTablesServer(tables || DEFAULT_TABLES),
        menu: menu || DEFAULT_MENU,
        transactions: transactions || [],
        expenses: expenses || [],
        updatedAt: Date.now(),
      };
    } else {
      if (user) {
        workspace.user = { ...workspace.user, ...user };
      }
      if (Array.isArray(tables)) {
        workspace.tables = ensureDefaultTablesServer(tables);
      }
      if (Array.isArray(menu)) {
        workspace.menu = menu;
      }
      if (Array.isArray(transactions)) {
        workspace.transactions = transactions;
      }
      if (Array.isArray(expenses)) {
        workspace.expenses = expenses;
      }
      workspace.updatedAt = Date.now();
    }

    store.workspaces[userId] = workspace;
    saveStoreToDisk(store);

    broadcastToUserDevices(userId, 'workspace:updated', {
      sourceDeviceId: deviceId || 'unknown',
      workspace,
    });

    res.json({
      ok: true,
      updatedAt: workspace.updatedAt,
      connectedDevices: getConnectedDeviceCount(userId),
    });
  });

  // Multi-Device Sync API: Real-Time SSE stream per userId
  app.get('/api/sync/events/:userId', (req, res) => {
    const { userId } = req.params;
    const deviceId = String(req.query.deviceId || `dev_${Date.now()}`);
    const clientId = `${deviceId}_${Math.random().toString(36).slice(2, 8)}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (!sseClients.has(userId)) {
      sseClients.set(userId, new Set());
    }
    const userClients = sseClients.get(userId)!;
    const clientEntry = { clientId, deviceId, res };
    userClients.add(clientEntry);

    const workspace = store.workspaces[userId];
    if (workspace) {
      workspace.tables = ensureDefaultTablesServer(workspace.tables);
    }

    // Send initial authoritative state to connecting device
    res.write(
      `event: init\ndata: ${JSON.stringify({
        workspace: workspace || null,
        connectedDevices: getConnectedDeviceCount(userId),
        timestamp: Date.now(),
      })}\n\n`
    );

    // Notify other devices of updated presence count
    broadcastToUserDevices(userId, 'presence:updated', {
      deviceId,
    });

    // Heartbeat every 20s to keep connection alive across proxies
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (_e) {
        clearInterval(heartbeat);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      userClients.delete(clientEntry);
      if (userClients.size === 0) {
        sseClients.delete(userId);
      } else {
        broadcastToUserDevices(userId, 'presence:updated', {
          deviceId,
        });
      }
    });
  });

  // Shared server-side Gemini client utility
  const getAiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Endpoint: Generate menu item description
  app.post('/api/gemini/menu-description', async (req, res) => {
    try {
      const { itemName, category } = req.body;
      if (!itemName) {
        return res.status(400).json({ error: 'Item name is required', fallback: 'A delicious addition to our menu.' });
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Generate a short, appetizing, one-sentence culinary description for a restaurant menu item named "${itemName}" which is in the "${category || 'Food'}" category. Keep it elegant and professional.`,
      });

      const description = response.text?.trim() || 'A delicious addition to our menu.';
      res.json({ description });
    } catch (error: any) {
      console.error('Server Gemini Error (menu-description):', error);
      res.status(500).json({
        error: error.message || 'Failed to generate menu description',
        fallback: 'Freshly prepared with the finest ingredients.',
      });
    }
  });

  // Endpoint: Generate witty receipt greeting
  app.post('/api/gemini/receipt-greeting', async (req, res) => {
    try {
      const { restaurantName } = req.body;
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Generate a short, witty, and warm thank you message for a restaurant receipt for a place called "${restaurantName || 'DaporKu Bistro'}". Max 10 words.`,
      });

      const greeting = response.text?.trim() || 'Thank you for dining with us!';
      res.json({ greeting });
    } catch (error: any) {
      console.error('Server Gemini Error (receipt-greeting):', error);
      res.status(500).json({
        error: error.message || 'Failed to generate receipt greeting',
        fallback: 'Thank you for dining with us!',
      });
    }
  });

  // Endpoint: Generic generate content
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt, model = 'gemini-3.8-flash', systemInstruction } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Server Gemini Error (generate):', error);
      res.status(500).json({ error: error.message || 'Generation failed' });
    }
  });

  // Endpoint: Streaming content generation via SSE
  app.post('/api/gemini/stream', async (req, res) => {
    try {
      const { prompt, model = 'gemini-3.8-flash', systemInstruction } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const ai = getAiClient();
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseStream = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('Server Gemini Stream Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Streaming failed' });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // Mount Vite in development or static serve in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
