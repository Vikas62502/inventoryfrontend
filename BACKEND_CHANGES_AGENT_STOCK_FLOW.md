# Backend Changes Required: Simplified Agent Stock Request Flow

## Overview
The frontend has been updated to simplify the agent stock request workflow. Agents now request **generic stock** from admins without specifying B2B or B2C type. Customer details and addresses are only captured at the **sale** stage, not during stock requests.

---

## 🎯 New Workflow

```
1. Agent → Generic Stock Request → Admin
   (No B2B/B2C, no customer details)

2. Admin → Reviews & Transfers → Agent
   (Generic stock transfer)

3. Agent → Unified Stock Pool
   (Single inventory for the agent)

4. Agent → Creates Sale (B2B or B2C)
   (Customer details captured here)
   └─ Stock deducted from agent's pool
```

---

## 📋 Changes Required

### 1. Stock Requests API (`/api/stock-requests`)

#### A. `POST /api/stock-requests` (Create Stock Request)

**OLD Request Body** (Should NO LONGER be required):
```json
{
  "requested_from": "admin_id",
  "items": [
    { "product_id": "product_1", "quantity": 10 }
  ],
  "notes": "Request notes",
  "request_type": "b2b",              // ❌ REMOVE
  "customer_name": "John Doe",         // ❌ REMOVE
  "company_name": "ABC Corp",          // ❌ REMOVE
  "gst_number": "GST123",              // ❌ REMOVE
  "contact_person": "Jane Smith",      // ❌ REMOVE
  "customer_email": "john@abc.com",    // ❌ REMOVE
  "customer_phone": "+1234567890",     // ❌ REMOVE
  "billing_address": { ... },          // ❌ REMOVE
  "delivery_address": { ... }          // ❌ REMOVE
}
```

**NEW Request Body** (Simplified):
```json
{
  "requested_from": "admin_id",
  "items": [
    { "product_id": "product_1", "quantity": 10 },
    { "product_id": "product_2", "quantity": 5 }
  ],
  "notes": "Stock request from agent",
  "status": "pending"
}
```

**Required Fields:**
- ✅ `requested_from` (admin ID)
- ✅ `items` (array of products with quantities)
- ✅ `notes` (optional, string)
- ✅ `status` (defaults to "pending")

**Removed Fields:**
- ❌ `request_type` (b2b/b2c) - No longer needed
- ❌ `customer_name` - Moved to sales
- ❌ `company_name` - Moved to sales
- ❌ `gst_number` - Moved to sales
- ❌ `contact_person` - Moved to sales
- ❌ `customer_email` - Moved to sales
- ❌ `customer_phone` - Moved to sales
- ❌ `billing_address` - Moved to sales
- ❌ `delivery_address` - Moved to sales

---

### 2. Database Schema Changes

#### A. `stock_requests` Table

**Fields to Make Optional** (if they were required):
```sql
ALTER TABLE stock_requests 
  ALTER COLUMN request_type DROP NOT NULL,
  ALTER COLUMN customer_name DROP NOT NULL,
  ALTER COLUMN company_name DROP NOT NULL,
  ALTER COLUMN gst_number DROP NOT NULL,
  ALTER COLUMN contact_person DROP NOT NULL,
  ALTER COLUMN customer_email DROP NOT NULL,
  ALTER COLUMN customer_phone DROP NOT NULL;
```

**OR Better: Remove These Fields Entirely** (Recommended):
```sql
-- These fields should only exist in the 'sales' table, not 'stock_requests'
ALTER TABLE stock_requests 
  DROP COLUMN IF EXISTS request_type,
  DROP COLUMN IF EXISTS customer_name,
  DROP COLUMN IF EXISTS company_name,
  DROP COLUMN IF EXISTS gst_number,
  DROP COLUMN IF EXISTS contact_person,
  DROP COLUMN IF EXISTS customer_email,
  DROP COLUMN IF EXISTS customer_phone,
  DROP COLUMN IF EXISTS billing_address_id,
  DROP COLUMN IF EXISTS delivery_address_id;
```

**Keep Only Essential Fields:**
```sql
CREATE TABLE stock_requests (
  id UUID PRIMARY KEY,
  requested_by_id UUID REFERENCES users(id),
  requested_from UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  requested_date TIMESTAMP DEFAULT NOW(),
  dispatched_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stock_request_items (
  id UUID PRIMARY KEY,
  stock_request_id UUID REFERENCES stock_requests(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 3. Validation Updates

#### Backend Validation (Node.js Example):

**OLD Validation** (Remove this):
```javascript
// ❌ REMOVE - No longer validate B2B/B2C fields
if (requestData.request_type === 'b2b') {
  if (!requestData.customer_name || !requestData.company_name) {
    throw new Error("B2B fields required");
  }
}
```

**NEW Validation** (Simplified):
```javascript
// ✅ Simple validation
const createStockRequestSchema = {
  requested_from: Joi.string().uuid().required(),
  items: Joi.array().min(1).items(
    Joi.object({
      product_id: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).required()
    })
  ).required(),
  notes: Joi.string().optional().allow(''),
  status: Joi.string().valid('pending').default('pending')
};

// Validate
const { error, value } = createStockRequestSchema.validate(req.body);
if (error) {
  return res.status(400).json({ 
    error: 'Validation error',
    details: error.details.map(d => d.message)
  });
}
```

---

### 4. Sales API (Keep Customer Details Here)

Customer details should **only** be captured in the sales API, not stock requests.

#### `POST /api/sales` (Create Sale)

**B2B Sale:**
```json
{
  "type": "B2B",
  "customer_name": "John Doe",
  "company_name": "ABC Corp",
  "gst_number": "GST123",
  "contact_person": "Jane Smith",
  "customer_email": "john@abc.com",
  "customer_phone": "+1234567890",
  "billing_address": { ... },
  "delivery_address": { ... },
  "items": [
    { "product_id": "product_1", "quantity": 2, "price": 1000 }
  ],
  "total_amount": 2000,
  "payment_status": "pending"
}
```

**B2C Sale:**
```json
{
  "type": "B2C",
  "customer_name": "Jane Doe",
  "customer_phone": "+1234567890",
  "customer_email": "jane@example.com",
  "billing_address": { ... },
  "delivery_address": { ... },
  "items": [
    { "product_id": "product_1", "quantity": 1, "price": 500 }
  ],
  "total_amount": 500,
  "payment_status": "completed"
}
```

---

## 5. Agent Inventory Management

### Agent Stock Calculation

Agents should have a **unified stock pool**. Calculate agent inventory as:

```
Agent Stock = 
  (Confirmed/Dispatched stock received from admin)
  - (Stock used in B2B sales)
  - (Stock used in B2C sales)
  + (Stock returns to admin, if any)
```

**Example Query (PostgreSQL):**
```sql
-- Get agent's current stock for a specific product
SELECT 
  p.id as product_id,
  p.name as product_name,
  COALESCE(
    (SELECT SUM(sri.quantity) 
     FROM stock_requests sr
     JOIN stock_request_items sri ON sri.stock_request_id = sr.id
     WHERE sr.requested_by_id = :agent_id
       AND sr.status IN ('confirmed', 'dispatched')
       AND sri.product_id = p.id
    ), 0
  ) - COALESCE(
    (SELECT SUM(si.quantity)
     FROM sales s
     JOIN sale_items si ON si.sale_id = s.id
     WHERE s.agent_id = :agent_id
       AND si.product_id = p.id
    ), 0
  ) as current_stock
FROM products p;
```

---

## 6. API Response Examples

### A. Get Stock Requests (`GET /api/stock-requests`)

**Response:**
```json
[
  {
    "id": "req_123",
    "requested_by_id": "agent_456",
    "requested_by": {
      "id": "agent_456",
      "name": "Agent Smith",
      "role": "agent"
    },
    "requested_from": "admin_789",
    "requested_from_user": {
      "id": "admin_789",
      "name": "Admin User",
      "role": "admin"
    },
    "status": "pending",
    "notes": "Stock request from agent",
    "requested_date": "2024-01-20T10:00:00Z",
    "items": [
      {
        "id": "item_1",
        "product_id": "prod_111",
        "product": {
          "id": "prod_111",
          "name": "Solar Panel 100W",
          "model": "SP-100"
        },
        "quantity": 10
      },
      {
        "id": "item_2",
        "product_id": "prod_222",
        "product": {
          "id": "prod_222",
          "name": "Battery 12V",
          "model": "BAT-12"
        },
        "quantity": 5
      }
    ]
  }
]
```

---

## 7. Testing Requirements

### Unit Tests

Create tests for:
- ✅ Agent creates stock request without customer details
- ✅ Stock request validation (only products + quantities)
- ✅ Admin approves and dispatches stock request
- ✅ Agent inventory calculation (unified pool)
- ✅ B2B sale with customer details
- ✅ B2C sale with customer details
- ✅ Stock deduction from agent pool on sale

### Integration Tests

Test the following workflows:

#### **Test 1: Agent Stock Request**
```
1. Login as agent
2. Create stock request (products only)
3. Verify request created without customer details
4. Verify status = "pending"
```

#### **Test 2: Admin Approval**
```
1. Login as admin
2. View pending stock request from agent
3. Approve and dispatch request
4. Verify agent inventory updated
```

#### **Test 3: Agent Creates B2B Sale**
```
1. Login as agent (who has stock)
2. Create B2B sale with customer/company details
3. Verify sale created with all details
4. Verify stock deducted from agent inventory
```

#### **Test 4: Agent Creates B2C Sale**
```
1. Login as agent (who has stock)
2. Create B2C sale with customer details
3. Verify sale created
4. Verify stock deducted from agent inventory
```

---

## 8. Migration Script

Example migration to remove customer fields from stock_requests:

```javascript
// migration: remove_customer_fields_from_stock_requests.js

exports.up = async (knex) => {
  // Backup existing data if needed
  await knex.schema.raw(`
    CREATE TABLE stock_requests_backup AS 
    SELECT * FROM stock_requests;
  `);

  // Drop columns
  await knex.schema.table('stock_requests', (table) => {
    table.dropColumn('request_type');
    table.dropColumn('customer_name');
    table.dropColumn('company_name');
    table.dropColumn('gst_number');
    table.dropColumn('contact_person');
    table.dropColumn('customer_email');
    table.dropColumn('customer_phone');
    // If addresses are separate tables, handle FK constraints
    table.dropColumn('billing_address_id');
    table.dropColumn('delivery_address_id');
  });

  console.log('✅ Removed customer fields from stock_requests');
};

exports.down = async (knex) => {
  // Restore from backup if needed
  await knex.schema.table('stock_requests', (table) => {
    table.string('request_type');
    table.string('customer_name');
    table.string('company_name');
    table.string('gst_number');
    table.string('contact_person');
    table.string('customer_email');
    table.string('customer_phone');
    table.uuid('billing_address_id');
    table.uuid('delivery_address_id');
  });
};
```

---

## 9. Breaking Changes Warning

⚠️ **IMPORTANT**: This is a breaking change!

### Impact:
- Old mobile/web clients that send B2B/B2C fields will fail validation
- Existing stock requests with customer details will still work
- New stock requests should NOT include customer details

### Mitigation:
1. **Option A**: Make customer fields optional (backward compatible)
2. **Option B**: Version the API (`/api/v2/stock-requests`)
3. **Option C**: Update all clients first, then update backend

### Recommended Approach:
```javascript
// Make fields optional for backward compatibility
const createStockRequestSchema = {
  requested_from: Joi.string().uuid().required(),
  items: Joi.array().min(1).required(),
  notes: Joi.string().optional(),
  
  // Deprecated fields (ignore if present)
  request_type: Joi.string().optional(),
  customer_name: Joi.string().optional(),
  company_name: Joi.string().optional(),
  // ... other deprecated fields
};

// Log a warning if deprecated fields are used
if (req.body.request_type || req.body.customer_name) {
  console.warn('Deprecated fields used in stock request:', req.body);
}
```

---

## 10. API Documentation Updates

### Swagger/OpenAPI Updates

```yaml
/api/stock-requests:
  post:
    summary: Create stock request (simplified)
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - requested_from
              - items
            properties:
              requested_from:
                type: string
                format: uuid
                description: Admin ID to request from
              items:
                type: array
                minItems: 1
                items:
                  type: object
                  required:
                    - product_id
                    - quantity
                  properties:
                    product_id:
                      type: string
                      format: uuid
                    quantity:
                      type: integer
                      minimum: 1
              notes:
                type: string
                description: Optional notes
              status:
                type: string
                enum: [pending]
                default: pending
            # REMOVED: request_type, customer_name, etc.
    responses:
      201:
        description: Stock request created
      400:
        description: Validation error
```

---

## 11. Key Points Summary

| What | Old Behavior | New Behavior |
|------|-------------|--------------|
| **Stock Request** | Includes B2B/B2C type + customer details | Generic: products + quantities only |
| **Customer Details** | Captured in stock request | Captured only in sales |
| **Agent Inventory** | Potentially separate B2B/B2C pools | Unified single pool |
| **Sales** | Unchanged | B2B/B2C distinction remains here |
| **Workflow** | Complex | Simplified |

---

## 12. Implementation Checklist

- [ ] Update `POST /api/stock-requests` to accept simplified request body
- [ ] Make customer detail fields optional in stock_requests table
- [ ] Remove validation for B2B/B2C fields in stock requests
- [ ] Update agent inventory calculation (unified pool)
- [ ] Ensure sales API still captures customer details
- [ ] Update API documentation (Swagger/OpenAPI)
- [ ] Write unit tests for simplified flow
- [ ] Write integration tests for full workflow
- [ ] Create database migration script
- [ ] Test backward compatibility (optional fields)
- [ ] Deploy and monitor for errors

---

## 13. Rollback Plan

If issues arise:

1. **Immediate**: Revert API validation to accept old format
2. **Database**: Keep customer fields (make them optional)
3. **Frontend**: Can toggle between old/new modal with feature flag

---

## 14. Contact & Support

For questions during implementation:
- **Frontend Team**: Available for clarification
- **Documentation**: This file
- **Test Cases**: See section 7 above

---

**Last Updated**: January 21, 2026  
**Change Type**: Workflow Simplification  
**Priority**: Medium  
**Breaking Change**: Yes (with backward compatibility option)  
**Frontend Status**: ✅ Implemented  
**Backend Status**: ⏳ Pending Implementation
