# Backend Changes Required: Agent-Admin Mapping for Stock Requests

## 🚨 Issue
Agent stock request modal shows error: **"Unable to identify your admin. Please contact support."**

This happens when the agent user object doesn't include the admin ID that created/manages them.

---

## 🎯 Problem
When an agent tries to request stock, the frontend needs to know:
1. **Which admin** the agent belongs to
2. **What products** that admin has in stock

Currently, the agent user object may not include the `created_by_id` or `admin_id` field.

---

## ✅ Solution

### 1. User Object Must Include Admin ID

When an agent logs in or when fetching agent user data, the response must include the admin ID.

**Required Fields in Agent User Object:**
```json
{
  "id": "agent_uuid",
  "username": "agent123",
  "name": "Agent Name",
  "role": "agent",
  "is_active": true,
  "created_by_id": "admin_uuid",  // ✅ REQUIRED: ID of admin who created this agent
  "admin_id": "admin_uuid",       // ✅ ALTERNATIVE: Can use this field instead
  "created_at": "2024-01-20T00:00:00Z"
}
```

**Either field works:**
- `created_by_id` - ID of the user who created the agent
- `admin_id` - ID of the admin managing the agent

---

## 📋 API Endpoints to Update

### A. `GET /api/inventory-auth/me` (Get Current User)

**Current Response** (may be missing admin ID):
```json
{
  "id": "agent_uuid",
  "username": "agent123",
  "name": "Agent Name",
  "role": "agent",
  "is_active": true
}
```

**Required Response** (must include admin ID):
```json
{
  "id": "agent_uuid",
  "username": "agent123",
  "name": "Agent Name",
  "role": "agent",
  "is_active": true,
  "created_by_id": "admin_uuid",  // ✅ ADD THIS
  "admin_id": "admin_uuid"         // ✅ OR THIS
}
```

### B. `POST /api/inventory-auth/login` (Login Response)

**Current Response** (may be missing admin ID):
```json
{
  "message": "Login successful",
  "token": "jwt_token",
  "user": {
    "id": "agent_uuid",
    "username": "agent123",
    "name": "Agent Name",
    "role": "agent"
  }
}
```

**Required Response** (must include admin ID):
```json
{
  "message": "Login successful",
  "token": "jwt_token",
  "user": {
    "id": "agent_uuid",
    "username": "agent123",
    "name": "Agent Name",
    "role": "agent",
    "created_by_id": "admin_uuid",  // ✅ ADD THIS
    "admin_id": "admin_uuid"         // ✅ OR THIS
  }
}
```

### C. `GET /api/users/:id` (Get User by ID)

**Required Response** (must include admin ID for agents):
```json
{
  "id": "agent_uuid",
  "username": "agent123",
  "name": "Agent Name",
  "role": "agent",
  "is_active": true,
  "created_by_id": "admin_uuid",  // ✅ REQUIRED for agents
  "admin_id": "admin_uuid"         // ✅ ALTERNATIVE
}
```

---

## 🗄️ Database Schema

### Users Table

Ensure the `users` table has the relationship field:

```sql
-- Option 1: Using created_by_id (recommended)
ALTER TABLE users 
  ADD COLUMN created_by_id UUID REFERENCES users(id);

-- Option 2: Using admin_id (alternative)
ALTER TABLE users 
  ADD COLUMN admin_id UUID REFERENCES users(id);

-- Index for performance
CREATE INDEX idx_users_created_by_id ON users(created_by_id);
CREATE INDEX idx_users_admin_id ON users(admin_id);
```

### When Creating Agents

When an admin creates an agent, ensure the relationship is set:

```sql
-- Example: Admin creates agent
INSERT INTO users (id, username, password, name, role, created_by_id, is_active)
VALUES (
  'agent_uuid',
  'agent123',
  'hashed_password',
  'Agent Name',
  'agent',
  'admin_uuid',  -- ✅ Set the admin who created this agent
  false  -- Pending approval
);
```

---

## 💻 Backend Code Examples

### Node.js/Express Example

```javascript
// routes/auth.js - Login endpoint
router.post('/inventory-auth/login', async (req, res) => {
  const { username, password } = req.body
  
  // Authenticate user
  const user = await User.findOne({ where: { username } })
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // ✅ Include created_by_id or admin_id in response
  const userResponse = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
    created_by_id: user.created_by_id,  // ✅ ADD THIS
    admin_id: user.admin_id              // ✅ OR THIS
  }

  const token = generateJWT(userResponse)
  
  res.json({
    message: "Login successful",
    token,
    user: userResponse
  })
})

// routes/auth.js - Get current user endpoint
router.get('/inventory-auth/me', authenticate, async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: {
      exclude: ['password']  // Don't return password
    }
  })

  // ✅ Include created_by_id or admin_id
  res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
    created_by_id: user.created_by_id,  // ✅ ADD THIS
    admin_id: user.admin_id              // ✅ OR THIS
  })
})
```

### User Model Example (Sequelize)

```javascript
// models/User.js
const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('super-admin', 'admin', 'agent', 'account'),
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_by_id: {  // ✅ ADD THIS FIELD
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    },
    allowNull: true
  },
  admin_id: {  // ✅ OR THIS FIELD (alternative)
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    },
    allowNull: true
  }
}, {
  tableName: 'users'
})

// Relationship
User.belongsTo(User, { 
  as: 'creator', 
  foreignKey: 'created_by_id' 
})
User.belongsTo(User, { 
  as: 'admin', 
  foreignKey: 'admin_id' 
})
```

---

## 🧪 Testing

### Test Case 1: Agent Login
```bash
# Login as agent
POST /api/inventory-auth/login
{
  "username": "agent123",
  "password": "password123"
}

# ✅ Expected Response:
{
  "message": "Login successful",
  "token": "jwt_token",
  "user": {
    "id": "agent_uuid",
    "username": "agent123",
    "name": "Agent Name",
    "role": "agent",
    "created_by_id": "admin_uuid"  // ✅ Must be present
  }
}
```

### Test Case 2: Get Current User
```bash
# Get current user (as agent)
GET /api/inventory-auth/me
Headers: { "Authorization": "Bearer jwt_token" }

# ✅ Expected Response:
{
  "id": "agent_uuid",
  "username": "agent123",
  "name": "Agent Name",
  "role": "agent",
  "is_active": true,
  "created_by_id": "admin_uuid"  // ✅ Must be present
}
```

### Test Case 3: Agent Requests Stock
```bash
# Agent opens stock request modal
# Frontend should:
# 1. Get agent's created_by_id/admin_id ✅
# 2. Fetch admin's inventory: GET /api/admin-inventory/admin/{admin_id}
# 3. Show only products admin has in stock ✅
```

---

## 📊 Data Flow

```
1. Agent Logs In
   ↓
2. Backend Returns User Object
   ✅ Must include: created_by_id or admin_id
   ↓
3. Frontend Stores User in localStorage
   ↓
4. Agent Opens "Request Stock" Modal
   ↓
5. Frontend Gets: currentUser.created_by_id || currentUser.admin_id
   ↓
6. Frontend Calls: GET /api/admin-inventory/admin/{admin_id}
   ↓
7. Frontend Filters Products to Show Only What Admin Has
   ↓
8. Agent Sees Only Available Products ✅
```

---

## 🔧 Quick Fix Options

### Option 1: Update User Response (Recommended)
Add `created_by_id` or `admin_id` to all user responses (login, /me, get user).

### Option 2: Add Separate Endpoint
Create endpoint to get agent's admin:
```
GET /api/agents/{agent_id}/admin
Response: { "admin_id": "admin_uuid" }
```

### Option 3: Include in JWT Token
Add `admin_id` to JWT token claims, extract on frontend.

---

## ✅ Implementation Checklist

- [ ] Add `created_by_id` or `admin_id` field to users table (if not exists)
- [ ] Update user creation to set `created_by_id` when admin creates agent
- [ ] Update `POST /api/inventory-auth/login` to include admin ID in response
- [ ] Update `GET /api/inventory-auth/me` to include admin ID in response
- [ ] Update `GET /api/users/:id` to include admin ID for agents
- [ ] Test agent login and verify admin ID is returned
- [ ] Test agent stock request modal (should work without error)
- [ ] Verify admin inventory API works: `GET /api/admin-inventory/admin/{admin_id}`

---

## 🎯 Expected Behavior After Fix

**Before Fix:**
- ❌ Agent sees error: "Unable to identify your admin"
- ❌ Cannot request stock
- ❌ Product dropdown is empty

**After Fix:**
- ✅ Agent sees products their admin has in stock
- ✅ Product dropdown shows: "Product Name (Stock: 20)"
- ✅ Can request stock successfully
- ✅ Validation prevents requesting more than available

---

## 📝 Notes

- **Field Name**: Use either `created_by_id` or `admin_id` (frontend checks both)
- **Required For**: Only agents need this field (admins and super-admins don't)
- **When to Set**: When admin creates an agent, set `created_by_id = admin.id`
- **Null Handling**: If agent has no admin, frontend will show error (expected behavior)

---

**Last Updated**: January 23, 2026  
**Priority**: 🔴 HIGH (Blocks agent stock requests)  
**Complexity**: ⚡ EASY (Add one field to user responses)  
**Estimated Time**: 15-30 minutes
