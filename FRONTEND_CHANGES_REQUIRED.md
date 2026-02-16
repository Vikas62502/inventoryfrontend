# Frontend Changes Required – Implementation Status

**Last Updated:** February 2025  
**Purpose:** Document frontend requirements and their implementation status.

---

## 1. Selling Price Update (Super Admin)

**Requirement:** Send only `selling_price` and `use_max_cost_price`; do NOT send `unit_price` (cost price).

**Status:** ✅ Implemented

**Implementation:**
- **Product modal** (`product-modal.tsx`): When `isSuperAdmin && product?.id`, only `use_max_cost_price` and `selling_price` are set in `productData`. The `unit_price` block is skipped.
- **API** (`lib/api.ts`): `productsApi.update` excludes `unit_price` when building FormData for selling-price-only updates. The product modal does not add `unit_price` to the payload when Super Admin updates selling price.

**Payload when Super Admin sets selling price only:**
```json
{
  "use_max_cost_price": false,
  "selling_price": 2500
}
```

---

## 2. Product Modal – Selling Price Separate from Cost Price

**Requirement:** Show/allow selling price separately from cost price.

**Status:** ✅ Implemented

**Implementation:**
- **Super Admin:** Dedicated "Selling Price (₹)" section with:
  - Checkbox: "Use max cost from registered stock (default)"
  - Manual override input when unchecked
  - Label: "Separate from cost price. Used for quotations and sales."
- **Cost price** (unit_price): Shown for agents; hidden for Super Admin in the main form. Cost price per serial is shown in the View All serial numbers list.
- Selling price and cost price are in separate UI sections and sent as separate fields.

---

## 3. Sales Modal – Use selling_price First

**Requirement:** When product selected, use `selling_price` first, then fall back to `unit_price` or `price`.

**Status:** ✅ Implemented

**Implementation:** `sales-modal.tsx` line ~184:
```javascript
updated[index].unit_price = product.selling_price ?? product.unit_price ?? product.price ?? 0
```

---

## 4. Serial Numbers View – Display cost_price

**Requirement:** Display `cost_price` from `GET /api/products/:id/serial-numbers`.

**Status:** ✅ Implemented

**Implementation:** `product-modal.tsx` – In the View All serial numbers modal, each serial number shows:
```jsx
{sn.cost_price != null && sn.cost_price > 0 && (
  <p className="text-xs text-green-400 mt-1">
    Cost: ₹{Number(sn.cost_price).toLocaleString()}
  </p>
)}
```

The `SerialNumber` type includes `cost_price?: number` and the API response is used directly.

---

## 5. Quotations (B2C) – API Endpoints

**Requirement:** Use `GET /api/admin/quotations` and `GET /api/quotations/:id` (agent access supported).

**Status:** ✅ Implemented

**Implementation:** `lib/api.ts` – `quotationsApi`:
- **List:** `GET /admin/quotations` (with optional `dealerId` for agents)
- **Detail:** `GET /quotations/:id`

Agents: `dealerId` is resolved via `agentDealerApi.getDealerId()` and passed when fetching quotations.

---

## Summary

| Requirement | Status | Location |
|-------------|--------|----------|
| Selling price update: only selling_price + use_max_cost_price | ✅ | product-modal.tsx, lib/api.ts |
| Product modal: selling price separate from cost price | ✅ | product-modal.tsx |
| Sales modal: selling_price first, then unit_price/price | ✅ | sales-modal.tsx |
| Serial numbers view: display cost_price | ✅ | product-modal.tsx |
| Quotations: GET /admin/quotations, GET /quotations/:id | ✅ | lib/api.ts |

---

## Payload Examples (for Backend Reference)

### Super Admin – Set Selling Price Only
```
PUT /api/products/:id
Content-Type: application/json

{
  "use_max_cost_price": false,
  "selling_price": 2500
}
```
*Note: unit_price is NOT sent.*

### Super Admin – Use Max Cost from Stock
```
PUT /api/products/:id
Content-Type: application/json

{
  "use_max_cost_price": true
}
```

### Sales Modal – Product Selection
When user selects a product, the line item `unit_price` is set to:
`product.selling_price ?? product.unit_price ?? product.price ?? 0`

### Serial Numbers Response
```
GET /api/products/:id/serial-numbers

Response: [
  {
    "id": "uuid",
    "serial_number": "SN001",
    "cost_price": 1500.00,
    ...
  }
]
```

---

**Contact:** Frontend Team
