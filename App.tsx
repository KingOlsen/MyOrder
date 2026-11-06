import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Table,
  MenuItem,
  OrderItem,
  RestaurantData,
  OrderItemStatus,
  Transaction,
  Expense,
  AppUser,
} from './types';
import TableGrid from './components/TableGrid';
import MenuManager from './components/MenuManager';
import OrderInterface from './components/OrderInterface';
import ReceiptModal from './components/ReceiptModal';
import Sidebar, { AppView } from './components/Sidebar';
import KitchenView from './components/KitchenView';
import RevenueView from './components/RevenueView';
import ExpensesView from './components/ExpensesView';
import OrderHistoryView from './components/OrderHistoryView';
import AuthScreen from './components/AuthScreen';
import UserProfileView from './components/UserProfileView';
import {
  auth,
  fetchFirestoreUserAccount,
  saveFirestoreUserAccount,
  initializeUserFirestoreWorkspace,
  saveFirestoreMenuItem,
  deleteFirestoreMenuItem,
  saveFirestoreTable,
  syncTableOrderItemsFirestore,
  createFirestoreTransaction,
  createFirestoreExpense,
  deleteFirestoreExpense,
  subscribeToUserWorkspace,
  signInWithGooglePopup,
  signOutFirebase,
} from './services/firebase';
import {
  fetchServerUsers,
  registerServerUser,
  fetchServerWorkspace,
  pushServerWorkspaceUpdate,
  subscribeToMultiDeviceSync,
  SyncedWorkspace,
} from './services/syncService';

const DINE_IN_TABLES: Table[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  number: (i + 1).toString().padStart(2, '0'),
  status: 'Available',
}));

const TAPAU_TABLES: Table[] = Array.from({ length: 5 }, (_, i) => ({
  id: 13 + i,
  number: `TAPAU ${(i + 1).toString().padStart(2, '0')}`,
  status: 'Available',
}));

const INITIAL_TABLES: Table[] = [...DINE_IN_TABLES, ...TAPAU_TABLES];

const ensureAllDefaultTables = (loaded: Table[]): Table[] => {
  const map = new Map<number, Table>();
  loaded.forEach((t) => map.set(t.id, t));
  INITIAL_TABLES.forEach((def) => {
    if (!map.has(def.id)) {
      map.set(def.id, { ...def });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
};

const INITIAL_MENU: MenuItem[] = [
  { id: '1', name: 'Nasi Goreng Special', price: 12.5, category: 'Food', description: 'Fragrant fried rice with shrimp and sunny side up egg.' },
  { id: '2', name: 'Beef Rendang', price: 15.0, category: 'Food', description: 'Slow-cooked beef in rich coconut milk and spices.' },
  { id: '3', name: 'Iced Teh Tarik', price: 3.5, category: 'Drink', description: 'Frothy pulled tea with condensed milk.' },
  { id: '4', name: 'Es Campur', price: 5.5, category: 'Dessert', description: 'Mixed shaved ice with tropical fruits and jellies.' },
];

const USERS_STORAGE_KEY = 'daporku_registered_users';
const ACTIVE_USER_ID_KEY = 'daporku_active_user_id';

const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        const revived = { ...item };
        if (revived.orderStartTime) revived.orderStartTime = new Date(revived.orderStartTime);
        if (revived.timestamp) revived.timestamp = new Date(revived.timestamp);
        return revived;
      }) as unknown as T;
    }
    return parsed as T;
  } catch (e) {
    console.error(`Error loading ${key} from storage`, e);
    return defaultValue;
  }
};

const App: React.FC = () => {
  const [registeredUsers, setRegisteredUsers] = useState<AppUser[]>(() =>
    loadFromStorage<AppUser[]>(USERS_STORAGE_KEY, [])
  );

  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const activeId = localStorage.getItem(ACTIVE_USER_ID_KEY);
    if (!activeId) return null;
    const users = loadFromStorage<AppUser[]>(USERS_STORAGE_KEY, []);
    return users.find((u) => u.id === activeId) || null;
  });

  const [view, setView] = useState<AppView>('tables');

  // Per-user isolated state
  const [tables, setTables] = useState<Table[]>(INITIAL_TABLES);
  const [menu, setMenu] = useState<MenuItem[]>(INITIAL_MENU);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Multi-device live presence & sync status
  const [connectedDevices, setConnectedDevices] = useState<number>(1);
  const [isSyncOnline, setIsSyncOnline] = useState<boolean>(true);
  const [syncingNow, setSyncingNow] = useState<boolean>(false);

  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [receiptTable, setReceiptTable] = useState<Table | null>(null);

  const applyWorkspaceSnapshot = useCallback((ws: SyncedWorkspace) => {
    const mergedTables = ensureAllDefaultTables(ws.tables);
    setTables(mergedTables);
    if (ws.menu && ws.menu.length > 0) {
      setMenu(ws.menu);
    }
    if (Array.isArray(ws.transactions)) {
      setTransactions(ws.transactions);
    }
    if (Array.isArray(ws.expenses)) {
      setExpenses(ws.expenses);
    }
    if (ws.user) {
      setCurrentUser((prev) => (prev && prev.id === ws.user.id ? { ...prev, ...ws.user } : prev));
    }
  }, []);

  // Sync local registered accounts with multi-device server on boot
  useEffect(() => {
    let mounted = true;
    async function syncRegisteredAccountsWithServer() {
      const localUsers = loadFromStorage<AppUser[]>(USERS_STORAGE_KEY, []);
      // Ensure any locally created users are registered on the server so other devices can log in
      for (const localUser of localUsers) {
        const uid = localUser.id;
        const localTables = ensureAllDefaultTables(
          loadFromStorage<Table[]>(`daporku_user_${uid}_tables`, INITIAL_TABLES)
        );
        const localMenu = loadFromStorage<MenuItem[]>(`daporku_user_${uid}_menu`, INITIAL_MENU);
        const localTxs = loadFromStorage<Transaction[]>(`daporku_user_${uid}_transactions`, []);
        const localExps = loadFromStorage<Expense[]>(`daporku_user_${uid}_expenses`, []);
        await registerServerUser(
          localUser,
          {
            tables: localTables,
            menu: localMenu,
            transactions: localTxs,
            expenses: localExps,
          },
          true
        ).catch(() => {});
      }

      const serverUsers = await fetchServerUsers();
      if (mounted && serverUsers.length > 0) {
        setRegisteredUsers((prev) => {
          const byId = new Map<string, AppUser>();
          prev.forEach((u) => byId.set(u.id, u));
          serverUsers.forEach((u) => byId.set(u.id, u));
          return Array.from(byId.values());
        });
      }
    }
    syncRegisteredAccountsWithServer();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist registered users list locally
  useEffect(() => {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(registeredUsers));
  }, [registeredUsers]);

  // Listen to Firebase Auth state changes for cloud-synced users
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const cloudAccount = await fetchFirestoreUserAccount(fbUser.uid);
          if (cloudAccount) {
            setRegisteredUsers((prev) => {
              const exists = prev.some((u) => u.id === cloudAccount.id);
              return exists
                ? prev.map((u) => (u.id === cloudAccount.id ? cloudAccount : u))
                : [...prev, cloudAccount];
            });
          }
        } catch (err) {
          console.error('Auth state check error:', err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Load isolated data & connect real-time multi-device SSE stream whenever currentUser changes
  useEffect(() => {
    if (!currentUser) {
      localStorage.removeItem(ACTIVE_USER_ID_KEY);
      return;
    }

    localStorage.setItem(ACTIVE_USER_ID_KEY, currentUser.id);
    const uid = currentUser.id;

    const userTables = ensureAllDefaultTables(
      loadFromStorage<Table[]>(`daporku_user_${uid}_tables`, INITIAL_TABLES)
    );
    const userMenu = loadFromStorage<MenuItem[]>(`daporku_user_${uid}_menu`, INITIAL_MENU);
    const userTransactions = loadFromStorage<Transaction[]>(`daporku_user_${uid}_transactions`, []);
    const userExpenses = loadFromStorage<Expense[]>(`daporku_user_${uid}_expenses`, []);

    setTables(userTables);
    setMenu(userMenu);
    setTransactions(userTransactions);
    setExpenses(userExpenses);
    setSelectedTableId(null);
    setReceiptTable(null);

    // Ensure user exists on the multi-device server and subscribe to real-time SSE updates
    registerServerUser(
      currentUser,
      {
        tables: userTables,
        menu: userMenu,
        transactions: userTransactions,
        expenses: userExpenses,
      },
      true
    )
      .then((ws) => applyWorkspaceSnapshot(ws))
      .catch(() => {});

    const unsubMultiDevice = subscribeToMultiDeviceSync(uid, {
      onInit: (ws, count) => {
        setConnectedDevices(count);
        if (ws) {
          applyWorkspaceSnapshot(ws);
        }
      },
      onRemoteUpdate: (ws, count) => {
        setConnectedDevices(count);
        applyWorkspaceSnapshot(ws);
      },
      onPresenceUpdate: (count) => {
        setConnectedDevices(count);
      },
      onConnectionChange: (online) => {
        setIsSyncOnline(online);
      },
    });

    // If authenticated with Firebase for this user, also subscribe to real-time Firestore workspace
    let unsubFirestore: (() => void) | undefined;
    if (currentUser.isCloudSynced && auth.currentUser?.uid === currentUser.id) {
      initializeUserFirestoreWorkspace(currentUser.id, userMenu, userTables).catch((err) =>
        console.error('Error initializing Firestore workspace:', err)
      );

      unsubFirestore = subscribeToUserWorkspace(currentUser.id, {
        onMenu: (cloudMenu) => setMenu(cloudMenu),
        onTablesAndOrders: (cloudTables) => setTables(ensureAllDefaultTables(cloudTables)),
        onTransactions: (cloudTxs) => setTransactions(cloudTxs),
        onExpenses: (cloudExps) => setExpenses(cloudExps),
      });
    }

    return () => {
      unsubMultiDevice();
      if (unsubFirestore) unsubFirestore();
    };
  }, [currentUser?.id, currentUser?.isCloudSynced, applyWorkspaceSnapshot]);

  // Save isolated data to local cache on change
  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(`daporku_user_${currentUser.id}_tables`, JSON.stringify(tables));
  }, [tables, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(`daporku_user_${currentUser.id}_menu`, JSON.stringify(menu));
  }, [menu, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(
      `daporku_user_${currentUser.id}_transactions`,
      JSON.stringify(transactions)
    );
  }, [transactions, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(`daporku_user_${currentUser.id}_expenses`, JSON.stringify(expenses));
  }, [expenses, currentUser]);

  const handleManualSyncNow = async () => {
    if (!currentUser) return;
    setSyncingNow(true);
    try {
      const result = await fetchServerWorkspace(currentUser.id);
      if (result) {
        applyWorkspaceSnapshot(result.workspace);
        setConnectedDevices(result.connectedDevices);
        setIsSyncOnline(true);
      } else {
        await pushServerWorkspaceUpdate(currentUser.id, {
          user: currentUser,
          tables,
          menu,
          transactions,
          expenses,
        });
      }
    } finally {
      setSyncingNow(false);
    }
  };

  const handleRegisterUser = useCallback((newUser: AppUser, serverWorkspace?: SyncedWorkspace) => {
    setRegisteredUsers((prev) => {
      const exists = prev.some((u) => u.id === newUser.id);
      if (exists) {
        return prev.map((u) => (u.id === newUser.id ? newUser : u));
      }
      return [...prev, newUser];
    });
    if (serverWorkspace) {
      localStorage.setItem(
        `daporku_user_${newUser.id}_tables`,
        JSON.stringify(ensureAllDefaultTables(serverWorkspace.tables))
      );
      localStorage.setItem(
        `daporku_user_${newUser.id}_menu`,
        JSON.stringify(serverWorkspace.menu)
      );
      localStorage.setItem(
        `daporku_user_${newUser.id}_transactions`,
        JSON.stringify(serverWorkspace.transactions)
      );
      localStorage.setItem(
        `daporku_user_${newUser.id}_expenses`,
        JSON.stringify(serverWorkspace.expenses)
      );
    }
  }, []);

  const handleLoginSuccess = useCallback(
    (user: AppUser, serverWorkspace?: SyncedWorkspace) => {
      if (serverWorkspace) {
        applyWorkspaceSnapshot(serverWorkspace);
      }
      setCurrentUser(user);
      setView('tables');
    },
    [applyWorkspaceSnapshot]
  );

  const handleLogout = async () => {
    if (auth.currentUser) {
      await signOutFirebase().catch(() => {});
    }
    setCurrentUser(null);
    setSelectedTableId(null);
    setReceiptTable(null);
  };

  const handleUpdateUserProfile = async (updated: AppUser) => {
    setCurrentUser(updated);
    setRegisteredUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    await pushServerWorkspaceUpdate(updated.id, { user: updated });
    if (updated.isCloudSynced && auth.currentUser?.uid === updated.id) {
      await saveFirestoreUserAccount(updated);
    }
  };

  const handleConnectGoogleCloud = async () => {
    if (!currentUser) return;
    const cred = await signInWithGooglePopup();
    const fbUid = cred.user.uid;
    const oldId = currentUser.id;

    if (oldId !== fbUid) {
      localStorage.setItem(`daporku_user_${fbUid}_tables`, JSON.stringify(tables));
      localStorage.setItem(`daporku_user_${fbUid}_menu`, JSON.stringify(menu));
      localStorage.setItem(`daporku_user_${fbUid}_transactions`, JSON.stringify(transactions));
      localStorage.setItem(`daporku_user_${fbUid}_expenses`, JSON.stringify(expenses));
    }

    const syncedUser: AppUser = {
      ...currentUser,
      id: fbUid,
      isCloudSynced: true,
    };

    await saveFirestoreUserAccount(syncedUser);
    await initializeUserFirestoreWorkspace(fbUid, menu, tables);
    await registerServerUser(
      syncedUser,
      { tables, menu, transactions, expenses },
      true
    );

    setRegisteredUsers((prev) => [
      ...prev.filter((u) => u.id !== oldId && u.id !== fbUid),
      syncedUser,
    ]);
    setCurrentUser(syncedUser);
  };

  // Wrapper for Menu updates that syncs across all devices + Firestore
  const handleSetMenu: React.Dispatch<React.SetStateAction<MenuItem[]>> = (updater) => {
    setMenu((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (currentUser) {
        pushServerWorkspaceUpdate(currentUser.id, { menu: next });
        if (currentUser.isCloudSynced && auth.currentUser?.uid === currentUser.id) {
          const uid = currentUser.id;
          const nextIds = new Set(next.map((i) => i.id));
          prev.forEach((oldItem) => {
            if (!nextIds.has(oldItem.id)) {
              deleteFirestoreMenuItem(uid, oldItem.id).catch(console.error);
            }
          });
          next.forEach((newItem) => {
            const prevItem = prev.find((p) => p.id === newItem.id);
            if (
              !prevItem ||
              prevItem.name !== newItem.name ||
              prevItem.price !== newItem.price ||
              prevItem.category !== newItem.category ||
              prevItem.description !== newItem.description
            ) {
              saveFirestoreMenuItem(uid, newItem, !prevItem).catch(console.error);
            }
          });
        }
      }
      return next;
    });
  };

  // Wrapper for Expenses updates that syncs across all devices + Firestore
  const handleSetExpenses: React.Dispatch<React.SetStateAction<Expense[]>> = (updater) => {
    setExpenses((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (currentUser) {
        pushServerWorkspaceUpdate(currentUser.id, { expenses: next });
        if (currentUser.isCloudSynced && auth.currentUser?.uid === currentUser.id) {
          const uid = currentUser.id;
          const nextIds = new Set(next.map((e) => e.id));
          prev.forEach((oldExp) => {
            if (!nextIds.has(oldExp.id)) {
              deleteFirestoreExpense(uid, oldExp.id).catch(console.error);
            }
          });
          next.forEach((newExp) => {
            const exists = prev.some((p) => p.id === newExp.id);
            if (!exists) {
              createFirestoreExpense(uid, newExp).catch(console.error);
            }
          });
        }
      }
      return next;
    });
  };

  const handlePlaceOrder = (tableId: number, order: OrderItem[]) => {
    setTables((prev) => {
      const next = prev.map((t) => {
        if (t.id === tableId) {
          const updatedTable: Table = {
            ...t,
            status: 'Occupied',
            currentOrder: order,
            orderStartTime: t.orderStartTime || new Date(),
          };
          if (currentUser?.isCloudSynced && auth.currentUser?.uid === currentUser.id) {
            saveFirestoreTable(currentUser.id, updatedTable).catch(console.error);
            syncTableOrderItemsFirestore(currentUser.id, tableId, order).catch(console.error);
          }
          return updatedTable;
        }
        return t;
      });
      if (currentUser) {
        pushServerWorkspaceUpdate(currentUser.id, { tables: next });
      }
      return next;
    });
    setSelectedTableId(null);
  };

  const updateOrderItemStatus = (tableId: number, itemId: string, newStatus: OrderItemStatus) => {
    setTables((prev) => {
      const next = prev.map((t) => {
        if (t.id === tableId && t.currentOrder) {
          const updatedOrder = t.currentOrder.map((item) =>
            item.id === itemId ? { ...item, status: newStatus } : item
          );
          if (currentUser?.isCloudSynced && auth.currentUser?.uid === currentUser.id) {
            syncTableOrderItemsFirestore(currentUser.id, tableId, updatedOrder).catch(
              console.error
            );
          }
          return {
            ...t,
            currentOrder: updatedOrder,
          };
        }
        return t;
      });
      if (currentUser) {
        pushServerWorkspaceUpdate(currentUser.id, { tables: next });
      }
      return next;
    });
  };

  const finalizePayment = (tableId: number) => {
    const table = tables.find((t) => t.id === tableId);
    if (table && table.currentOrder) {
      const subtotal = table.currentOrder.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const newTransaction: Transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tableNumber: table.number,
        items: table.currentOrder,
        subtotal: subtotal,
        tax: 0,
        total: subtotal,
        timestamp: new Date(),
      };

      const nextTransactions = [newTransaction, ...transactions];
      setTransactions(nextTransactions);

      const clearedTable: Table = {
        ...table,
        status: 'Available',
        currentOrder: [],
        orderStartTime: undefined,
      };

      const nextTables = tables.map((t) => (t.id === tableId ? clearedTable : t));
      setTables(nextTables);

      if (currentUser) {
        pushServerWorkspaceUpdate(currentUser.id, {
          tables: nextTables,
          transactions: nextTransactions,
        });
        if (currentUser.isCloudSynced && auth.currentUser?.uid === currentUser.id) {
          createFirestoreTransaction(currentUser.id, newTransaction).catch(console.error);
          saveFirestoreTable(currentUser.id, clearedTable).catch(console.error);
          syncTableOrderItemsFirestore(currentUser.id, tableId, []).catch(console.error);
        }
      }
    }
    setReceiptTable(null);
  };

  if (!currentUser) {
    return (
      <AuthScreen
        registeredUsers={registeredUsers}
        onRegisterUser={handleRegisterUser}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  const activeTable = tables.find((t) => t.id === selectedTableId);

  const restaurantInfo: RestaurantData = {
    name: currentUser.name,
    address: currentUser.address || '123 Culinary Ave, Foodie City',
    phone: currentUser.phone,
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        currentView={view}
        setView={setView}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="flex-1 p-4 md:p-8 overflow-auto">
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 font-serif">
              {view === 'tables'
                ? 'Floor Plan'
                : view === 'menu'
                ? 'Menu Management'
                : view === 'kitchen'
                ? 'Kitchen Dashboard'
                : view === 'revenue'
                ? 'Revenue Report'
                : view === 'history'
                ? 'Order History'
                : view === 'profile'
                ? 'User Account Settings'
                : 'Expense Management'}
            </h1>
            <p className="text-slate-500">
              {view === 'tables'
                ? 'Manage table occupancy and active orders.'
                : view === 'menu'
                ? 'Add or modify items in your digital menu.'
                : view === 'kitchen'
                ? 'Live order tracking for preparation and service.'
                : view === 'revenue'
                ? 'Track your sales performance and monthly earnings.'
                : view === 'history'
                ? 'Review all past orders and table activities.'
                : view === 'profile'
                ? 'Manage your registered name, phone number, password, and multi-device sync.'
                : 'Track operational costs and calculate net income.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Multi-Device Live Sync Badge */}
            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center space-x-2 shadow-sm text-xs">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isSyncOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              ></span>
              <span className="font-semibold text-slate-700">
                {isSyncOnline
                  ? `Synced (${connectedDevices} ${connectedDevices === 1 ? 'device' : 'devices'})`
                  : 'Reconnecting...'}
              </span>
              <button
                type="button"
                onClick={handleManualSyncNow}
                disabled={syncingNow}
                className="ml-1 text-orange-600 hover:text-orange-700 font-bold underline disabled:opacity-50"
                title="Force refresh state from server"
              >
                {syncingNow ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center space-x-3 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 font-bold flex items-center justify-center text-sm">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-800">{currentUser.name}</div>
                <div className="text-slate-400">Tel: {currentUser.phone}</div>
              </div>
            </div>
          </div>
        </header>

        {view === 'tables' && (
          <TableGrid tables={tables} onSelectTable={(id) => setSelectedTableId(id)} />
        )}

        {view === 'menu' && <MenuManager menu={menu} setMenu={handleSetMenu} />}

        {view === 'kitchen' && (
          <KitchenView tables={tables} onUpdateItemStatus={updateOrderItemStatus} />
        )}

        {view === 'revenue' && <RevenueView transactions={transactions} />}

        {view === 'history' && <OrderHistoryView transactions={transactions} />}

        {view === 'expenses' && (
          <ExpensesView
            expenses={expenses}
            setExpenses={handleSetExpenses}
            transactions={transactions}
          />
        )}

        {view === 'profile' && (
          <UserProfileView
            currentUser={currentUser}
            onUpdateUser={handleUpdateUserProfile}
            onConnectGoogleCloud={handleConnectGoogleCloud}
            onLogout={handleLogout}
          />
        )}
      </main>

      {selectedTableId !== null && activeTable && (
        <OrderInterface
          table={activeTable}
          menu={menu}
          onClose={() => setSelectedTableId(null)}
          onPlaceOrder={(order) => handlePlaceOrder(activeTable.id, order)}
          onCheckout={() => setReceiptTable(activeTable)}
        />
      )}

      {receiptTable && (
        <ReceiptModal
          table={receiptTable}
          restaurantInfo={restaurantInfo}
          onClose={() => setReceiptTable(null)}
          onPaid={() => finalizePayment(receiptTable.id)}
        />
      )}
    </div>
  );
};

export default App;
