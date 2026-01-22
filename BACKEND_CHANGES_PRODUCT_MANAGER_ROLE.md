# Backend Changes Required: Super Admin Manager (Product Manager) Role

## Overview
The frontend has been updated to support a new user role called **"super-admin-manager"** (also referred to as "Product Manager"). This role is dedicated to managing products (CRUD operations) separately from the super admin.

## ⚠️ Current Status: FEATURE DISABLED

**The Product Manager feature is currently DISABLED via feature flag.**

```typescript
// lib/feature-flags.ts
ENABLE_PRODUCT_MANAGER_ROLE: false  // ← DISABLED until backend is ready
```

To enable the feature after backend implementation:
1. Complete all backend changes listed in this document
2. Test the backend endpoints
3. Change the flag to `true` in `lib/feature-flags.ts`

---

## 1. Database Schema Changes

### Update `users` Table

Add the new role to the `role` enum field:

```sql
-- If using PostgreSQL enum
ALTER TYPE user_role ADD VALUE 'super-admin-manager';

-- If using MySQL/MariaDB enum, you'll need to alter the column
ALTER TABLE users MODIFY COLUMN role ENUM(
  'super-admin', 
  'super-admin-manager', 
  'admin', 
  'agent', 
  'account'
) NOT NULL;
```

### Example User Record

```json
{
  "id": "uuid",
  "username": "productmanager1",
  "password": "hashed_password",
  "name": "Product Manager Name",
  "role": "super-admin-manager",
  "is_active": true,
  "created_at": "2024-01-20T00:00:00Z",
  "updated_at": "2024-01-20T00:00:00Z",
  "created_by_id": "super_admin_uuid"
}
```

---

## 2. API Endpoint Updates

### A. User Management Endpoints

#### `GET /api/users?role=super-admin-manager`
**Purpose**: Fetch all product managers

**Response**:
```json
[
  {
    "id": "uuid",
    "username": "productmanager1",
    "name": "Product Manager Name",
    "role": "super-admin-manager",
    "is_active": true,
    "created_at": "2024-01-20T00:00:00Z",
    "updated_at": "2024-01-20T00:00:00Z"
  }
]
```

#### `POST /api/users`
**Purpose**: Create a new user (including product managers)

**Request Body** (example for product manager):
```json
{
  "username": "productmanager1",
  "password": "password123",
  "name": "Product Manager Name",
  "role": "super-admin-manager"
}
```

**Authorization**: Only `super-admin` can create `super-admin-manager` users

**Response**:
```json
{
  "id": "uuid",
  "username": "productmanager1",
  "name": "Product Manager Name",
  "role": "super-admin-manager",
  "is_active": true,
  "created_at": "2024-01-20T00:00:00Z"
}
```

#### `PUT /api/users/:id`
**Purpose**: Update user (including block/unblock product managers)

**Request Body** (to block/unblock):
```json
{
  "is_active": false  // or true to unblock
}
```

**Authorization**: Only `super-admin` can update `super-admin-manager` users

---

### B. Authentication Endpoints

#### `POST /api/inventory-auth/login`
**Purpose**: Allow product managers to login

**Request Body**:
```json
{
  "username": "productmanager1",
  "password": "password123"
}
```

**Response**:
```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "username": "productmanager1",
    "name": "Product Manager Name",
    "role": "super-admin-manager",
    "is_active": true
  }
}
```

#### `GET /api/inventory-auth/me`
**Purpose**: Get current user info

Should return the product manager's details when they are logged in.

---

### C. Product Management Endpoints

Update authorization middleware to allow `super-admin-manager` role access to product endpoints:

#### `GET /api/products`
**Authorization**: `super-admin`, `super-admin-manager`, `admin`, `agent` (read access for all)

#### `POST /api/products`
**Authorization**: `super-admin`, **`super-admin-manager`** ✅ (NEW)

**Current**: Only `super-admin`  
**Update**: Allow `super-admin-manager` as well

#### `PUT /api/products/:id`
**Authorization**: `super-admin`, **`super-admin-manager`** ✅ (NEW)

**Current**: Only `super-admin`  
**Update**: Allow `super-admin-manager` as well

#### `DELETE /api/products/:id`
**Authorization**: `super-admin`, **`super-admin-manager`** ✅ (NEW)

**Current**: Only `super-admin`  
**Update**: Allow `super-admin-manager` as well

---

## 3. Middleware/Permission Updates

### Authorization Middleware

Update your role-based authorization middleware to recognize the new role:

```javascript
// Example Node.js/Express middleware
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.' 
      });
    }
    next();
  };
};

// Example usage for product endpoints
router.post('/products', 
  authenticate, 
  authorizeRoles('super-admin', 'super-admin-manager'), // UPDATED
  createProduct
);

router.put('/products/:id', 
  authenticate, 
  authorizeRoles('super-admin', 'super-admin-manager'), // UPDATED
  updateProduct
);

router.delete('/products/:id', 
  authenticate, 
  authorizeRoles('super-admin', 'super-admin-manager'), // UPDATED
  deleteProduct
);
```

---

## 4. Validation Updates

### User Creation Validation

Update your user creation validation to accept the new role:

```javascript
// Example validation schema (using Joi or similar)
const userCreateSchema = {
  username: Joi.string().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().required(),
  role: Joi.string()
    .valid('super-admin', 'super-admin-manager', 'admin', 'agent', 'account') // UPDATED
    .required()
};
```

### User Role Validation

Ensure role validation is updated in:
- User registration
- User update
- JWT token generation
- Permission checks

---

## 5. Database Seed/Migration Script

Create a migration to add the new role and optionally create a default product manager:

```javascript
// Example migration (pseudo-code)
exports.up = async (knex) => {
  // Update enum if needed (depends on your DB)
  await knex.raw(`
    ALTER TABLE users 
    MODIFY role ENUM(
      'super-admin', 
      'super-admin-manager', 
      'admin', 
      'agent', 
      'account'
    )
  `);

  // Optional: Create a default product manager
  await knex('users').insert({
    id: generateUUID(),
    username: 'productmanager',
    password: await hashPassword('admin123'),
    name: 'Product Manager',
    role: 'super-admin-manager',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  });
};
```

---

## 6. Documentation Updates

### API Documentation

Update your API documentation (Swagger/OpenAPI) to reflect:

1. New role type in user schema:
```yaml
User:
  type: object
  properties:
    role:
      type: string
      enum: [super-admin, super-admin-manager, admin, agent, account] # UPDATED
```

2. Updated authorization requirements for product endpoints

3. New query parameter for fetching product managers:
```yaml
/api/users:
  get:
    parameters:
      - name: role
        in: query
        schema:
          type: string
          enum: [super-admin, super-admin-manager, admin, agent, account] # UPDATED
```

---

## 7. Testing Requirements

### Unit Tests

Create tests for:
- ✅ Product manager login
- ✅ Product manager CRUD operations on products
- ✅ Super admin can create product managers
- ✅ Super admin can block/unblock product managers
- ✅ Product manager cannot access admin/agent/stock endpoints
- ✅ Product manager can only access product endpoints

### Integration Tests

Test the following workflows:
1. **Create Product Manager**: Super admin creates a product manager
2. **Login as Product Manager**: Product manager logs in successfully
3. **Manage Products**: Product manager can create/edit/delete products
4. **Block Product Manager**: Super admin blocks product manager
5. **Blocked Access**: Blocked product manager cannot login
6. **Unblock Product Manager**: Super admin unblocks product manager

---

## 8. Permissions Matrix

| Endpoint | super-admin | super-admin-manager | admin | agent | account |
|----------|-------------|---------------------|-------|-------|---------|
| `POST /api/products` | ✅ | ✅ **NEW** | ❌ | ❌ | ❌ |
| `PUT /api/products/:id` | ✅ | ✅ **NEW** | ❌ | ❌ | ❌ |
| `DELETE /api/products/:id` | ✅ | ✅ **NEW** | ❌ | ❌ | ❌ |
| `GET /api/products` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /api/users` | ✅ | ❌ | ✅* | ❌ | ❌ |
| `PUT /api/users/:id` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /api/users` | ✅ | ❌ | ✅* | ❌ | ✅* |
| `POST /api/stock-requests` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `POST /api/stock-requests/:id/dispatch` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `POST /api/sales` | ❌ | ❌ | ❌ | ✅ | ❌ |

*With restrictions based on role hierarchy

---

## 9. Security Considerations

1. **Role Hierarchy**: Ensure product managers cannot:
   - Create or modify other users
   - Access stock requests or sales data
   - Access admin or agent management features
   - Modify their own role

2. **JWT Claims**: Update JWT token generation to include the new role

3. **Rate Limiting**: Apply appropriate rate limits for product manager endpoints

4. **Audit Logging**: Log all product management actions by product managers:
   - Product created by {product_manager_name}
   - Product updated by {product_manager_name}
   - Product deleted by {product_manager_name}

---

## 10. Rollback Plan

If issues arise, you can:

1. **Disable Role**: Set all `super-admin-manager` users to `is_active: false`
2. **Revert Permissions**: Remove `super-admin-manager` from product endpoint permissions
3. **Database Rollback**: Run migration down script to remove the role (if no users exist with that role)

---

## 11. Implementation Checklist

- [ ] Update database schema to include `super-admin-manager` role
- [ ] Update user creation endpoint to accept new role
- [ ] Update user query endpoint to filter by new role
- [ ] Update authentication to support new role login
- [ ] Update product endpoints authorization (CREATE, UPDATE, DELETE)
- [ ] Update validation schemas for the new role
- [ ] Update API documentation
- [ ] Create database migration script
- [ ] Write unit tests for new role
- [ ] Write integration tests for workflows
- [ ] Update audit logging to track product manager actions
- [ ] Deploy and test in staging environment
- [ ] Create default product manager account (optional)
- [ ] Update role-based access control (RBAC) documentation

---

## 12. Example Backend Code

### Express.js Example

```javascript
// routes/products.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const productsController = require('../controllers/products');

// Get all products (all authenticated users)
router.get('/', 
  authenticate, 
  productsController.getAll
);

// Create product (super-admin and super-admin-manager only)
router.post('/', 
  authenticate, 
  authorizeRoles('super-admin', 'super-admin-manager'), // UPDATED
  productsController.create
);

// Update product (super-admin and super-admin-manager only)
router.put('/:id', 
  authenticate, 
  authorizeRoles('super-admin', 'super-admin-manager'), // UPDATED
  productsController.update
);

// Delete product (super-admin and super-admin-manager only)
router.delete('/:id', 
  authenticate, 
  authorizeRoles('super-admin', 'super-admin-manager'), // UPDATED
  productsController.delete
);

module.exports = router;
```

### User Controller Example

```javascript
// controllers/users.js
async function createUser(req, res) {
  const { username, password, name, role } = req.body;
  
  // Validation
  const validRoles = ['super-admin', 'super-admin-manager', 'admin', 'agent', 'account'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  // Authorization check
  if (role === 'super-admin-manager' && req.user.role !== 'super-admin') {
    return res.status(403).json({ 
      error: 'Only super-admin can create product managers' 
    });
  }
  
  // Create user
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    username,
    password: hashedPassword,
    name,
    role,
    created_by_id: req.user.id
  });
  
  res.status(201).json(user);
}

async function getAllUsers(req, res) {
  const { role } = req.query;
  
  let query = {};
  if (role) {
    // Validate role
    const validRoles = ['super-admin', 'super-admin-manager', 'admin', 'agent', 'account'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role filter' });
    }
    query.role = role;
  }
  
  const users = await User.findAll({ where: query });
  res.json(users);
}
```

---

## 13. Questions for Clarification

Before implementation, please confirm:

1. **Default Credentials**: Should we create a default product manager account? If yes:
   - Username: ?
   - Password: ?
   - Name: ?

2. **Activation**: Should product managers be automatically active when created, or require super-admin approval?

3. **Limitations**: Should product managers have any limits on:
   - Number of products they can create?
   - Frequency of operations?

4. **Categories**: Can product managers also create/edit/delete product categories?

5. **Stock Management**: Can product managers update the central stock quantity when editing products?

---

## 14. Contact & Support

For questions or issues during implementation:
- Frontend Team: [Your contact]
- Documentation: This file
- API Testing: Use Postman collection (to be provided)

---

**Last Updated**: January 20, 2026  
**Frontend Version**: v1.0.0 with super-admin-manager support  
**Status**: ✅ Frontend Ready - Awaiting Backend Implementation
