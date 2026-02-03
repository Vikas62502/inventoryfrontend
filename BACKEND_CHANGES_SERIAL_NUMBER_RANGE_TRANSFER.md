# Backend Changes: Serial Number Range Transfer (SuperAdmin → Admin)

## Overview
This document outlines the backend changes required to support **serial number range transfer** when SuperAdmin dispatches stock to Admin. This feature allows SuperAdmin to specify a range of serial numbers (from-to) when transferring stock, ensuring proper serial number tracking and ownership management.

---

## 1. API Endpoint Changes

### 1.1. POST `/api/stock-requests/:id/dispatch`

**Current Behavior:**
- Accepts `dispatch_image` (File) and `rejection_reason` (string)

**New Behavior:**
- Accepts additional parameter: `serial_number_ranges` (JSON object)

**Updated Request Body:**

```typescript
// When using FormData (if dispatch_image is provided)
{
  dispatch_image?: File,
  rejection_reason?: string,
  serial_number_ranges?: string  // JSON stringified object
}

// When using JSON (if no dispatch_image)
{
  rejection_reason?: string,
  serial_number_ranges?: {
    [product_id: string]: {
      from: string,  // Starting serial number (e.g., "SN001")
      to: string     // Ending serial number (e.g., "SN008")
    }
  }
}
```

**Example Request (with FormData):**
```javascript
const formData = new FormData()
formData.append("dispatch_image", imageFile)
formData.append("serial_number_ranges", JSON.stringify({
  "product-123": {
    from: "SN001",
    to: "SN008"
  },
  "product-456": {
    from: "SN100",
    to: "SN105"
  }
}))
```

**Example Request (JSON only):**
```json
{
  "serial_number_ranges": {
    "product-123": {
      "from": "SN001",
      "to": "SN008"
    }
  }
}
```

---

## 2. Serial Number Range Transfer Logic

### 2.1. When SuperAdmin Dispatches Stock

**Scenario:** SuperAdmin approves a stock request from Admin and wants to transfer specific serial numbers.

**Process:**
1. Validate that the current user is a SuperAdmin
2. Validate that the stock request status is "pending"
3. If `serial_number_ranges` is provided:
   - For each product in the request:
     - Validate that the product_id exists in `serial_number_ranges`
     - Validate that the range (from-to) exists in the database for that product
     - Validate that all serial numbers in the range belong to SuperAdmin (or central stock)
     - Validate that the quantity matches the number of serial numbers in the range
     - Transfer ownership of those serial numbers from SuperAdmin to the requesting Admin
     - Update serial number records with new `owner_id` (Admin's ID)
4. If `serial_number_ranges` is NOT provided:
   - Transfer stock without specific serial numbers (existing behavior)
   - Serial numbers can be assigned later or managed separately

### 2.2. Serial Number Range Validation

**Validation Rules:**
1. **Range Format:**
   - `from` and `to` must be non-empty strings (if provided)
   - Both must exist in the database for the specified product
   - `from` should be lexicographically <= `to` (or based on your serial number format)

2. **Ownership:**
   - All serial numbers in the range must belong to SuperAdmin (or be unassigned/central stock)
   - Serial numbers already assigned to other Admins cannot be transferred

3. **Quantity Match:**
   - The number of serial numbers in the range must match the requested quantity
   - Example: If quantity is 8, the range SN001-SN008 should contain exactly 8 serial numbers

4. **Availability:**
   - Serial numbers must not be in use (sold, returned, etc.)
   - Serial numbers must be available for transfer

### 2.3. Database Updates

**When transferring serial numbers:**

1. **Update `product_serial_numbers` table:**
   ```sql
   UPDATE product_serial_numbers
   SET 
     owner_id = <admin_id>,  -- Admin receiving the stock
     owner_type = 'admin',
     updated_at = NOW()
   WHERE 
     product_id = <product_id>
     AND serial_number >= <from_serial> AND serial_number <= <to_serial>
     AND (owner_id IS NULL OR owner_id = <super_admin_id>)
     AND (status = 'available' OR status IS NULL)  -- Handle NULL for backward compatibility
   ```

2. **Update stock inventory:**
   - Decrease SuperAdmin's stock for the product
   - Increase Admin's stock for the product
   - Update `admin_inventory` or equivalent table

3. **Create transfer record (optional but recommended):**
   ```sql
   INSERT INTO serial_number_transfers (
     stock_request_id,
     product_id,
     from_serial,
     to_serial,
     quantity,
     transferred_from_id,
     transferred_to_id,
     transferred_at
   ) VALUES (...)
   ```

---

## 3. Database Schema Considerations

### 3.1. Serial Number Table Structure

Ensure your `product_serial_numbers` table has:
- `id` (primary key)
- `product_id` (foreign key)
- `serial_number` (string, indexed)
- `owner_id` (nullable, foreign key to users table)
- `owner_type` (varchar: 'super-admin', 'admin', 'agent', or NULL for central stock)
- `status` (varchar, default 'available': 'available', 'sold', 'returned', 'damaged', etc.)
- `created_at`, `updated_at`

**Required Schema:**
```sql
CREATE TABLE product_serial_numbers (
  id VARCHAR(50) PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL,
  serial_number VARCHAR(255) NOT NULL UNIQUE,
  stock_addition_id VARCHAR(50),
  owner_id VARCHAR(50),
  owner_type VARCHAR(20),
  status VARCHAR(20) DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_product_id (product_id),
  INDEX idx_serial_number (serial_number),
  INDEX idx_owner_id (owner_id),
  INDEX idx_status (status)
);
```

### 3.2. Serial Number Range Query

**Example query to get serial numbers in a range:**
```sql
SELECT * FROM product_serial_numbers
WHERE 
  product_id = ?
  AND serial_number >= ?
  AND serial_number <= ?
  AND (owner_id IS NULL OR owner_id = ?)  -- SuperAdmin or unassigned
  AND status = 'available'
ORDER BY serial_number
```

**Note:** The range comparison depends on your serial number format:
- If numeric: Use numeric comparison
- If alphanumeric: Use string comparison (lexicographic)
- If custom format: Implement custom comparison logic

---

## 4. Error Handling

### 4.1. Validation Errors

**Return 400 Bad Request with details:**

```json
{
  "error": "Validation error",
  "details": [
    {
      "path": "serial_number_ranges.product-123.from",
      "message": "Serial number 'SN001' not found for this product"
    },
    {
      "path": "serial_number_ranges.product-123.to",
      "message": "Serial number 'SN008' not found for this product"
    },
    {
      "path": "serial_number_ranges.product-123",
      "message": "Range contains 6 serial numbers, but quantity is 8"
    },
    {
      "path": "serial_number_ranges.product-123",
      "message": "Some serial numbers in range are already assigned to another admin"
    }
  ]
}
```

### 4.2. Authorization Errors

**Return 403 Forbidden:**
```json
{
  "error": "Unauthorized",
  "message": "Only SuperAdmin can specify serial number ranges during dispatch"
}
```

### 4.3. Business Logic Errors

**Return 400 Bad Request:**
```json
{
  "error": "Invalid range",
  "message": "Serial number range 'SN008' to 'SN001' is invalid (from must be <= to)"
}
```

---

## 5. Implementation Example (TypeScript/Pseudo-code)

```typescript
async function dispatchStockRequest(
  requestId: string,
  userId: string,
  data: {
    dispatch_image?: File,
    rejection_reason?: string,
    serial_number_ranges?: Record<string, { from: string; to: string }>
  }
) {
  // 1. Get the stock request
  const request = await getStockRequestById(requestId)
  if (!request) {
    throw new Error("Stock request not found")
  }

  // 2. Validate user is SuperAdmin (if serial_number_ranges provided)
  const user = await getUserById(userId)
  if (data.serial_number_ranges && user.role !== "super-admin") {
    throw new Error("Only SuperAdmin can specify serial number ranges")
  }

  // 3. Validate request status
  if (request.status !== "pending") {
    throw new Error("Can only dispatch pending requests")
  }

  // 4. Process serial number ranges (if provided)
  if (data.serial_number_ranges) {
    for (const item of request.items) {
      const range = data.serial_number_ranges[item.product_id]
      
      if (range) {
        // Validate range exists
        const serialNumbers = await getSerialNumbersInRange(
          item.product_id,
          range.from,
          range.to
        )

        // Validate quantity matches
        if (serialNumbers.length !== item.quantity) {
          throw new Error(
            `Range contains ${serialNumbers.length} serial numbers, but quantity is ${item.quantity}`
          )
        }

        // Validate all serials belong to SuperAdmin or are unassigned
        const invalidSerials = serialNumbers.filter(
          sn => sn.owner_id && sn.owner_id !== userId && sn.owner_type !== "super-admin"
        )
        if (invalidSerials.length > 0) {
          throw new Error("Some serial numbers are already assigned to another admin")
        }

        // Transfer serial numbers
        await transferSerialNumbers(
          serialNumbers.map(sn => sn.id),
          userId,  // from: SuperAdmin
          request.requested_by_id  // to: Admin
        )
      }
    }
  }

  // 5. Update stock inventory
  await updateStockInventory(request.items, userId, request.requested_by_id)

  // 6. Update request status
  await updateStockRequestStatus(requestId, "dispatched", {
    dispatch_image: data.dispatch_image,
    dispatched_at: new Date()
  })

  return updatedRequest
}

async function getSerialNumbersInRange(
  productId: string,
  fromSerial: string,
  toSerial: string
): Promise<SerialNumber[]> {
  // Adjust query based on your serial number format
  return await db.query(`
    SELECT * FROM product_serial_numbers
    WHERE 
      product_id = ?
      AND serial_number >= ?
      AND serial_number <= ?
      AND (owner_id IS NULL OR owner_type = 'super-admin')
      AND status = 'available'
    ORDER BY serial_number
  `, [productId, fromSerial, toSerial])
}

async function transferSerialNumbers(
  serialNumberIds: string[],
  fromUserId: string,
  toUserId: string
) {
  await db.query(`
    UPDATE product_serial_numbers
    SET 
      owner_id = ?,
      owner_type = 'admin',
      updated_at = NOW()
    WHERE id IN (?)
  `, [toUserId, serialNumberIds])
}
```

---

## 6. Testing Scenarios

### 6.1. Happy Path
- SuperAdmin dispatches stock with valid serial number range
- All serial numbers in range are available and belong to SuperAdmin
- Quantity matches the number of serial numbers in range
- Serial numbers are successfully transferred to Admin

### 6.2. Edge Cases
- SuperAdmin dispatches without serial number ranges (existing behavior)
- Admin tries to specify serial number ranges (should fail)
- Serial number range doesn't exist
- Serial numbers already assigned to another Admin
- Quantity doesn't match serial number count
- Invalid range (from > to)
- Partial range (some serials exist, some don't)

### 6.3. Error Cases
- Non-SuperAdmin user tries to use serial_number_ranges
- Stock request not in "pending" status
- Product doesn't exist
- Serial numbers not available (sold, returned, etc.)

---

## 7. Migration Notes

### 7.1. Existing Stock Requests
- Existing stock requests without serial number ranges should continue to work
- No migration needed for existing data

### 7.2. Serial Number Format
- Ensure your serial number comparison logic handles your format correctly
- If using alphanumeric: "SN001" < "SN002" < "SN010" < "SN100"
- If using numeric: 1 < 2 < 10 < 100
- Consider padding serial numbers for consistent sorting (e.g., "SN0001" instead of "SN1")

---

## 8. API Response

### 8.1. Success Response

```json
{
  "id": "request-123",
  "status": "dispatched",
  "items": [
    {
      "product_id": "product-123",
      "quantity": 8,
      "serial_numbers": [
        "SN001",
        "SN002",
        "SN003",
        "SN004",
        "SN005",
        "SN006",
        "SN007",
        "SN008"
      ]
    }
  ],
  "dispatched_at": "2025-01-15T10:30:00Z",
  "dispatch_image": "https://..."
}
```

### 8.2. Error Response

```json
{
  "error": "Validation error",
  "details": [
    {
      "path": "serial_number_ranges.product-123",
      "message": "Serial number range 'SN001' to 'SN008' contains 6 available serial numbers, but quantity is 8"
    }
  ]
}
```

---

## 9. Frontend Integration Notes

The frontend will:
1. Only show serial number range inputs for SuperAdmin users
2. Fetch available serial numbers for each product before showing range inputs
3. Send `serial_number_ranges` as JSON string in FormData (if dispatch_image is present) or as JSON object (if no image)
4. Handle validation errors and display them to the user

---

## 10. Summary of Changes

### Required Changes:
1. ✅ Update `POST /api/stock-requests/:id/dispatch` to accept `serial_number_ranges`
2. ✅ Implement serial number range validation
3. ✅ Implement serial number ownership transfer logic
4. ✅ Update stock inventory when serial numbers are transferred
5. ✅ Add proper error handling and validation messages
6. ✅ Ensure only SuperAdmin can use serial_number_ranges

### Optional Enhancements:
- Create `serial_number_transfers` table for audit trail
- Add endpoint to query available serial number ranges for a product
- Add endpoint to validate a serial number range before dispatch
- Support partial ranges (if some serials are missing)

---

## 11. Questions for Backend Team

1. **Serial Number Format:** What format are serial numbers using? (numeric, alphanumeric, custom)
2. **Range Comparison:** How should we compare serial numbers? (lexicographic, numeric, custom logic)
3. **Ownership Model:** How is serial number ownership currently tracked? (owner_id, owner_type, etc.)
4. **Central Stock:** Are serial numbers without an owner considered "central stock" or "SuperAdmin stock"?
5. **Partial Transfers:** Should we support partial transfers if some serials in range are unavailable?
6. **Audit Trail:** Do we need a separate table to track serial number transfers?

---

## Last Updated
January 15, 2025

## Related Documents
- `BACKEND_CHANGES_SERIAL_NUMBERS.md` - Initial serial number implementation
- `BACKEND_CHANGES_CENTRALIZED_STOCK.md` - Centralized stock management
