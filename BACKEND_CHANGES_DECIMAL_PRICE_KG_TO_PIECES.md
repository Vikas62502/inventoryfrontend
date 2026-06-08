# Backend Changes: Decimal Prices & Kg → Pieces Inventory

**Last Updated:** June 2025  
**For:** Backend Team  
**Related frontend:** `components/modals/product-modal.tsx`, `lib/utils.ts`, `public/PRODUCT_CATALOG_REFERENCE.json`

---

## Overview

The Product Manager / Super Admin **Add Product** and **Add Stock** flows now support:

1. **Decimal prices** — e.g. `85.45` for unit price, cost price, and selling price.
2. **Weight-based products (KGS)** — user enters total weight in **kg**; frontend converts to **whole pieces** and saves stock as **Pieces**.

**Important:** Conversion happens on the **frontend**. The backend receives the **final** `quantity` / `stock_to_add` (integer pieces) and `unit: "Pieces"`. It does **not** receive raw kg weight on create/update (unless you add optional audit fields later).

---

## 1. Decimal Prices

### Requirement

All price fields must accept and persist decimal values with up to **2 decimal places** (e.g. `85.45`, `134.29`).

| Field | Where used |
|-------|------------|
| `unit_price` | Product create/update (cost price) |
| `default_price` | Bulk cost when adding stock with serials |
| `serial_number_prices` | Per-serial cost map |
| `cost_price` | `product_serial_numbers` table |
| `selling_price` | Super Admin selling price |

### Database

Ensure columns use `DECIMAL(10, 2)` (or equivalent), **not** `INTEGER`:

```sql
-- products
ALTER TABLE products ALTER COLUMN unit_price TYPE DECIMAL(10, 2);
ALTER TABLE products ALTER COLUMN selling_price TYPE DECIMAL(10, 2);

-- product_serial_numbers
ALTER TABLE product_serial_numbers ALTER COLUMN cost_price TYPE DECIMAL(10, 2);
```

### Validation

```typescript
// Accept decimals; reject negative only
if (unit_price !== undefined && unit_price < 0) {
  return 400 // "unit_price must be >= 0"
}
// Do NOT reject values like 85.45 or require integer prices
```

### Example request

```json
POST /api/products
{
  "name": "CABLE TIE 350mm",
  "model": "CABLE TIE 350mm",
  "category": "Accessories",
  "quantity": 15,
  "unit": "Quantity",
  "unit_price": 85.45
}
```

---

## 2. Kg → Pieces Conversion (Frontend → Backend Contract)

### Catalog products affected

Products in the reference catalog with `"unit": "KGS"` (e.g. Nut Bolt, J hook). Each has optional `weight_per_piece_kg` in the frontend JSON catalog.

| Product (example) | Catalog unit | weight_per_piece_kg (catalog) |
|-------------------|--------------|-------------------------------|
| Nut Bolt 5inch 4suit | KGS | 0.45 |
| Nut Bolt 5inch 3suit | KGS | 0.35 |
| J hook 40*40 | KGS | 0.25 |

### Frontend conversion formula

```
pieces = Math.round(total_weight_kg / weight_per_piece_kg)
```

- If result is `0`, frontend blocks save (weight too low).
- Decimals are **rounded** to nearest whole piece before API call.

### What the backend receives

#### Create product (`POST /api/products`)

User enters **10.5 kg** total weight; piece weight **0.45 kg** → **23 pieces** (`Math.round(10.5 / 0.45)`).

```json
{
  "name": "Nut Bolt 5inch 4suit",
  "model": "Nut Bolt 5inch 4suit",
  "category": "Structural Components",
  "quantity": 23,
  "unit": "Pieces",
  "unit_price": 340.00
}
```

**Not sent:** `total_weight_kg`, `weight_per_piece_kg` (conversion is client-side only today).

#### Add stock (`PUT /api/products/:id`)

User enters **5 kg** to add; piece weight **0.45 kg** → **11 pieces**.

```json
{
  "stock_to_add": 11,
  "unit": "Pieces",
  "quantity": 33
}
```

- `stock_to_add` = **converted pieces** (integer), not kg.
- `unit` is sent only when adding kg-based stock (so stored unit can update from Kilograms → Pieces).
- `quantity` = existing stock + `stock_to_add` (existing pieces + new pieces).

---

## 3. Unit Field Validation (Critical — Fixes 400 Validation Errors)

### Problem

Backend may currently:

- Reject `unit: "PCS"` or `"KGS"` (API codes) while frontend sends **display names**.
- Reject `unit: "Pieces"` for a product whose **catalog** reference is `KGS`.
- Reject `unit` on update when it did not change.

### Required behavior

**Accept both display names and codes:**

| Display (preferred from frontend) | Code (also accept) |
|-----------------------------------|--------------------|
| Pieces | PCS |
| Kilograms | KGS |
| Meters | MTR |
| Quantity | NOS |
| Watts | W |
| Pack | PAC |

**After kg conversion:**

- Stored product `unit` should be **`Pieces`** (or **`PCS`**).
- **Do not** validate that `unit` must stay `KGS` because the catalog lists KGS — inventory is tracked in pieces after conversion.

**On update:**

- If `unit` is omitted, leave existing unit unchanged.
- If `unit: "Pieces"` is sent with `stock_to_add`, persist it.

### Example validation (pseudo-code)

```typescript
const ALLOWED_UNITS = new Set([
  "Pieces", "PCS", "Kilograms", "KGS", "Meters", "MTR",
  "Quantity", "NOS", "Watts", "W", "Pack", "PAC", "Fixed", "Pillar",
]);

function normalizeUnit(unit: string): string {
  const map: Record<string, string> = {
    PCS: "Pieces", KGS: "Kilograms", MTR: "Meters", NOS: "Quantity",
    W: "Watts", PAC: "Pack",
  };
  return map[unit] ?? unit;
}

// Validate
if (unit && !ALLOWED_UNITS.has(unit)) {
  return 400;
}
// Store normalized display name or your internal enum
```

---

## 4. Quantity / Stock Rules

| Rule | Detail |
|------|--------|
| Integer stock | After kg conversion, `quantity` and `stock_to_add` are **whole numbers** (pieces). |
| `stock_to_add` | Must **add** to current quantity: `new_qty = current + stock_to_add`. |
| No serials for KGS items | Nut bolts / J hooks are not Panels/Inverters/Meter — serial numbers optional. |
| Decimal quantity (other units) | Meters etc. may still send decimal quantities from frontend; only kg→pieces path forces integers. |

---

## 5. Optional Backend Enhancements (Not Required for Current Frontend)

If you want server-side audit or catalog sync later:

### A. Persist weight per piece on product

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_per_piece_kg DECIMAL(10, 3);
```

Frontend could later send this on create; not required now.

### B. Store last weight entry (audit)

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_stock_weight_kg DECIMAL(10, 3);
```

Optional log when stock is added via weight conversion.

### C. Product catalog API

Expose `weight_per_piece_kg` from backend catalog instead of static JSON — frontend today reads `PRODUCT_CATALOG_REFERENCE.json`.

---

## 6. Endpoints Checklist

### `POST /api/products`

- [ ] Accept `unit_price` with 2 decimal places (e.g. `85.45`).
- [ ] Accept `unit: "Pieces"` with integer `quantity` for converted kg products.
- [ ] Do not require `unit` to match catalog KGS when quantity is in pieces.
- [ ] Accept display unit names (`Pieces`, `Kilograms`, `Meters`, `Quantity`, …).

### `PUT /api/products/:id`

- [ ] Accept `stock_to_add` as integer pieces (converted on frontend).
- [ ] Accept optional `unit: "Pieces"` when adding kg-based stock.
- [ ] Accept decimal `default_price` / `unit_price`.
- [ ] Do not fail validation when `unit` changes from Kilograms → Pieces.

### `GET /api/products` / `GET /api/products/:id`

- [ ] Return `unit_price`, `selling_price` as decimals (not truncated integers).
- [ ] Return stored `unit` (e.g. `"Pieces"`) after kg product is saved.

---

## 7. Test Plan

1. **Decimal price** — Create product with `unit_price: 85.45`; GET product; confirm `85.45` returned.
2. **Kg create** — POST with `quantity: 22`, `unit: "Pieces"` for Nut Bolt; no 400 validation error.
3. **Kg add stock** — PUT with `stock_to_add: 11`, `unit: "Pieces"`; quantity increases by 11, not by 11 kg.
4. **Unit codes** — Accept both `"Pieces"` and `"PCS"` if sent.
5. **No false validation** — Updating product name/price without `unit` in body must not fail on unit mismatch.

---

## 8. Summary for Backend Team

| Topic | Action |
|-------|--------|
| Prices | Use `DECIMAL(10,2)`; allow `85.45` |
| Kg products | Frontend sends **pieces** + `unit: "Pieces"`; backend stores as-is |
| Unit validation | Allow display names; allow Pieces for ex-KGS catalog items |
| Conversion | Done on frontend — backend does **not** need kg math unless you add audit columns |
| Validation 400 fix | Stop requiring catalog unit KGS when inventory is stored in pieces |

---

## Frontend Reference (for debugging)

Conversion helper: `convertKgWeightToPieces()` in `lib/utils.ts`:

```typescript
Math.round(totalKg / pieceWeightKg)
```

Save payload built in `resolveInventoryForSave()` in `product-modal.tsx` — sends `unit: "Pieces"` (display name, value from `unitDisplayMap.PCS`).
