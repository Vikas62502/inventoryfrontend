# Backend Changes: Stock Request Dispatch

**Date:** June 2026  
**Frontend:** `components/modals/enhanced-request-approval-modal.tsx`, `lib/api.ts`  
**Related:** `BACKEND_SERIAL_NUMBERS_DISPATCH_FIX.md`, `BACKEND_CHANGES_AS_PER_FRONTEND.md` §4

---

## Summary (for backend team)

| Issue | Required backend action |
|-------|-------------------------|
| `You do not have permission to update this request` | **Do not** require `PUT /stock-requests/:id` before dispatch. **Do not** run requester-only update logic inside `POST .../dispatch` when `serial_numbers` is sent. |
| Partial dispatch (e.g. requested 3, dispatch 1) | Use **`serial_numbers` count** (or range size) as dispatched qty per line. Persist that qty on dispatch — no separate PUT. |
| Generic `Insufficient stock` on partial dispatch | **Bug:** backend compares `central_stock` to **original requested qty** (e.g. 3) instead of **dispatch qty** (1 serial). Fix: use `len(serial_numbers[product_id])`. |
| `Insufficient stock for product X in central inventory` | Return **per-product** `details[]` with `product_id` / `product_name` so frontend shows error on that line only. |
| Available serial numbers: 0 | Fix `GET /api/products/:id/serial-numbers` — see `BACKEND_SERIAL_NUMBERS_DISPATCH_FIX.md`. |
| Serial required on **all** products | **Wrong.** Serials mandatory only for **Panels & Inverters**. Meters, cables, etc. dispatch by quantity only. |
| `Some serial numbers are invalid or not available for product {name}` | **GET vs dispatch mismatch** — use same serial lookup on GET and POST (by `product_id` OR `product_name`). See `BACKEND_SERIAL_NUMBERS_DISPATCH_FIX.md` §Critical Bug. |
| `serial_numbers` parse error on dispatch | Frontend sends JSON **string** in JSON body: `"serial_numbers": "{\"prod-id\":[\"SN1\"]}"` — backend must `JSON.parse()`. |
| `products_quantity_check` constraint violation | Backend deducts **requested qty** (e.g. 2) instead of **dispatch qty** (1 serial) → `quantity` goes negative. See §4.1. |
| `cannot exceed originally requested quantity` | Backend mis-reads `items` or rejects valid partial dispatch (dispatch 1 &lt; requested 2). Do not require `items`; use `len(serial_numbers)`. See §4.2. |
| `Admin not found` on modal load | Super-admin must **not** call `GET /admin-inventory/admin/:id` (frontend fixed). Backend can return `[]` instead of 404 for non-admin IDs if desired. |
| Multi-item request fails when one line is partial | Process **each line independently** — do not deduct `requested_qty` for lines missing from `serial_numbers` map. See §4.3. |
| Frontend blocks partial dispatch (pre-API) | Until backend fixed, UI blocks dispatch when `dispatch_qty < requested_qty` on any Panels/Inverters line. Backend must enable partial dispatch per §3–4. |

---

## Quick reference — dispatch quantity (copy for backend)

```typescript
// POST /api/stock-requests/:id/dispatch handler (per request line)
async function resolveDispatchQty(line, body): number {
  const { product_id, quantity: requested_qty } = line
  const serials = parseJsonMap(body.serial_numbers)?.[product_id]
  if (serials?.length) return serials.length                    // Panels/Inverters
  const range = parseJsonMap(body.serial_number_ranges)?.[product_id]
  if (range) return countAvailableSerialsInRange(product_id, range)
  return requested_qty                                            // non-serial categories only
}

// Per line BEFORE any UPDATE:
const dispatch_qty = await resolveDispatchQty(line, body)
if (dispatch_qty < 1 || dispatch_qty > line.quantity) throw 400
if (product.central_stock < dispatch_qty) throw 400 with details
product.central_stock -= dispatch_qty                           // once per line
line.dispatched_quantity = dispatch_qty
```

**Never:** `product.central_stock -= line.quantity` when `serial_numbers` sent fewer serials than requested.

---

## 1. Permission Error

### Error

```json
{ "error": "You do not have permission to update this request" }
```

### When it happens

Super Admin clicks **Approve & Dispatch** on a pending stock request (e.g. from CHAIRBORD HEAD OFFICE), often when dispatching **less than requested** (requested 3, dispatch 1 with 1 serial selected).

### Root cause

`PUT /api/stock-requests/:id` is **requester-only**. Super Admin is not the requester.

This error also occurred when:
1. Frontend called `PUT` before `POST .../dispatch` (fixed — frontend no longer does this).
2. Backend `POST .../dispatch` internally called the same update handler when it received an `items` field (frontend **no longer sends `items`**).

### Backend fix

On **`POST /api/stock-requests/:id/dispatch`**:

- Allow **`super-admin`** and **`admin`** to dispatch without being the requester.
- Apply quantity changes **inside the dispatch transaction** — never delegate to the PUT/update handler that checks requester ownership.
- **Never return** `You do not have permission to update this request` from the dispatch endpoint.

---

## 2. POST /api/stock-requests/:id/dispatch — Contract

**Roles:** `super-admin`, `admin`

### Request body (what frontend sends today)

| Field | Type | Sent? | Notes |
|-------|------|-------|-------|
| `serial_numbers` | `Record<product_id, string[]>` | **Panels & Inverters only** | Omitted for Meters, cables, other categories |
| `serial_number_ranges` | `Record<product_id, { from, to }>` | Optional | Alternative to pick-list |
| `dispatch_image` | File | Optional | multipart only |
| `rejection_reason` | string | Reject only | |
| `items` | `Array<{ product_id, quantity }>` | **No** | Frontend does **not** send — backend rejects with "cannot exceed originally requested" or permission errors. Use `serial_numbers` count only. |

### JSON example — mixed request (partial dispatch, no image)

Request has **inverters** (serials required) + **meters** (no serials):

```json
{
  "serial_numbers": {
    "prod-inverter-54": ["2602420290"],
    "prod-inverter-6kw": ["2602420999"]
  }
}
```

`serial_numbers` contains **only** Panels/Inverters. Meter lines are **not** in the map — backend uses request line quantity for those lines.

**Backend must (per line):**
- **Panels / Inverters:** `dispatch_qty = len(serial_numbers[product_id])` (e.g. 1, not requested 3).
- **All other categories (Meters, cables, etc.):** `dispatch_qty = request_line.quantity` (or modal qty when supported) — **do not require** `serial_numbers`.
- Deduct `central_stock` by `dispatch_qty`.
- Store final `dispatch_qty` on each stock request line.

### multipart/form-data (with image)

| Form field | Value |
|------------|-------|
| `dispatch_image` | File |
| `serial_numbers` | `'{"prod-id":["SN001","SN002"]}'` (JSON string) |
| `serial_number_ranges` | `'{"prod-id":{"from":"SN001","to":"SN010"}}'` (JSON string) |

Parse JSON strings when `Content-Type` is `multipart/form-data`.

---

## 3. Dispatch Handler Logic

```
1. Auth: super-admin or admin
2. Validate status === 'pending'
3. For each line on the stock request:
   a. requires_serial = product.category is Panels or Inverters (see §5)
   b. Resolve dispatch_qty:
      - If requires_serial AND serial_numbers[product_id] present → len(array)
      - Else if requires_serial AND serial_number_ranges[product_id] present → count available serials in range
      - Else → request line quantity (non-serial categories)
   c. Validate: 1 <= dispatch_qty <= original requested quantity
   d. If requires_serial: serial_numbers required; each serial exists, status = 'available'
   e. If NOT requires_serial: ignore serial_numbers for this product_id even if sent
   f. central_stock >= dispatch_qty
4. In ONE transaction:
   - Update stock_request_items.quantity to dispatch_qty (per line)
   - Deduct central_stock by dispatch_qty
   - Set serials to status = 'dispatched', link stock_request_id, dispatched_to_admin_id
   - Set request status = 'dispatched', dispatched_at, dispatched_by_*
5. Return updated request with final quantities and serials
```

### Partial dispatch example

| Product | Requested | serial_numbers sent | dispatch_qty | central_stock deduct |
|---------|-----------|---------------------|--------------|----------------------|
| 5.4KWP inverter | 3 | `["2602420290"]` | **1** | 1 |
| 6KWP inverter | 2 | `["2602420999"]` | **1** | 1 |

Remaining requested units (2 + 1) are **not** dispatched — request is fully dispatched with reduced quantities per line (not left pending).

---

## 4. Central Inventory & Insufficient Stock

### Stock field

Use one canonical column: `products.central_stock` or `products.quantity`.

`GET /api/products` must return the **same value** used in dispatch validation:

```typescript
// Frontend reads:
quantity ?? central_stock ?? total_stock ?? 0
```

### Validation rule (critical)

```typescript
dispatch_qty =
  serial_numbers[product_id]?.length
  ?? serial_number_range_count
  ?? request_line.quantity   // full dispatch only when no serials sent

// CORRECT:
if (central_stock < dispatch_qty) → 400 insufficient stock

// WRONG (current bug on partial dispatch):
if (central_stock < request_line.quantity) → 400   // ❌ do not do this
```

### Bug example (must fix)

| Product | Requested | Central stock | serial_numbers sent | dispatch_qty | Should pass? |
|---------|-----------|---------------|---------------------|--------------|--------------|
| 5.4KWP-GTI-1PH-1MPPT-VSOLE | 3 | 1 | `["2602420290"]` | **1** | ✅ Yes |
| 6KWP-GTI-1PH-1MPPT-XWATT | 2 | 1 | `["2602420999"]` | **1** | ✅ Yes |

Backend currently returns generic `{ "error": "Insufficient stock" }` because it checks `1 < 3` and `1 < 2` instead of `1 >= 1`.

### 4.1 `products_quantity_check` constraint violation

#### Error (raw PostgreSQL / Sequelize)

```
new row for relation "products" violates check constraint "products_quantity_check"
```

#### When it happens

Partial dispatch: e.g. **6KWP inverter** — requested **2**, central stock **1**, user dispatches **1** serial (`XWS0326L06202N`).

#### Root cause

Backend runs something like:

```sql
UPDATE products SET quantity = quantity - :requested_qty WHERE id = :productId
-- quantity = 1 - 2 = -1  → violates CHECK (quantity >= 0)
```

Instead of:

```sql
UPDATE products SET quantity = quantity - :dispatch_qty WHERE id = :productId
-- dispatch_qty = len(serial_numbers[product_id]) = 1
-- quantity = 1 - 1 = 0  → OK
```

#### Backend fix

1. Compute `dispatch_qty` per line **before** any stock update (see §3).
2. **Validate** `central_stock >= dispatch_qty` — return 400 `Insufficient stock` if not (do not run UPDATE).
3. Deduct **`dispatch_qty` only** — never `requested_qty` when partial dispatch.
4. Do **not** double-deduct (once per serial row and again per line quantity).
5. Return a clear API error instead of exposing raw DB constraint text:

```json
{
  "error": "Insufficient stock for product 6KWP-GTI-1PH 1MPPT-XWATT in central inventory",
  "details": [{
    "product_id": "...",
    "product_name": "6KWP-GTI-1PH 1MPPT-XWATT",
    "dispatch_qty": 1,
    "requested_qty": 2,
    "available": 1
  }]
}
```

#### Example from UI

| Product | Requested | Central stock | Serials sent | dispatch_qty | Deduct | Result |
|---------|-----------|---------------|--------------|--------------|--------|--------|
| 6KWP inverter | 2 | 1 | 1 serial | **1** | 1 | quantity → 0 ✅ |
| 8KWP inverter | 3 | 3 | 3 serials | **3** | 3 | quantity → 0 ✅ |

### 4.2 `cannot exceed originally requested quantity`

#### Error

```
Quantity for product 3b449498-cfc3-4058-bfb4-e35456d09a85 cannot exceed originally requested quantity (2)
```

#### When it happens

User dispatches **1** of **2** requested (partial dispatch) with **1** serial selected. Frontend does **not** send `items` (sending `items` triggered this error from backend).

#### Root cause

Backend validation incorrectly rejects partial dispatch — e.g. compares wrong field, or requires `items` but validates them incorrectly.

#### Backend fix

1. **Do not require `items`** on dispatch for partial qty.
2. `dispatch_qty = len(serial_numbers[product_id])` when serials sent (e.g. **1**).
3. Validate: `1 <= dispatch_qty <= originally_requested` → **1 <= 1 <= 2** → **pass**.
4. Do not return "cannot exceed" when `dispatch_qty < requested_qty`.

### 4.3 Multi-item request — one partial line breaks entire dispatch

#### Symptom

Request has 3+ inverters. User correctly selects serials on **8KWP** (3/3) and **10KWP** (2/2), but dispatch fails with:

```
Stock update would make product quantity negative
```

A **third line** (e.g. **6KWP**, requested 2, dispatch 1 serial) may be off-screen. Backend deducts **2** for that line while only **1** serial was sent.

#### Root cause

```typescript
// WRONG — loop all request lines, always subtract requested quantity
for (const line of stockRequest.items) {
  await deductStock(line.product_id, line.quantity)  // ❌ ignores serial_numbers
}

// WRONG — only process serial_numbers keys but still subtract requested qty
for (const [productId, serials] of Object.entries(serial_numbers)) {
  await deductStock(productId, getRequestedQty(productId))  // ❌ should be serials.length
}
```

#### Correct — process each line once

```typescript
for (const line of stockRequest.items) {
  const dispatch_qty = resolveDispatchQty(line, body)  // § Quick reference
  await validateAndDeduct(line.product_id, dispatch_qty)
  await markSerialsDispatched(line.product_id, body.serial_numbers?.[line.product_id])
}
```

#### Multi-line example (must all succeed in one transaction)

| Line | Requested | Central stock | serial_numbers | dispatch_qty | Deduct |
|------|-----------|---------------|----------------|--------------|--------|
| 6KWP | 2 | 1 | `["XWS0326L06202N"]` | **1** | 1 |
| 8KWP | 3 | 3 | 3 serials | **3** | 3 |
| 10KWP | 2 | 2 | 2 serials | **2** | 2 |

#### Frontend behavior (until backend fixed)

- **Blocks** dispatch in UI when any Panels/Inverters line has `dispatch_qty < requested_qty` (partial dispatch).
- User must **reject** request, **add stock** and dispatch full qty, or wait for backend deploy.
- After backend fix, partial lines (e.g. 1 of 2) must work without `items` field.

### Frontend display (per-line errors)

Frontend shows insufficient stock **on the product row**, not only a top banner. Backend should help by returning identifiable per-product errors:

1. **Preferred:** `details[]` with `product_id` (frontend maps to line item).
2. **Minimum:** `error` string includes **exact product name** (frontend matches by name).
3. **Avoid:** generic `"Insufficient stock"` with no product — frontend falls back to heuristics.

### Error — single product

```json
{
  "error": "Insufficient stock for product 5.4KWP-GTI-1PH-1MPPT-VSOLE in central inventory",
  "details": [
    {
      "product_id": "prod-inverter-54",
      "product_name": "5.4KWP-GTI-1PH-1MPPT-VSOLE",
      "dispatch_qty": 1,
      "requested_qty": 3,
      "available": 1,
      "short_by": 0
    }
  ]
}
```

### Error — multiple products (preferred)

```json
{
  "error": "Insufficient stock in central inventory",
  "details": [
    {
      "product_id": "prod-inverter-36",
      "product_name": "3.6KWP-GTI-1PH-XWATT",
      "dispatch_qty": 5,
      "requested_qty": 5,
      "available": 2,
      "short_by": 3
    },
    {
      "product_id": "prod-cable-dc",
      "product_name": "DC Cable 4 sqmm",
      "dispatch_qty": 100,
      "requested_qty": 100,
      "available": 50,
      "short_by": 50,
      "reason": "insufficient_central_stock"
    }
  ]
}
```

### `details[]` field reference

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | string | **Required** for frontend line mapping |
| `product_name` | string | Shown in inline error |
| `dispatch_qty` | number | Qty being dispatched (serial count) |
| `requested_qty` | number | Original request line qty |
| `available` | number | `central_stock` at dispatch time |
| `short_by` | number | `dispatch_qty - available` (min 0) |
| `reason` | string | Optional: `no_available_serial_numbers`, etc. |

---

## 5. Serial Numbers — Panels & Inverters Only

See **`BACKEND_SERIAL_NUMBERS_DISPATCH_FIX.md`**.

### Which products require serials on dispatch

| Category | Serial required on dispatch? | Frontend sends `serial_numbers`? |
|----------|----------------------------|----------------------------------|
| **Panels** | ✅ Yes | ✅ Yes |
| **Inverters** | ✅ Yes | ✅ Yes |
| **Meters** | ❌ No | ❌ No |
| Cables, structures, nuts/bolts, etc. | ❌ No | ❌ No |

Backend must mirror frontend logic (`lib/utils.ts` → `isSerialRequiredForDispatch`):

```typescript
function requiresSerialOnDispatch(category: string, productName?: string): boolean {
  const c = (category || "").toLowerCase().trim()
  if (["panels", "panel", "solar panels", "solar panel", "inverter", "inverters"].includes(c)) return true
  if (c.includes("panel") || c.includes("inverter")) return true
  const name = (productName || "").toLowerCase()
  return name.includes("inverter") || name.includes("kwp") || name.includes("panel")
}
```

**Do not** require serial numbers for Meters on dispatch (even if product creation allowed optional serials elsewhere).

### GET /api/products/:id/serial-numbers

- Call only needed for Panels/Inverters (frontend skips others).
- Return serials with `status = 'available'` for central / super-admin stock.
- Query by `product_id` or `product_name` if needed.

### On dispatch (Panels & Inverters only)

1. Parse `serial_numbers` — if string, `JSON.parse()` first.
2. `serial_numbers[product_id].length` = dispatch quantity for that line.
3. For each serial string, validate using **the same query as GET** `/products/:id/serial-numbers`:
   - Match `product_id` from payload key **OR** `product_name` from `products` table
   - `status = 'available'`, central / super-admin ownership
4. **If GET would return the serial, dispatch must accept it** (no stricter rules on POST).
5. After dispatch: `status = 'dispatched'`, set `stock_request_id`, `dispatched_to_admin_id`.

### On dispatch (non-serial categories)

1. Do **not** require `serial_numbers`.
2. `dispatch_qty` = request line quantity (full line dispatch).
3. Deduct `central_stock` by `dispatch_qty` only.

### Errors

**Missing serials (Panels/Inverters only):**

```json
{
  "error": "Serial numbers required for 5.4KWP-GTI-1PH-1MPPT-VSOLE",
  "details": [{ "product_id": "...", "product_name": "5.4KWP-GTI-1PH-1MPPT-VSOLE", "reason": "serial_numbers_required" }]
}
```

**Invalid / unavailable serial (include product name, not only UUID):**

```json
{
  "error": "Some serial numbers are invalid or not available for product 5.4KWP-GTI-1PH-1MPPT-VSOLE",
  "details": [
    {
      "product_id": "1f3f0ffd-558b-4559-96fa-b52e4cdb772d",
      "product_name": "5.4KWP-GTI-1PH-1MPPT-VSOLE",
      "invalid_serials": ["2602420290"],
      "reason": "serial_not_available"
    }
  ]
}
```

**Wrong count:**

```json
{
  "error": "Expected 1 serial numbers for 5.4KWP-GTI-1PH-1MPPT-VSOLE, got 0"
}
```

---

## 6. PUT /api/stock-requests/:id — Permissions

| Role | PUT (edit pending request) | POST dispatch |
|------|---------------------------|---------------|
| Requester (admin) | ✅ own requests | ✅ |
| Super Admin | ❌ | ✅ |
| Agent | ❌ | ❌ |

Super Admin **must never need PUT** to dispatch or to apply partial quantities.

---

## 7. GET /api/stock-requests/:id — After Dispatch

Return **dispatched** quantities (not original requested if reduced):

```json
{
  "id": "req-123",
  "status": "dispatched",
  "items": [
    {
      "product_id": "prod-inverter-54",
      "quantity": 1,
      "serial_numbers": ["2602420290"]
    },
    {
      "product_id": "prod-inverter-6kw",
      "quantity": 1,
      "serial_numbers": ["2602420999"]
    }
  ],
  "dispatched_serial_numbers": {
    "prod-inverter-54": ["2602420290"],
    "prod-inverter-6kw": ["2602420999"]
  }
}
```

---

## 8. Error Responses

| Scenario | HTTP | Message |
|----------|------|---------|
| Non-requester calls PUT | 403 | `You do not have permission to update this request` |
| Dispatch runs requester-only update logic | 403 | **Bug** — fix dispatch handler |
| Invalid dispatch role | 403 | `You do not have permission to dispatch this request` |
| Not pending | 400 | `Request is not in pending status` |
| dispatch_qty > requested | 400 | `Quantity for {name} cannot exceed requested amount` |
| dispatch_qty < 1 | 400 | `Invalid dispatch quantity for {name}` |
| Insufficient central stock (one line) | 400 | `Insufficient stock for product {name} in central inventory` + `details[]` |
| Insufficient central stock (generic) | 400 | **Avoid** bare `Insufficient stock` — include `product_id` in `details[]` |
| Missing serials (Panels/Inverters only) | 400 | `Serial numbers required for {name}` |
| Serial not available | 400 | `Some serial numbers are invalid or not available for product {name}` + `details[]` |
| Serial sent for Meter / non-serial category | — | **Ignore** — do not validate or store serials for that line |

---

## 9. Backend Checklist

- [ ] `POST .../dispatch` works for **super-admin** without requester ownership
- [ ] Dispatch **never** calls PUT / requester-only update path
- [ ] **Partial dispatch:** `dispatch_qty = serial_numbers[product_id].length`
- [ ] Persist reduced line quantities on dispatch record
- [ ] Deduct `central_stock` by `dispatch_qty` (not requested qty)
- [ ] `GET /api/products` stock matches dispatch validation
- [ ] Parse `serial_numbers` / `serial_number_ranges` JSON strings from multipart
- [ ] `GET /api/products/:id/serial-numbers` returns available serials (Panels/Inverters)
- [ ] **Serial validation only for Panels & Inverters** — Meters dispatch without serials
- [ ] Invalid serial errors include `product_name` (not only UUID)
- [ ] **GET and dispatch use identical serial lookup** (fix `invalid or not available` when UI shows serial)
- [ ] Parse `serial_numbers` JSON string on JSON dispatch body
- [ ] `GET /api/stock-requests/:id` returns final dispatched qty + serials
- [ ] Return `details[]` with `product_id` for stock/serial failures
- [ ] **Never** validate stock against `requested_qty` when `serial_numbers` defines a lower `dispatch_qty`
- [ ] **Never** deduct `requested_qty` from `products.quantity` — use `dispatch_qty` only (fixes `products_quantity_check`)
- [ ] **Multi-item:** each line uses its own `dispatch_qty`; one partial line must not break full-dispatch lines
- [ ] Return 400 insufficient stock **before** UPDATE if `quantity - dispatch_qty < 0`
- [ ] Do not expose raw PostgreSQL constraint messages to the client
- [ ] Optional: `GET /admin-inventory/admin/:id` returns `[]` for super-admin ID instead of `Admin not found`

---

## 10. Test Plan

1. **Full dispatch — inverters** — All serials selected, no qty change → success, no PUT.
2. **Partial dispatch — inverters** — Requested 3, central_stock 1, send 1 serial → **200**, dispatched qty = 1, stock −1.
3. **Multi-line partial** — 5.4KWP: 3→1 serial, 6KWP: 2→1 serial, both central_stock 1 → **200**.
4. **Mixed request** — 2 inverters (with serials) + 2 meters (no serials in payload) → **200**, meters dispatched by quantity only.
5. **Meter line** — 76 meters requested, no `serial_numbers` for meter product_id → **200**, no serial error.
6. **Permission** — Super Admin `PUT /stock-requests/:id` → 403. `POST .../dispatch` → 200.
7. **Insufficient stock** — dispatch_qty 5, central_stock 2 → 400 with `product_name` and `details[]`.
8. **Invalid serial** — Serial in GET but rejected on dispatch → **bug**; fix shared lookup.
9. **Invalid serial** — Serial truly not `available` → 400 with product **name** and `invalid_serials[]`.
10. **Serial parse** — JSON body with stringified `serial_numbers` → parses and dispatches.
11. **Serial API** — `GET .../serial-numbers` returns available serials for inverter products only when called.
12. **Multipart** — dispatch with image + stringified `serial_numbers` → parses correctly.
13. **Multi-item mixed** — 6KWP partial (1 serial) + 8KWP full (3) + 10KWP full (2) → **200**, each line deducts serial count only.
14. **Frontend partial block removed** — after backend deploy, partial dispatch 1 of 2 succeeds without `items`.

---

## Last Updated

June 8, 2026 (multi-item dispatch, partial qty, products_quantity_check, serial GET/dispatch alignment)
