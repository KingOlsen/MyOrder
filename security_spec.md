# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Master Gate & Tenant Isolation**: Every document under `/users/{userId}` and its subcollections (`private`, `menuItems`, `tables`, `orderItems`, `transactions`, `expenses`) MUST strictly belong to `request.auth.uid == userId`, where `request.auth.token.email_verified == true`. Subcollection writes require the parent `/users/{userId}` document to exist and have `ownerId == request.auth.uid`.
2. **PII Split Collection Isolation**: Sensitive PII (`phone`, `address`, `passwordHash`) is strictly isolated in `/users/{userId}/private/{docId}` (`docId == 'info'`) and never exposed on `/users/{userId}` or accessible by any other user.
3. **Strict Schema & Anti-Update-Gap**: Every `create` and `update` operation must invoke its entity validation helper (`isValidUserProfile`, `isValidUserPrivateInfo`, `isValidMenuItemDoc`, `isValidTableDoc`, `isValidOrderItemDoc`, `isValidTransactionDoc`, `isValidExpenseDoc`) enforcing exact keys (`hasAll` and `hasOnly`), string length bounds, regex patterns, and numeric boundaries.
4. **Immutability & Server Timestamps**: `ownerId` and `createdAt` are immutable across all updates (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`). Creation timestamps must equal `request.time`, and update timestamps (`updatedAt`) must equal `request.time`.
5. **Query Enforcer**: All `allow list` rules explicitly verify `isOwner(userId) && resource.data.ownerId == request.auth.uid` without `get()`/`exists()` inside list blocks.

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on UserProfile)**: Authenticated user `userA` attempts to create `/users/userA` with `ownerId: "userB"`.
   ```json
   { "ownerId": "userB", "name": "Spoofed Bistro", "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
2. **Payload 2 (Unverified Email Write)**: User `userA` with `email_verified: false` attempts to create `/users/userA`.
   ```json
   { "ownerId": "userA", "name": "Unverified Bistro", "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
3. **Payload 3 (Shadow Field Injection on UserProfile)**: User `userA` attempts to inject `"isAdmin": true` into `/users/userA`.
   ```json
   { "ownerId": "userA", "name": "Valid Name", "isAdmin": true, "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
4. **Payload 4 (Cross-Tenant PII Read/Write)**: User `userB` attempts to read or write `/users/userA/private/info`.
   ```json
   { "ownerId": "userB", "phone": "0123456789", "passwordHash": "hash1234", "address": "123 St", "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
5. **Payload 5 (Invalid Phone Regex in UserPrivateInfo)**: User `userA` attempts to store script tags in `phone` at `/users/userA/private/info`.
   ```json
   { "ownerId": "userA", "phone": "<script>alert(1)</script>", "passwordHash": "hash1234", "address": "123 St", "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
6. **Payload 6 (Orphaned Subcollection Write)**: User `userA` attempts to create `/users/userA/menuItems/item1` before `/users/userA` exists.
   ```json
   { "ownerId": "userA", "name": "Nasi Goreng", "price": 12.5, "category": "Food", "description": "Tasty", "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
7. **Payload 7 (Negative Menu Price Poisoning)**: User `userA` attempts to create `/users/userA/menuItems/item1` with `price: -50`.
   ```json
   { "ownerId": "userA", "name": "Nasi Goreng", "price": -50, "category": "Food", "description": "Tasty", "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
8. **Payload 8 (Invalid Category Enum on MenuItemDoc)**: User `userA` attempts to set `category: "Alcohol"` outside `["Food", "Drink", "Dessert"]`.
   ```json
   { "ownerId": "userA", "name": "Secret Item", "price": 10, "category": "Alcohol", "description": "Invalid", "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
9. **Payload 9 (Value Poisoning on Update)**: User `userA` updates `/users/userA/tables/table1` with `status: "Destroyed"` (invalid enum).
   ```json
   { "ownerId": "userA", "tableNumericId": 1, "number": "01", "status": "Destroyed", "orderStartTimeMs": 0, "createdAt": "ORIGINAL_TIME", "updatedAt": "SERVER_TIME" }
   ```
10. **Payload 10 (Immutable `createdAt` Tampering on Update)**: User `userA` updates `/users/userA/menuItems/item1` and alters `createdAt`.
    ```json
    { "ownerId": "userA", "name": "Updated", "price": 15, "category": "Food", "description": "Desc", "createdAt": "NEW_TIME", "updatedAt": "SERVER_TIME" }
    ```
11. **Payload 11 (Forged Client Timestamp on Create)**: User `userA` creates `/users/userA/expenses/exp1` with a past timestamp instead of `request.time`.
    ```json
    { "ownerId": "userA", "description": "Supplies", "amount": 100, "category": "Supplies", "createdAt": "2020-01-01T00:00:00Z" }
    ```
12. **Payload 12 (ID Poisoning Attack)**: User `userA` attempts to create a document with special characters in ID `/users/userA/expenses/bad$id!`.
    ```json
    { "ownerId": "userA", "description": "Supplies", "amount": 25, "category": "Supplies", "createdAt": "SERVER_TIME" }
    ```
