# Backend Fix: Serial Numbers Not Showing in Dispatch Modal

**Issue:** The Review & Dispatch modal shows "Available serial numbers: 0" even though `product_serial_numbers` has 21 rows with `status = 'available'` for "L&T 1 PHASE SOLAR METER".

**Root cause:** The API `GET /api/products/:id/serial-numbers` is not returning the data, or the backend links serial numbers differently (e.g. by `product_name` or `owner_id` instead of `product_id`).

---

## Database Structure (from your table)

Your `product_serial_numbers` table has:
- `owner_id`, `owner_type` (e.g. "super-admin")
- `product_name`, `category`
- `status` (e.g. "available")
- `cost_price`, `price`

**If the table does NOT have `product_id`:** The backend must query by `product_name` to link serial numbers to products.

---

## Required: GET /api/products/:id/serial-numbers

**Must return** all serial numbers for the product. Implementation options:

### Option A: Table has product_id
```sql
SELECT id, product_id, serial_number, cost_price, product_name, category, status, created_at
FROM product_serial_numbers
WHERE product_id = :productId
  AND (status IS NULL OR status = 'available')
```

### Option B: Table has product_name only (no product_id)
```sql
-- First get product name from products table
SELECT name FROM products WHERE id = :productId;

-- Then query serial numbers by product name
SELECT id, serial_number, cost_price, product_name, category, status, created_at
FROM product_serial_numbers
WHERE product_name = :productName
  AND (status IS NULL OR status = 'available')
  AND owner_type = 'super-admin'  -- if filtering by owner
```

### Option C: Alternative endpoints (frontend will try these)
- `GET /api/serial-numbers?product_id=:id`
- `GET /api/serial-numbers?product_name=:name`
- `GET /api/product-serial-numbers?product_id=:id`

---

## Response Format

```json
[
  {
    "id": "1",
    "product_id": "prod-123",
    "serial_number": "U6077580",
    "cost_price": 1800,
    "product_name": "L&T 1 PHASE SOLAR METER",
    "category": "Meters",
    "status": "available",
    "created_at": "2026-02-18T10:00:00Z"
  }
]
```

---

## Critical Bug: Serial Shows Available but Dispatch Fails

### Error

```
Some serial numbers are invalid or not available for product 5.4KWP - GTI - 1PH - 1MPPT - VSOLE
```

### Symptom

- `GET /api/products/:id/serial-numbers` returns serial `2602420290` with `status = 'available'`
- User selects it in the dispatch modal
- `POST /api/stock-requests/:id/dispatch` rejects the same serial

### Root cause (common)

`GET` and `POST dispatch` use **different lookup logic**:

| Step | Wrong (causes bug) | Correct |
|------|-------------------|---------|
| GET serials | Query by `product_name` OR embedded `products.serial_numbers` array | Query `product_serial_numbers` with consistent rules |
| POST dispatch | Validate serial only by `product_id` from request payload key | Also match by `product_name` + `serial_number` if `product_id` differs in table |

Example: serial row has `product_name = '5.4KWP-GTI-1PH-1MPPT-VSOLE'` but `product_id` is NULL or a different UUID than the stock request line → GET finds it, dispatch rejects it.

### Backend fix — unified serial lookup

Use **one shared function** for GET and dispatch:

```typescript
async function findAvailableSerialsForProduct(productId: string): Promise<SerialRow[]> {
  const product = await Product.findByPk(productId)
  if (!product) return []

  return db.query(`
    SELECT * FROM product_serial_numbers
    WHERE status = 'available'
      AND (owner_type = 'super-admin' OR owner_type IS NULL)
      AND (
        product_id = :productId
        OR product_name = :productName
        OR TRIM(product_name) = TRIM(:productName)
      )
  `, { productId, productName: product.name })
}

async function validateSerialForDispatch(
  productId: string,
  serialNumber: string
): Promise<SerialRow | null> {
  const available = await findAvailableSerialsForProduct(productId)
  return available.find(s => s.serial_number === serialNumber) ?? null
}
```

**Rule:** If a serial is returned by GET for `productId`, dispatch **must accept** it for the same `productId`.

### Dispatch payload — parse `serial_numbers`

Frontend sends (JSON body):

```json
{
  "serial_numbers": "{\"prod-uuid-54\":[\"2602420290\"],\"prod-uuid-6kw\":[\"2602420999\"]}"
}
```

Or multipart field `serial_numbers` as the same JSON string.

**Backend must:** `JSON.parse(serial_numbers)` when value is a string.

### Debug SQL

```sql
SELECT id, product_id, product_name, serial_number, status, owner_type, owner_id
FROM product_serial_numbers
WHERE serial_number = '2602420290';
```

Compare `product_id` with the stock request line’s `product_id`. If they differ, fix data or use `product_name` fallback in dispatch validation.

---

## Checklist

- [ ] `GET /api/products/:id/serial-numbers` returns serial numbers for the product (by product_id **or** product_name)
- [ ] **Dispatch uses the same lookup** as GET — serial shown as available must pass dispatch validation
- [ ] If table uses `product_name` only, join product name from `products` table on both GET and dispatch
- [ ] Filter by `status = 'available'` for dispatch selection
- [ ] Include `serial_number` field (your table may use a different column name)
- [ ] Parse `serial_numbers` JSON string on `POST .../dispatch` (application/json and multipart)
- [ ] Do **not** rely on stale `products.serial_numbers` JSON column for availability — use `product_serial_numbers` table

---

## Admin & Agent: View Serial Numbers

**Admin dashboard:** "My Stock" tab has "View Serials" button per product. Fetches serial numbers for that product.

**Agent dashboard:** "Admin Stock" tab has "View Serial Numbers" button. Agent sees their admin's stock and serial numbers.

**API:** Frontend tries (in order):
1. `GET /admin-inventory/admin/:adminId/products/:productId/serial-numbers` (admin-scoped)
2. `GET /serial-numbers?owner_id=:adminId&owner_type=admin&product_id=:productId`
3. Fallback: `GET /products/:productId/serial-numbers`

**Backend:** When admin has serial numbers (e.g. after dispatch with `owner_id` = admin), return them from admin-scoped endpoint. Agent uses `adminId` = their `created_by_id` to fetch their admin's serials.

---

**Contact:** Frontend Team
