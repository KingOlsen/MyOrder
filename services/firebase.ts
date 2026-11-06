import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AppUser, MenuItem, Table, OrderItem, Transaction, Expense, Category, TableStatus, OrderItemStatus } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validation & Sanitization Constants matching firebase-blueprint.json
export const ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
export const PHONE_PATTERN = /^[0-9+\-() ]+$/;

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'doc_1';
}

export function sanitizePhone(raw: string): string {
  const cleaned = raw.replace(/[^0-9+\-() ]/g, '').trim().slice(0, 30);
  return cleaned.length >= 3 ? cleaned : '000';
}

export async function hashPassword(password: string): Promise<string> {
  const trimmed = password.trim();
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const msgUint8 = new TextEncoder().encode(`seleraking_salt_${trimmed}`);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback deterministic hash
  let hash = 0;
  const salted = `seleraking_salt_${trimmed}`;
  for (let i = 0; i < salted.length; i++) {
    hash = (hash << 5) - hash + salted.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export async function signInWithGooglePopup() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutFirebase() {
  return signOut(auth);
}

// Fetch user profile and private info from Firestore
export async function fetchFirestoreUserAccount(userId: string): Promise<AppUser | null> {
  const uid = sanitizeId(userId);
  const profilePath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  let profileSnap;
  try {
    profileSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, profilePath);
  }

  if (!profileSnap || !profileSnap.exists()) {
    return null;
  }

  let privateSnap;
  try {
    privateSnap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  const profileData = profileSnap.data();
  const privateData = privateSnap?.exists() ? privateSnap.data() : null;

  return {
    id: uid,
    name: String(profileData.name || 'Restaurant User').slice(0, 100),
    phone: String(privateData?.phone || '000-0000').slice(0, 30),
    passwordHash: String(privateData?.passwordHash || 'google_auth').slice(0, 256),
    address: String(privateData?.address || '123 Culinary Ave, Foodie City').slice(0, 200),
    isCloudSynced: true,
  };
}

// Save or update user profile & private info in Firestore
export async function saveFirestoreUserAccount(user: AppUser): Promise<void> {
  const uid = sanitizeId(user.id);
  const profileRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');

  const safeName = (user.name.trim() || 'Selera Bistro').slice(0, 100);
  const safePhone = sanitizePhone(user.phone);
  const safePassHash = (user.passwordHash || 'default_hash').slice(0, 256);
  const safeAddress = (user.address.trim() || '123 Culinary Ave, Foodie City').slice(0, 200);

  let existingProfile;
  try {
    existingProfile = await getDoc(profileRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }

  try {
    if (!existingProfile.exists()) {
      await setDoc(profileRef, {
        ownerId: uid,
        name: safeName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, {
        name: safeName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existingProfile?.exists() ? OperationType.UPDATE : OperationType.CREATE,
      `users/${uid}`
    );
  }

  let existingPrivate;
  try {
    existingPrivate = await getDoc(privateRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}/private/info`);
  }

  try {
    if (!existingPrivate.exists()) {
      await setDoc(privateRef, {
        ownerId: uid,
        phone: safePhone,
        passwordHash: safePassHash,
        address: safeAddress,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(privateRef, {
        phone: safePhone,
        passwordHash: safePassHash,
        address: safeAddress,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existingPrivate?.exists() ? OperationType.UPDATE : OperationType.CREATE,
      `users/${uid}/private/info`
    );
  }
}

// Seed initial menu and tables in Firestore for a newly registered user if none exist
export async function initializeUserFirestoreWorkspace(
  userId: string,
  initialMenu: MenuItem[],
  initialTables: Table[]
): Promise<void> {
  const uid = sanitizeId(userId);
  const menuPath = `users/${uid}/menuItems`;
  const tablesPath = `users/${uid}/tables`;

  let menuSnap;
  try {
    menuSnap = await getDocs(collection(db, 'users', uid, 'menuItems'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, menuPath);
  }

  if (menuSnap.empty) {
    for (const item of initialMenu) {
      await saveFirestoreMenuItem(uid, item, true);
    }
  }

  let tablesSnap;
  try {
    tablesSnap = await getDocs(collection(db, 'users', uid, 'tables'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, tablesPath);
  }

  const existingTableNumericIds = new Set(
    tablesSnap.docs.map((d) => Number(d.data().tableNumericId))
  );
  for (const table of initialTables) {
    if (!existingTableNumericIds.has(table.id)) {
      await saveFirestoreTable(uid, table, true);
    }
  }
}

export async function saveFirestoreMenuItem(userId: string, item: MenuItem, isCreate = false): Promise<void> {
  const uid = sanitizeId(userId);
  const itemId = sanitizeId(item.id);
  const path = `users/${uid}/menuItems/${itemId}`;
  const ref = doc(db, 'users', uid, 'menuItems', itemId);

  const safeName = (item.name.trim() || 'Item').slice(0, 100);
  const safePrice = Math.max(0, Math.min(1000000, Number(item.price) || 0));
  const safeCategory: Category = ['Food', 'Drink', 'Dessert'].includes(item.category) ? item.category : 'Food';
  const safeDescription = (item.description || '').slice(0, 500);

  let exists = !isCreate;
  if (!isCreate) {
    try {
      const snap = await getDoc(ref);
      exists = snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  try {
    if (!exists) {
      await setDoc(ref, {
        ownerId: uid,
        name: safeName,
        price: safePrice,
        category: safeCategory,
        description: safeDescription,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: safeName,
        price: safePrice,
        category: safeCategory,
        description: safeDescription,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteFirestoreMenuItem(userId: string, itemId: string): Promise<void> {
  const uid = sanitizeId(userId);
  const safeId = sanitizeId(itemId);
  const path = `users/${uid}/menuItems/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'menuItems', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveFirestoreTable(userId: string, table: Table, isCreate = false): Promise<void> {
  const uid = sanitizeId(userId);
  const tableDocId = `table_${table.id}`;
  const path = `users/${uid}/tables/${tableDocId}`;
  const ref = doc(db, 'users', uid, 'tables', tableDocId);

  const safeStatus: TableStatus = ['Available', 'Occupied', 'Billed'].includes(table.status)
    ? table.status
    : 'Available';
  const orderStartTimeMs = table.orderStartTime ? new Date(table.orderStartTime).getTime() : 0;

  let exists = !isCreate;
  if (!isCreate) {
    try {
      const snap = await getDoc(ref);
      exists = snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  try {
    if (!exists) {
      await setDoc(ref, {
        ownerId: uid,
        tableNumericId: Math.max(1, Math.min(100, table.id)),
        number: table.number.slice(0, 20),
        status: safeStatus,
        orderStartTimeMs: Math.max(0, orderStartTimeMs),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        status: safeStatus,
        orderStartTimeMs: Math.max(0, orderStartTimeMs),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function syncTableOrderItemsFirestore(
  userId: string,
  tableId: number,
  orderItems: OrderItem[]
): Promise<void> {
  const uid = sanitizeId(userId);
  const listPath = `users/${uid}/orderItems`;

  let snap;
  try {
    snap = await getDocs(collection(db, 'users', uid, 'orderItems'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, listPath);
  }

  const existingForTable = snap.docs.filter((d) => d.data().tableNumericId === tableId);
  const incomingIds = new Set(orderItems.map((item) => `t${tableId}_m${sanitizeId(item.id)}`));

  // Delete removed order items for this table
  for (const oldDoc of existingForTable) {
    if (!incomingIds.has(oldDoc.id)) {
      try {
        await deleteDoc(doc(db, 'users', uid, 'orderItems', oldDoc.id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${listPath}/${oldDoc.id}`);
      }
    }
  }

  // Create or update current order items
  for (const item of orderItems) {
    const orderDocId = `t${tableId}_m${sanitizeId(item.id)}`;
    const itemPath = `${listPath}/${orderDocId}`;
    const ref = doc(db, 'users', uid, 'orderItems', orderDocId);
    const existsAlready = existingForTable.some((d) => d.id === orderDocId);

    const safeStatus: OrderItemStatus = item.status === 'Ready' ? 'Ready' : 'Pending';
    const safeRemark = (item.remark || '').slice(0, 200);
    const safeQuantity = Math.max(1, Math.min(1000, Math.round(item.quantity || 1)));

    try {
      if (!existsAlready) {
        await setDoc(ref, {
          ownerId: uid,
          tableNumericId: Math.max(1, Math.min(100, tableId)),
          menuItemId: sanitizeId(item.id),
          name: (item.name || 'Item').slice(0, 100),
          price: Math.max(0, Math.min(1000000, Number(item.price) || 0)),
          category: ['Food', 'Drink', 'Dessert'].includes(item.category) ? item.category : 'Food',
          quantity: safeQuantity,
          status: safeStatus,
          remark: safeRemark,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          quantity: safeQuantity,
          remark: safeRemark,
          status: safeStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, existsAlready ? OperationType.UPDATE : OperationType.CREATE, itemPath);
    }
  }
}

export async function createFirestoreTransaction(userId: string, tx: Transaction): Promise<void> {
  const uid = sanitizeId(userId);
  const txId = sanitizeId(tx.id);
  const path = `users/${uid}/transactions/${txId}`;
  const summary =
    tx.items
      .map((i) => `${i.quantity}x ${i.name} ($${(i.price * i.quantity).toFixed(2)})`)
      .join('; ')
      .slice(0, 2000) || 'Order Paid';

  try {
    await setDoc(doc(db, 'users', uid, 'transactions', txId), {
      ownerId: uid,
      tableNumber: (tx.tableNumber || '01').slice(0, 20),
      itemsSummary: summary,
      subtotal: Math.max(0, Math.min(10000000, Number(tx.subtotal) || 0)),
      tax: Math.max(0, Math.min(10000000, Number(tx.tax) || 0)),
      total: Math.max(0, Math.min(10000000, Number(tx.total) || 0)),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createFirestoreExpense(userId: string, expense: Expense): Promise<void> {
  const uid = sanitizeId(userId);
  const expId = sanitizeId(expense.id);
  const path = `users/${uid}/expenses/${expId}`;
  const validCategories = ['Supplies', 'Utilities', 'Rent', 'Wages', 'Maintenance', 'Marketing', 'Other'];
  const safeCat = validCategories.includes(expense.category) ? expense.category : 'Other';

  try {
    await setDoc(doc(db, 'users', uid, 'expenses', expId), {
      ownerId: uid,
      description: (expense.description.trim() || 'Expense').slice(0, 200),
      amount: Math.max(0.01, Math.min(10000000, Number(expense.amount) || 0.01)),
      category: safeCat,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteFirestoreExpense(userId: string, expenseId: string): Promise<void> {
  const uid = sanitizeId(userId);
  const expId = sanitizeId(expenseId);
  const path = `users/${uid}/expenses/${expId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'expenses', expId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToUserWorkspace(
  userId: string,
  callbacks: {
    onMenu: (items: MenuItem[]) => void;
    onTablesAndOrders: (tables: Table[]) => void;
    onTransactions: (txs: Transaction[]) => void;
    onExpenses: (exps: Expense[]) => void;
  }
): () => void {
  const uid = sanitizeId(userId);

  const menuPath = `users/${uid}/menuItems`;
  const unsubMenu = onSnapshot(
    collection(db, 'users', uid, 'menuItems'),
    (snap) => {
      if (snap.empty) return;
      const items: MenuItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          price: Number(data.price),
          category: data.category as Category,
          description: data.description || '',
        };
      });
      callbacks.onMenu(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, menuPath)
  );

  let latestTableDocs: { id: number; number: string; status: TableStatus; orderStartTime?: Date }[] = [];
  let latestOrderDocs: { tableNumericId: number; item: OrderItem }[] = [];

  const emitCombinedTables = () => {
    if (latestTableDocs.length === 0) return;
    const combined: Table[] = latestTableDocs
      .sort((a, b) => a.id - b.id)
      .map((t) => {
        const orders = latestOrderDocs.filter((o) => o.tableNumericId === t.id).map((o) => o.item);
        return {
          id: t.id,
          number: t.number,
          status: t.status,
          currentOrder: orders,
          orderStartTime: t.orderStartTime,
        };
      });
    callbacks.onTablesAndOrders(combined);
  };

  const tablesPath = `users/${uid}/tables`;
  const unsubTables = onSnapshot(
    collection(db, 'users', uid, 'tables'),
    (snap) => {
      if (snap.empty) return;
      latestTableDocs = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: Number(data.tableNumericId),
          number: String(data.number),
          status: data.status as TableStatus,
          orderStartTime: data.orderStartTimeMs > 0 ? new Date(data.orderStartTimeMs) : undefined,
        };
      });
      emitCombinedTables();
    },
    (error) => handleFirestoreError(error, OperationType.LIST, tablesPath)
  );

  const orderItemsPath = `users/${uid}/orderItems`;
  const unsubOrders = onSnapshot(
    collection(db, 'users', uid, 'orderItems'),
    (snap) => {
      latestOrderDocs = snap.docs.map((d) => {
        const data = d.data();
        return {
          tableNumericId: Number(data.tableNumericId),
          item: {
            id: String(data.menuItemId),
            name: String(data.name),
            price: Number(data.price),
            category: data.category as Category,
            quantity: Number(data.quantity),
            status: data.status as OrderItemStatus,
            remark: data.remark || '',
          },
        };
      });
      emitCombinedTables();
    },
    (error) => handleFirestoreError(error, OperationType.LIST, orderItemsPath)
  );

  const txPath = `users/${uid}/transactions`;
  const unsubTx = onSnapshot(
    collection(db, 'users', uid, 'transactions'),
    (snap) => {
      if (snap.empty) return;
      const txs: Transaction[] = snap.docs
        .map((d) => {
          const data = d.data();
          const ts = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
          // Parse itemsSummary back into display items if needed
          const parsedItems: OrderItem[] = String(data.itemsSummary || '')
            .split('; ')
            .filter(Boolean)
            .map((part, idx) => {
              const match = part.match(/^(\d+)x\s+(.+)\s+\(\$(\d+(?:\.\d+)?)\)$/);
              if (match) {
                const qty = Number(match[1]) || 1;
                const lineTotal = Number(match[3]) || 0;
                return {
                  id: `item_${idx}`,
                  name: match[2],
                  price: qty > 0 ? lineTotal / qty : lineTotal,
                  category: 'Food' as Category,
                  quantity: qty,
                  status: 'Ready' as OrderItemStatus,
                };
              }
              return {
                id: `item_${idx}`,
                name: part,
                price: Number(data.total) || 0,
                category: 'Food' as Category,
                quantity: 1,
                status: 'Ready' as OrderItemStatus,
              };
            });

          return {
            id: d.id,
            tableNumber: String(data.tableNumber),
            items: parsedItems,
            subtotal: Number(data.subtotal),
            tax: Number(data.tax),
            total: Number(data.total),
            timestamp: ts,
          };
        })
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      callbacks.onTransactions(txs);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, txPath)
  );

  const expPath = `users/${uid}/expenses`;
  const unsubExp = onSnapshot(
    collection(db, 'users', uid, 'expenses'),
    (snap) => {
      const exps: Expense[] = snap.docs
        .map((d) => {
          const data = d.data();
          const ts = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
          return {
            id: d.id,
            description: String(data.description),
            amount: Number(data.amount),
            category: String(data.category),
            timestamp: ts,
          };
        })
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      callbacks.onExpenses(exps);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, expPath)
  );

  return () => {
    unsubMenu();
    unsubTables();
    unsubOrders();
    unsubTx();
    unsubExp();
  };
}
