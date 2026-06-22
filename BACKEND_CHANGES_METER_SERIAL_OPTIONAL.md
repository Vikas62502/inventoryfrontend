# Backend Changes: Meter Products — Serial Numbers Optional

**Last Updated:** June 2026  
**For:** Backend Team  
**Priority:** High — blocks product creation in production  
**Frontend status:** Done — Meter no longer requires serials on create/add stock or dispatch

---

## Problem

When creating a **Meter** product with quantity (e.g. 30) and **no** serial numbers, the backend returns:

```json
{
  "error": "Serial numbers are required for Panels, Inverters, and Meter categories. Please enter or scan serial numbers."
}
```

(or similar validation on `POST /api/products` / `PUT /api/products/:id`)

**Frontend no longer sends serials for Meters.** Backend must stop requiring them.

---

## Required rule (single source of truth)

Serial numbers are **mandatory only for Panels and Inverters** — on **product create**, **add stock**, and **stock request dispatch**.

| Category | Serial required on create/add stock? | Serial required on dispatch? |
|----------|--------------------------------------|------------------------------|
| Panels / Solar Panels | ✅ Yes | ✅ Yes |
| Inverters | ✅ Yes | ✅ Yes |
| **Meters** | ❌ **No** | ❌ **No** |
| Cables, nuts, J-hooks, etc. | ❌ No | ❌ No |

**Meters are quantity-tracked only** (unit = MTR). Cost price is stored on the product (`unit_price`), not per serial.

---

## Shared helper (mirror frontend)

Frontend uses `isSerialRequiredForDispatch(category, productName)` in `lib/utils.ts`. Backend should implement the same logic:

```typescript
const SERIAL_REQUIRED_CATEGORIES = new Set([
  "panels", "panel", "solar panels", "solar panel",
  "inverter", "inverters",
])

function requiresSerialNumbers(
  category?: string | null,
  productName?: string | null
): boolean {
  const normalized = (category || "").toLowerCase().trim()
  if (normalized) {
    if (SERIAL_REQUIRED_CATEGORIES.has(normalized)) return true
    if (normalized.includes("panel") || normalized.includes("inverter")) return true
    // Explicitly NOT meter/meters
    if (normalized === "meter" || normalized === "meters") return false
  }
  const name = (productName || "").toLowerCase()
  if (name.includes("inverter") || name.includes("kwp") || name.includes("panel")) return true
  return false
}
```

**Do not** treat `category === "Meters"` or product name containing `"meter"` as serial-required.

---

## Endpoints to change

### 1. `POST /api/products`

**Current (wrong):** Rejects create when `quantity > 0`, category is Meter, and `serial_numbers` is missing.

**Required:**

```typescript
const qty = Number(quantity) || 0
const needsSerial = requiresSerialNumbers(category, name)

if (qty > 0 && needsSerial) {
  const serials = parseSerialNumbers(req.body.serial_numbers)
  if (!serials?.length && !req.body.serial_number_excel) {
    return res.status(400).json({
      error: "Serial numbers are required for Panels and Inverters.",
    })
  }
  if (serials?.length && serials.length !== qty) {
    return res.status(400).json({
      error: `Expected ${qty} serial numbers, got ${serials.length}.`,
    })
  }
  // insert product + serial rows
} else {
  // Meter and other categories: create product with quantity only
  // serial_numbers optional — if provided, still validate count === qty
}
```

**Example — Meter create (must return 201):**

```http
POST /api/products
Content-Type: multipart/form-data

name: SCHNEIDER 3 PHASE SOLAR METER
model: SCH-3P-MTR
category: Meters
quantity: 30
unit: MTR
unit_price: 2900
```

No `serial_numbers` field → product created with `quantity: 30`, zero rows in `product_serial_numbers`.

---

### 2. `PUT /api/products/:id` (add stock)

**Current (wrong):** Requires `serial_numbers` when `stock_to_add > 0` and category is Meter.

**Also wrong on edit:** Rejects metadata-only updates (name, model, unit, price) when product is Meter with `quantity > 0` and no serial rows — e.g. `"Serial numbers are required for this category"`.

**Required:**

```typescript
const stockToAdd = Number(stock_to_add) || 0
const product = await getProduct(id)
const needsSerial = requiresSerialNumbers(product.category, product.name)

// Metadata-only update (no stock_to_add, no serial_numbers) → allow for ALL categories
if (stockToAdd === 0 && !serial_numbers && !serial_number_excel) {
  await updateProductFields(id, { name, model, category, unit, unit_price, selling_price, ... })
  return res.json(updated)
}

if (stockToAdd > 0 && needsSerial) {
  const serials = parseSerialNumbers(serial_numbers)
  if (!serials?.length && !serial_number_excel) {
    return res.status(400).json({
      error: "Serial numbers are required for Panels and Inverters when adding stock.",
    })
  }
  // validate serials.length === stockToAdd, insert rows, increment quantity
} else if (stockToAdd > 0) {
  // Meter / optional categories: increment quantity only
  await incrementProductQuantity(id, stockToAdd)
}
```

**Example — Edit Meter product (metadata only, must return 200):**

```http
PUT /api/products/:id
Content-Type: application/json

{
  "name": "L&T 3 PHASE SOLAR METER",
  "model": "L&T 3 PHASE SOLAR METER",
  "category": "Meters",
  "unit": "Quantity"
}
```

No `quantity`, no `stock_to_add`, no `serial_numbers` → **200**. Do not require serials for existing Meter stock.

**Example — Add 10 meters without serials:**

```http
PUT /api/products/:id
Content-Type: multipart/form-data

stock_to_add: 10
```

→ `quantity` increases by 10; no serial rows created.

---

### 3. `POST /api/stock-requests/:id/dispatch`

Already documented in **`BACKEND_CHANGES_STOCK_REQUEST_DISPATCH.md` §5** — Meters dispatch by quantity; omit meter `product_id` from `serial_numbers` map.

---

## Where to find backend validation (search hints)

Remove or gate any logic like:

```javascript
// REMOVE or replace with requiresSerialNumbers()
if (["panels", "inverters", "meter", "meters"].includes(category.toLowerCase())) {
  if (!serial_numbers?.length) return error(...)
}
```

Common locations: product create handler, product update handler, middleware validating multipart fields, category-based serial middleware.

---

## Error messages to update

| Old message | New message |
|-------------|-------------|
| `Serial numbers are required for Panels, Inverters, and Meter categories` | `Serial numbers are required for Panels and Inverters.` |
| `Serial numbers are required when adding stock` (for all categories) | Only return for Panels/Inverters |

---

## Test plan

| # | Action | Expected |
|---|--------|----------|
| 1 | `POST /api/products` — category `Meters`, `quantity: 30`, no `serial_numbers` | **201**, product with `quantity: 30` |
| 2 | `PUT /api/products/:id` — Meter product, edit name/unit only, no quantity in body | **200** |
| 3 | `PUT /api/products/:id` — Meter product, `stock_to_add: 5`, no serials | **200**, quantity +5 |
| 4 | `POST /api/products` — category `Panels`, `quantity: 2`, no serials | **400**, serial required |
| 5 | `POST /api/products` — category `Inverters`, `quantity: 1`, 1 serial | **201**, 1 serial row |
| 6 | `POST /api/products` — category `Meters`, `quantity: 30`, 30 serials (optional) | **201** if backend accepts optional serials with matching count |
| 7 | Dispatch stock request with meter line, no meter entry in `serial_numbers` | **200** (see dispatch doc) |

---

## Related documents

| Document | Section |
|----------|---------|
| `BACKEND_CHANGES_REQUIRED.md` | §6 Serial numbers by category |
| `BACKEND_TEAM_SUMMARY.md` | Priority 0.6 |
| `BACKEND_CHANGES_STOCK_REQUEST_DISPATCH.md` | §5 Serial numbers — Panels & Inverters only |
| `BACKEND_CHANGES_SERIAL_NUMBERS.md` | §2.1 validation (category-aware) |

---

**Contact:** Frontend Team
