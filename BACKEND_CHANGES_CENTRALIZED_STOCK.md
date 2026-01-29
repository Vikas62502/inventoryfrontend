# Backend Changes: Centralized Stock Management

## Overview
This document outlines the backend changes required to implement the new centralized stock management system where:
- **Stock remains with the admin** (not transferred to agents)
- **Agents work directly with admin's stock** (no stock requests from agents)
- **Agents make sales from admin's inventory** (stock is deducted from admin's inventory when agent makes a sale)

---

## 1. Remove Agent Stock Request Functionality

### 1.1 API Endpoints to Disable/Remove

**Remove or disable these endpoints for agents:**
- `POST /api/stock-requests` (when requested by agent role)
- `GET /api/stock-requests` (should not return agent-initiated requests)
- `PUT /api/stock-requests/:id/approve` (agents should not be able to approve)
- `PUT /api/stock-requests/:id/reject` (agents should not be able to reject)
- `PUT /api/stock-requests/:id/dispatch` (agents should not be able to dispatch)

**Action Required:**
- Add role-based middleware to block these endpoints for `agent` role
- OR remove agent stock request creation logic entirely

### 1.2 Database Changes

**Stock Requests Table:**
- No changes needed to schema
- Backend should filter out agent-initiated stock requests from queries
- Existing agent stock requests can remain in database (for historical records) but should not be returned in API responses

**Action Required:**
- Update `GET /api/stock-requests` to exclude requests where `requested_by.role === 'agent'`
- Update `GET /api/stock-requests` for admin role to only return:
  - Requests made BY the admin (to super-admin)
  - NOT requests made BY agents

---

## 2. Update Sales API to Deduct from Admin Inventory

### 2.1 Sales Creation Logic

**Current Behavior:**
- Sales are created and stored
- Stock may be deducted from agent's inventory (if separate)

**New Behavior:**
- When an agent creates a sale, stock should be deducted from **their assigned admin's inventory**
- The admin's inventory should be updated immediately upon sale creation

### 2.2 API Endpoint Changes

**Endpoint:** `POST /api/sales`

**Required Changes:**
1. **Identify Agent's Admin:**
   ```typescript
   // When agent creates a sale:
   const agent = await getUserById(agentId)
   const adminId = agent.created_by_id || agent.admin_id
   ```

2. **Deduct Stock from Admin's Inventory:**
   ```typescript
   // For each item in the sale:
   for (const item of sale.items) {
     // Find admin's inventory for this product
     const adminInventory = await AdminInventory.findOne({
       where: {
         admin_id: adminId,
         product_id: item.product_id
       }
     })
     
     // Deduct quantity
     if (adminInventory) {
       adminInventory.quantity -= item.quantity
       await adminInventory.save()
     }
   }
   ```

3. **Validation:**
   - Check if admin has sufficient stock before allowing sale
   - Return error if admin's stock is insufficient

**Action Required:**
- Update `POST /api/sales` endpoint to:
  - Get agent's admin ID from `agent.created_by_id` or `agent.admin_id`
  - Deduct stock from admin's inventory (not agent's inventory)
  - Validate sufficient stock exists before creating sale

---

## 3. Admin Inventory API Updates

### 3.1 Get Admin Inventory for Agent

**Endpoint:** `GET /api/admin-inventory/:adminId`

**Current Behavior:**
- Returns admin's inventory
- May include all products or only products with stock > 0

**New Behavior:**
- Should return admin's inventory with **current available stock** (after deducting agent's sales)
- OR: Return raw inventory and let frontend calculate available stock

**Action Required:**
- Ensure `GET /api/admin-inventory/:adminId` returns accurate stock levels
- Consider adding a query parameter to filter by agent's sales:
  - `GET /api/admin-inventory/:adminId?agentId=<agentId>` (returns stock minus agent's sales)

### 3.2 Real-time Stock Updates

**When Agent Makes Sale:**
- Admin's inventory should be updated immediately
- Admin dashboard should reflect updated stock when refreshed

**Action Required:**
- Ensure inventory updates are atomic (use database transactions)
- Consider adding real-time updates via WebSocket or polling mechanism

---

## 4. Agent Dashboard API Changes

### 4.1 Agent Stock Display

**Current Behavior:**
- Agent may see their own inventory
- Stock may be calculated from confirmed stock requests

**New Behavior:**
- Agent should see their admin's inventory
- Available stock = Admin's stock - Agent's sales

**Action Required:**
- Update `GET /api/admin-inventory/:adminId` to optionally calculate available stock per agent:
  ```typescript
  // Option 1: Return raw inventory, let frontend calculate
  GET /api/admin-inventory/:adminId
  
  // Option 2: Return calculated available stock for agent
  GET /api/admin-inventory/:adminId?agentId=<agentId>
  ```

### 4.2 Sales API for Agents

**Endpoint:** `GET /api/sales`

**Current Behavior:**
- Returns agent's sales
- May include stock information

**New Behavior:**
- Returns agent's sales
- Stock information should reflect admin's inventory (not agent's)

**Action Required:**
- Ensure sales API correctly filters by agent ID
- Ensure stock calculations use admin's inventory

---

## 5. Stock Request API Updates

### 5.1 Admin Stock Requests

**Endpoint:** `GET /api/stock-requests`

**For Admin Role:**
- Should only return:
  - Requests made BY the admin (to super-admin)
  - NOT requests made BY agents

**Action Required:**
- Update filtering logic:
  ```typescript
  // For admin role:
  const requests = await StockRequest.findAll({
    where: {
      requested_by_id: adminId,
      requested_from: 'super-admin'
    }
  })
  ```

### 5.2 Remove Agent Stock Request Creation

**Endpoint:** `POST /api/stock-requests`

**Action Required:**
- Add middleware to block agent role:
  ```typescript
  if (user.role === 'agent') {
    return res.status(403).json({ error: 'Agents cannot create stock requests' })
  }
  ```

---

## 6. Database Schema Considerations

### 6.1 Admin Inventory Table

**Ensure:**
- `admin_inventory` table exists with:
  - `admin_id` (foreign key to users)
  - `product_id` (foreign key to products)
  - `quantity` (current stock)

**Action Required:**
- Verify `admin_inventory` table structure
- Ensure indexes on `admin_id` and `product_id` for performance

### 6.2 Sales Table

**Ensure:**
- `sales` table includes:
  - `created_by_id` (agent who created the sale)
  - `items` (array of products and quantities)

**Action Required:**
- Verify `sales` table structure
- Ensure `created_by_id` correctly identifies the agent

---

## 7. Validation and Error Handling

### 7.1 Stock Validation

**When Agent Creates Sale:**
- Check if admin has sufficient stock
- Return clear error message if stock is insufficient

**Error Response:**
```json
{
  "error": "Insufficient stock",
  "details": [
    {
      "path": "items[0].quantity",
      "message": "Admin only has 5 units available, but 10 were requested"
    }
  ]
}
```

**Action Required:**
- Add stock validation in `POST /api/sales` endpoint
- Return detailed error messages for insufficient stock

### 7.2 Admin ID Validation

**When Agent Accesses Admin Inventory:**
- Verify agent has an assigned admin
- Return error if `agent.created_by_id` or `agent.admin_id` is missing

**Action Required:**
- Add validation to ensure agent has `created_by_id` or `admin_id`
- Return clear error if agent is not assigned to an admin

---

## 8. Migration Strategy

### 8.1 Existing Agent Stock Requests

**Option 1: Keep for Historical Records**
- Leave existing agent stock requests in database
- Filter them out from API responses
- No data migration needed

**Option 2: Archive/Delete**
- Move existing agent stock requests to archive table
- OR delete them if not needed

**Action Required:**
- Decide on migration strategy
- Implement filtering or archiving logic

### 8.2 Existing Agent Inventory

**If agents have separate inventory:**
- Option 1: Merge into admin inventory
- Option 2: Keep for historical records but don't use for new sales

**Action Required:**
- Decide on migration strategy for existing agent inventory

---

## 9. Testing Checklist

### 9.1 Agent Sales
- [ ] Agent can view admin's inventory
- [ ] Agent can create sale from admin's stock
- [ ] Admin's inventory decreases when agent makes sale
- [ ] Agent cannot create sale if admin has insufficient stock
- [ ] Error message is clear when stock is insufficient

### 9.2 Admin Dashboard
- [ ] Admin only sees their own stock requests (to super-admin)
- [ ] Admin does not see agent stock requests
- [ ] Admin's inventory updates when agent makes sale
- [ ] Admin can view their inventory correctly

### 9.3 Stock Requests
- [ ] Agent cannot create stock request (403 error)
- [ ] Admin can create stock request to super-admin
- [ ] Admin only sees their own stock requests

### 9.4 API Endpoints
- [ ] `GET /api/admin-inventory/:adminId` returns correct data
- [ ] `POST /api/sales` deducts from admin inventory
- [ ] `GET /api/stock-requests` filters correctly for admin role

---

## 10. Summary of Changes

### Endpoints to Modify:
1. **POST /api/sales**
   - Deduct stock from admin's inventory (not agent's)
   - Validate sufficient stock exists

2. **GET /api/stock-requests**
   - Filter out agent-initiated requests
   - Only return admin's own requests (to super-admin)

3. **POST /api/stock-requests**
   - Block agent role from creating requests

4. **GET /api/admin-inventory/:adminId**
   - Optionally calculate available stock per agent

### Database:
- No schema changes required
- Ensure `admin_inventory` table exists and is properly indexed

### Validation:
- Add stock validation in sales creation
- Add admin ID validation for agents

### Migration:
- Decide on handling existing agent stock requests
- Decide on handling existing agent inventory

---

## 11. Quick Start Guide

1. **Update Sales Creation:**
   ```typescript
   // In POST /api/sales
   const agent = await getUserById(agentId)
   const adminId = agent.created_by_id || agent.admin_id
   
   // Deduct from admin inventory
   for (const item of sale.items) {
     await deductFromAdminInventory(adminId, item.product_id, item.quantity)
   }
   ```

2. **Update Stock Requests Filtering:**
   ```typescript
   // In GET /api/stock-requests for admin role
   const requests = await StockRequest.findAll({
     where: {
       requested_by_id: adminId,
       requested_from: 'super-admin'
     }
   })
   ```

3. **Block Agent Stock Requests:**
   ```typescript
   // In POST /api/stock-requests
   if (user.role === 'agent') {
     return res.status(403).json({ error: 'Agents cannot create stock requests' })
   }
   ```

---

## 12. Questions for Backend Team

1. **Stock Calculation:**
   - Should available stock be calculated on the backend or frontend?
   - Should we add a new endpoint `GET /api/admin-inventory/:adminId?agentId=<agentId>` that returns calculated available stock?

2. **Real-time Updates:**
   - How should admin inventory updates be reflected in real-time?
   - Should we use WebSockets, polling, or another mechanism?

3. **Historical Data:**
   - What should we do with existing agent stock requests?
   - Should they be archived or deleted?

4. **Performance:**
   - Are there any performance concerns with deducting stock on every sale?
   - Should we batch updates or use database transactions?

---

**Last Updated:** January 2026  
**Priority:** High  
**Estimated Time:** 2-3 days
