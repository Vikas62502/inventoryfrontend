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

## Checklist

- [ ] `GET /api/products/:id/serial-numbers` returns serial numbers for the product (by product_id or product_name)
- [ ] If table uses `product_name`, join/lookup product name from products table first
- [ ] Filter by `status = 'available'` (or return all and let frontend filter)
- [ ] Include `serial_number` field (your table may use a different column name)

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
