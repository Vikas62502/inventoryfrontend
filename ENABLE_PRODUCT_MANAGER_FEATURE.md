# How to Enable Product Manager Feature

## Current Status
🔴 **DISABLED** - The Product Manager role feature is currently disabled because the backend doesn't support it yet.

## Quick Enable Steps

### 1. Wait for Backend Implementation
The backend team needs to implement all changes listed in `BACKEND_CHANGES_PRODUCT_MANAGER_ROLE.md`

### 2. Verify Backend is Ready
Test these endpoints to confirm backend support:

```bash
# Test: Can create a product manager user
curl -X POST http://localhost:3050/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -d '{
    "username": "testmanager",
    "password": "test123",
    "name": "Test Manager",
    "role": "super-admin-manager"
  }'

# Expected: 201 Created (not 400 Bad Request)

# Test: Can fetch product managers
curl -X GET "http://localhost:3050/api/users?role=super-admin-manager" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN"

# Expected: 200 OK with array of users

# Test: Product manager can login
curl -X POST http://localhost:3050/api/inventory-auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testmanager",
    "password": "test123"
  }'

# Expected: 200 OK with token and user object
```

### 3. Enable the Feature Flag

Open `lib/feature-flags.ts` and change:

```typescript
export const FEATURE_FLAGS = {
  ENABLE_PRODUCT_MANAGER_ROLE: true,  // ← Change false to true
} as const
```

### 4. Restart Development Server

```bash
npm run dev
# or
yarn dev
```

### 5. Test the Feature

1. **Login as Super Admin**
2. **Go to Users Tab**
3. **You should now see two cards:**
   - Product Manager (Create product managers)
   - Admin User (Create admins)
4. **Create a Product Manager**
5. **Logout and login as the Product Manager**
6. **Verify the Product Manager Dashboard appears**

## Rollback

If you need to disable the feature:

1. Change the flag back to `false` in `lib/feature-flags.ts`
2. Restart the dev server
3. The Product Manager UI will be hidden

## What Changes When Enabled

### Super Admin Dashboard
- ✅ Shows "Create Product Manager" card
- ✅ Shows "Product Managers" list section with search
- ✅ Can block/unblock product managers

### Login System
- ✅ Product managers can login
- ✅ Redirects to Product Manager Dashboard

### Product Manager Dashboard
- ✅ Full product CRUD operations
- ✅ Search and filter products
- ✅ View product metrics

## Troubleshooting

### Error: "Invalid option: expected one of super-admin|admin|agent|account"
**Problem**: Backend doesn't support the new role yet  
**Solution**: Keep feature flag disabled until backend is updated

### Error: "Cannot read property 'role' of undefined"
**Problem**: User object doesn't have the expected structure  
**Solution**: Check JWT token payload includes the role field

### Product Manager Dashboard not showing
**Problem**: Routing issue or role mismatch  
**Solution**: 
1. Check feature flag is enabled
2. Verify user role is exactly "super-admin-manager"
3. Check browser console for errors

## Questions?

- Frontend implementation: See `components/dashboards/super-admin-manager-dashboard.tsx`
- Backend requirements: See `BACKEND_CHANGES_PRODUCT_MANAGER_ROLE.md`
- Feature flag: See `lib/feature-flags.ts`
