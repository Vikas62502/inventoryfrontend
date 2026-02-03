# Backend Changes: Serial Number Viewing in Product Edit Modal

## Overview
The frontend now displays assigned serial numbers in the product edit modal. Users can view all serial numbers assigned to a product by clicking an eye icon button. This document outlines the backend API requirements for this feature.

---

## API Endpoint

### GET `/api/products/:id/serial-numbers`

**Purpose:** Retrieve all serial numbers assigned to a specific product for display in the product edit modal.

**Authentication:** Required

**Authorization:**
- **Super Admin:** Can view all serial numbers for any product
- **Admin:** Can view serial numbers for products in their inventory
- **Agent:** Can view serial numbers for products they have access to

---

## Request Format

```
GET /api/products/{productId}/serial-numbers
Headers:
  Authorization: Bearer <jwt_token>
```

**Path Parameters:**
- `productId` (string, required) - The ID of the product

**Query Parameters (Optional):**
- `status` (string) - Filter by status (e.g., `available`, `sold`, `returned`)
- `owner_id` (string) - Filter by owner ID
- `limit` (number) - Limit number of results (for pagination)
- `offset` (number) - Pagination offset

**Example Requests:**
```
GET /api/products/product-123/serial-numbers
GET /api/products/product-123/serial-numbers?status=available
GET /api/products/product-123/serial-numbers?limit=100&offset=0
```

---

## Response Format

### Success Response (200 OK)

**Important:** The response must be an **array** (not a wrapped object).

```json
[
  {
    "id": "sn-001",
    "product_id": "product-123",
    "serial_number": "SN001",
    "owner_id": null,
    "owner_type": null,
    "status": "available",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  },
  {
    "id": "sn-002",
    "product_id": "product-123",
    "serial_number": "SN002",
    "owner_id": "admin-456",
    "owner_type": "admin",
    "status": "available",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  }
]
```

### Empty Response (200 OK)

If no serial numbers exist, return an empty array:

```json
[]
```

### Error Responses

**404 Not Found:**
```json
{
  "error": "Product not found"
}
```

**403 Forbidden:**
```json
{
  "error": "Unauthorized",
  "message": "You do not have permission to view serial numbers for this product"
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

---

## Response Fields

Each serial number object must include:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the serial number |
| `product_id` | string | Yes | ID of the product this serial number belongs to |
| `serial_number` | string | Yes | The actual serial number (e.g., "SN001") |
| `owner_id` | string \| null | Yes | ID of the user/admin/agent who owns this serial number (null for central stock) |
| `owner_type` | string \| null | Yes | Type of owner: `"super-admin"`, `"admin"`, `"agent"`, or `null` |
| `status` | string | Yes | Current status: `"available"`, `"sold"`, `"returned"`, `"damaged"`, etc. |
| `created_at` | string | Yes | ISO 8601 timestamp when serial number was created |
| `updated_at` | string | Yes | ISO 8601 timestamp when serial number was last updated |

---

## Database Query

**Basic Query:**
```sql
SELECT 
  id,
  product_id,
  serial_number,
  owner_id,
  owner_type,
  status,
  created_at,
  updated_at
FROM product_serial_numbers
WHERE product_id = ?
ORDER BY created_at DESC
```

**With Status Filter:**
```sql
SELECT * FROM product_serial_numbers
WHERE product_id = ? AND status = ?
ORDER BY created_at DESC
```

**With Pagination:**
```sql
SELECT * FROM product_serial_numbers
WHERE product_id = ?
ORDER BY created_at DESC
LIMIT ? OFFSET ?
```

---

## Authorization Logic

### Super Admin
- Can view serial numbers for **any product**
- No restrictions

### Admin
- Can view serial numbers for products **in their inventory**
- Must check if product exists in `admin_inventory` table for the admin's ID

**Pseudo-code:**
```typescript
const hasAccess = await db.query(`
  SELECT COUNT(*) FROM admin_inventory
  WHERE product_id = ? AND admin_id = ?
`, [productId, adminId]);

if (hasAccess === 0) {
  throw new Error("Unauthorized");
}
```

### Agent
- Can view serial numbers for products **they have access to**
- Must check if product exists in agent's accessible stock (via their admin's inventory)

**Pseudo-code:**
```typescript
// Get agent's admin
const agent = await getUserById(agentId);
const adminId = agent.created_by_id || agent.admin_id;

// Check if product is in admin's inventory
const hasAccess = await db.query(`
  SELECT COUNT(*) FROM admin_inventory
  WHERE product_id = ? AND admin_id = ?
`, [productId, adminId]);

if (hasAccess === 0) {
  throw new Error("Unauthorized");
}
```

---

## Implementation Example (TypeScript/Node.js)

```typescript
import { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';

async function getSerialNumbersByProduct(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id: productId } = req.params;
    const userId = req.user.id; // From authentication middleware
    const userRole = req.user.role; // From authentication middleware
    
    // Check if product exists
    const product = await db.query(
      'SELECT id FROM products WHERE id = ?',
      [productId]
    );
    
    if (!product || product.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    
    // Authorization check
    if (userRole === 'super-admin') {
      // Super Admin can view all
    } else if (userRole === 'admin') {
      // Check if product is in admin's inventory
      const hasAccess = await db.query(
        'SELECT COUNT(*) as count FROM admin_inventory WHERE product_id = ? AND admin_id = ?',
        [productId, userId]
      );
      
      if (hasAccess[0].count === 0) {
        res.status(403).json({
          error: 'Unauthorized',
          message: 'You do not have permission to view serial numbers for this product'
        });
        return;
      }
    } else if (userRole === 'agent') {
      // Get agent's admin
      const agent = await db.query(
        'SELECT created_by_id, admin_id FROM users WHERE id = ?',
        [userId]
      );
      
      const adminId = agent[0].created_by_id || agent[0].admin_id;
      
      if (!adminId) {
        res.status(403).json({
          error: 'Unauthorized',
          message: 'Agent not assigned to an admin'
        });
        return;
      }
      
      // Check if product is in admin's inventory
      const hasAccess = await db.query(
        'SELECT COUNT(*) as count FROM admin_inventory WHERE product_id = ? AND admin_id = ?',
        [productId, adminId]
      );
      
      if (hasAccess[0].count === 0) {
        res.status(403).json({
          error: 'Unauthorized',
          message: 'You do not have permission to view serial numbers for this product'
        });
        return;
      }
    } else {
      res.status(403).json({
        error: 'Unauthorized',
        message: 'Invalid user role'
      });
      return;
    }
    
    // Build query with optional filters
    let query = 'SELECT * FROM product_serial_numbers WHERE product_id = ?';
    const params: any[] = [productId];
    
    if (req.query.status) {
      query += ' AND status = ?';
      params.push(req.query.status);
    }
    
    if (req.query.owner_id) {
      query += ' AND owner_id = ?';
      params.push(req.query.owner_id);
    }
    
    query += ' ORDER BY created_at DESC';
    
    // Add pagination if provided
    if (req.query.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(req.query.limit as string));
      
      if (req.query.offset) {
        query += ' OFFSET ?';
        params.push(parseInt(req.query.offset as string));
      }
    }
    
    // Execute query
    const serialNumbers = await db.query(query, params);
    
    // Return array (not wrapped object)
    res.status(200).json(serialNumbers);
    
  } catch (error) {
    console.error('Error fetching serial numbers:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch serial numbers'
    });
  }
}

// Route definition
router.get(
  '/products/:id/serial-numbers',
  authenticateToken,
  getSerialNumbersByProduct
);
```

---

## Testing Scenarios

### 1. Happy Path
- ✅ Super Admin requests serial numbers → Returns all serial numbers
- ✅ Admin requests serial numbers for product in their inventory → Returns serial numbers
- ✅ Agent requests serial numbers for product in their admin's inventory → Returns serial numbers
- ✅ Product has no serial numbers → Returns empty array `[]`

### 2. Authorization Tests
- ✅ Admin requests serial numbers for product NOT in their inventory → 403 Forbidden
- ✅ Agent requests serial numbers for product NOT in their admin's inventory → 403 Forbidden
- ✅ Unauthenticated request → 401 Unauthorized

### 3. Error Cases
- ✅ Product doesn't exist → 404 Not Found
- ✅ Invalid product ID format → 400 Bad Request
- ✅ Database error → 500 Internal Server Error

### 4. Filtering Tests
- ✅ Filter by status=available → Returns only available serial numbers
- ✅ Filter by owner_id → Returns only serial numbers for that owner
- ✅ Pagination with limit and offset → Returns correct subset

---

## Performance Considerations

1. **Indexing:**
   - Ensure `product_id` is indexed
   - Ensure `status` is indexed if filtering by status
   - Ensure `owner_id` is indexed if filtering by owner

2. **Pagination:**
   - For products with many serial numbers (100+), implement pagination
   - Default limit: 100 (or no limit if product has few serial numbers)

3. **Caching:**
   - Consider caching results with TTL (e.g., 5 minutes)
   - Invalidate cache when serial numbers are added/updated/deleted

---

## Frontend Integration

The frontend will:
1. Call this endpoint when the product edit modal opens (if editing existing product)
2. Display the count of serial numbers
3. Show an eye icon button if serial numbers exist
4. Open a modal showing all serial numbers when the button is clicked
5. Handle empty arrays gracefully (shows "No serial numbers assigned")

---

## Priority

**HIGH** - Required for product management UI functionality

---

## Related Documents

- `BACKEND_CHANGES_SERIAL_NUMBERS.md` - Complete serial number implementation guide
- `BACKEND_CHANGES_SERIAL_NUMBER_RANGE_TRANSFER.md` - Serial number range transfer feature

---

## Last Updated

January 15, 2025
