# Reader AI — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: All unspecified Firestore paths are denied for read and write.
2. **Verified Identity**: All standard client writes require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **PII Isolation**: `/users/{userId}` contains private email and subscription data and is strictly readable only by `userId == request.auth.uid` or `isAdmin()`. Blanket `allow list` on `/users` is forbidden for non-admins.
4. **No Self-Upgrade / Privilege Escalation**: A non-admin user can only create `/users/{userId}` with `plan == 'free'`, `role == 'user'`, `planType == 'none'`. On update, non-admins cannot modify `plan`, `role`, `planType`, `uid`, `email`, or `createdAt`.
5. **Master Gate & Ownership**: Every subcollection document (`/users/{userId}/documents/{docId}` and `/users/{userId}/items/{itemId}`) requires the parent `/users/{userId}` document to exist on single-doc operations, requires `ownerId == request.auth.uid` and `userId == request.auth.uid`, and enforces `ownerId` and `createdAt` immutability.
6. **Free-Tier Enforcement in Rules**: On `/users/{userId}/items/{itemId}`, if the parent user's `plan == 'free'` (and caller is not admin), `hasAlarm` MUST be `false` and `category` MUST be one of `['Geral', 'Leituras & Estudos']`.
7. **Temporal Integrity**: `createdAt == request.time` on create; `updatedAt == request.time` on create and update; `createdAt` immutable on update.
8. **Size & ID Hardening**: Every ID path parameter on single-doc ops matches `^[a-zA-Z0-9_\-]+$` (<= 128 chars), and every string and array has an explicit `.size()` upper bound.
9. **Secure List Queries**: `allow list` on subcollections evaluates `resource.data.ownerId == request.auth.uid` directly without calling `get()` or `exists()`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Self-Upgrade on Create**: Non-admin creates `/users/{uid}` with `plan: "pro"`, `role: "user"`.
2. **Self-Admin Escalation on Create**: Non-admin creates `/users/{uid}` with `role: "admin"`.
3. **Shadow Field Injection on User Create**: Non-admin creates `/users/{uid}` with extra field `isVerified: true`.
4. **Privilege Escalation on User Update**: Non-admin updates `/users/{uid}` changing `plan` from `"free"` to `"pro"`.
5. **Cross-User PII Read**: User A attempts `get` on `/users/{userB}`.
6. **Unverified Admin Email Spoof**: Unverified token (`email_verified: false`) with `email: "dgorla@gmail.com"` attempts admin write.
7. **Orphaned Document Create**: User attempts to create `/users/{uid}/documents/doc1` before `/users/{uid}` exists.
8. **Document Owner Spoofing**: User A creates `/users/{userA}/documents/doc1` with `ownerId: "{userB}"`.
9. **Free-Tier Alarm Bypass**: Free user creates `/users/{uid}/items/item1` with `hasAlarm: true`.
10. **Free-Tier Custom Category Bypass**: Free user creates `/users/{uid}/items/item1` with `category: "VIP Custom"`.
11. **Backdated Timestamp Attack**: User creates `/users/{uid}/items/item1` with a forged client `createdAt` instead of `request.time`.
12. **Resource Poisoning / Oversized ID**: User attempts to create `/users/{uid}/documents/<200-char-invalid-id>` or `title` > 300 chars.
