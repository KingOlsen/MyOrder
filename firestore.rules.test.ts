/**
 * Security Rules Verification Suite for Selera King POS
 * Verifies that all "Dirty Dozen" adversarial payloads defined in security_spec.md
 * are rejected with PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  authUid: string | null;
  emailVerified: boolean;
  path: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on UserProfile',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA',
    operation: 'create',
    payload: { ownerId: 'userB', name: 'Spoofed Bistro', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    authUid: 'userA',
    emailVerified: false,
    path: '/users/userA',
    operation: 'create',
    payload: { ownerId: 'userA', name: 'Unverified Bistro', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on UserProfile',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA',
    operation: 'create',
    payload: { ownerId: 'userA', name: 'Valid Name', isAdmin: true, createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-Tenant PII Read/Write',
    authUid: 'userB',
    emailVerified: true,
    path: '/users/userA/private/info',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Invalid Phone Regex in UserPrivateInfo',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA/private/info',
    operation: 'create',
    payload: { ownerId: 'userA', phone: '<script>alert(1)</script>', passwordHash: 'hash1234', address: '123 St', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned Subcollection Write without Parent User',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA/menuItems/item1',
    operation: 'create',
    payload: { ownerId: 'userA', name: 'Nasi Goreng', price: 12.5, category: 'Food', description: 'Tasty', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Negative Menu Price Poisoning',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA/menuItems/item1',
    operation: 'create',
    payload: { ownerId: 'userA', name: 'Nasi Goreng', price: -50, category: 'Food', description: 'Tasty', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Invalid Category Enum on MenuItemDoc',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA/menuItems/item1',
    operation: 'create',
    payload: { ownerId: 'userA', name: 'Secret Item', price: 10, category: 'Alcohol', description: 'Invalid', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning on Table Status Update',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA/tables/table1',
    operation: 'update',
    payload: { ownerId: 'userA', tableNumericId: 1, number: '01', status: 'Destroyed', orderStartTimeMs: 0, createdAt: 'ORIGINAL_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable createdAt Tampering on Update',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA/menuItems/item1',
    operation: 'update',
    payload: { ownerId: 'userA', name: 'Updated', price: 15, category: 'Food', description: 'Desc', createdAt: 'NEW_TIME', updatedAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Forged Client Timestamp on Create',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA/expenses/exp1',
    operation: 'create',
    payload: { ownerId: 'userA', description: 'Supplies', amount: 100, category: 'Supplies', createdAt: '2020-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'ID Poisoning Attack on Expense ID',
    authUid: 'userA',
    emailVerified: true,
    path: '/users/userA/expenses/bad$id!',
    operation: 'create',
    payload: { ownerId: 'userA', description: 'Supplies', amount: 25, category: 'Supplies', createdAt: 'SERVER_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
