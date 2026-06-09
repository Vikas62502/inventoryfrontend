# Backend Changes: Quotation → Metering Flow

**Last Updated:** June 2025  
**For:** Backend Team  
**Context:** Admin Panel — **Quotations** tab and **Metering** tab (separate admin app; not in inventory frontend repo)

---

## Overview

Two rules for moving quotation data into **Metering**:

| Source | Rule |
|--------|------|
| **Approved** (green status in Quotations) | Record **automatically** appears in Metering |
| **Pending** (yellow status) | Admin uses **“Send to Metering”** action → record appears in Metering |

Metering tab sub-filters: **All**, **Processing**, **Approved**, **MCO**.

---

## 1. Data Model

### Option A — Separate `metering_records` table (recommended)

```sql
CREATE TABLE IF NOT EXISTS metering_records (
  id VARCHAR(50) PRIMARY KEY,
  quotation_id VARCHAR(50) NOT NULL UNIQUE REFERENCES quotations(id),
  customer_name VARCHAR(255),
  customer_mobile VARCHAR(20),
  customer_email VARCHAR(255),
  customer_address TEXT,
  dealer_id VARCHAR(50),
  dealer_name VARCHAR(255),
  dealer_mobile VARCHAR(20),
  quotation_amount DECIMAL(12, 2),
  phase VARCHAR(50),                    -- e.g. "1-Phase", "3-Phase"
  metering_status VARCHAR(50) NOT NULL DEFAULT 'processing',
  -- processing | metering_approved | mco | confirmation
  sent_to_metering_at TIMESTAMP,
  sent_to_metering_by VARCHAR(50),      -- user id (manual send from pending)
  auto_from_approval BOOLEAN DEFAULT FALSE,
  mco_date DATE,
  approved_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metering_status ON metering_records(metering_status);
CREATE INDEX idx_metering_quotation ON metering_records(quotation_id);
```

### Option B — Fields on `quotations` table

```sql
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS metering_status VARCHAR(50);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sent_to_metering_at TIMESTAMP;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS in_metering BOOLEAN DEFAULT FALSE;
```

Use **Option A** if Metering has its own workflow (MCO docs, move to confirmation, etc.) independent of quotation edits.

---

## 2. Auto-create on Quotation Approval

When quotation **Status / Ops** becomes **`approved`** (green):

1. Create or upsert a `metering_records` row from quotation data.
2. Set `metering_status = 'processing'` (initial Metering tab state).
3. Set `auto_from_approval = true`, `sent_to_metering_at = NOW()`.
4. Idempotent: if record already exists for `quotation_id`, update fields only — do not duplicate.

### Trigger points

- `PATCH /api/quotations/:id/status` with `{ "status": "approved" }`
- `PUT /api/admin/quotations/:id` when status changes to approved
- Any existing approval workflow hook

### Pseudo-code

```typescript
async function onQuotationStatusChange(quotationId: string, newStatus: string, userId: string) {
  await updateQuotationStatus(quotationId, newStatus)

  if (newStatus === 'approved') {
    await upsertMeteringFromQuotation(quotationId, {
      auto_from_approval: true,
      sent_to_metering_by: userId,
      metering_status: 'processing',
    })
  }
}
```

---

## 3. Manual “Send to Metering” (Pending Quotations)

For quotations with status **`pending`** (or other non-approved statuses), admin selects **Send to Metering** from Status / Ops or Actions menu.

### Endpoint

```
POST /api/admin/quotations/:id/send-to-metering
```

**Auth:** Admin / super-admin only.

**Request body (optional):**
```json
{
  "initial_metering_status": "processing"
}
```

**Behavior:**
1. Load quotation by id.
2. If already in metering (`metering_records` exists), return **200** with existing record (idempotent).
3. Create `metering_records` from quotation snapshot.
4. Set `auto_from_approval = false`, `sent_to_metering_by = current user`.
5. Optionally set quotation flag `in_metering = true` (does **not** change quotation status to approved).

**Response:**
```json
{
  "success": true,
  "data": {
    "metering_record_id": "MTR-xxx",
    "quotation_id": "QT-AV8ZL6",
    "metering_status": "processing",
    "message": "Quotation sent to Metering"
  }
}
```

**Errors:**
- `404` — quotation not found
- `409` — optional: block if quotation is cancelled/rejected

---

## 4. Metering List API

Admin **Metering** tab loads from a dedicated endpoint (not quotations list).

```
GET /api/admin/metering
```

**Query params:**

| Param | Values |
|-------|--------|
| `status` | `all` \| `processing` \| `approved` \| `mco` |
| `search` | name, mobile, email, quotation id |
| `page`, `limit` | pagination |

**Response:**
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "MTR-001",
        "quotation_id": "QT-H0VJ24",
        "customer": {
          "name": "vijay prakash",
          "mobile": "9414293787",
          "address": "..."
        },
        "dealer": {
          "name": "Baldev",
          "mobile": "..."
        },
        "phase": "1-Phase",
        "metering_status": "mco",
        "mco_date": "2026-02-06",
        "approved_date": null,
        "quotation_amount": 299000,
        "sent_to_metering_at": "2026-02-01T10:00:00Z",
        "auto_from_approval": false
      }
    ],
    "total": 42
  }
}
```

**Status mapping (Metering sub-tabs):**

| Tab | `metering_status` filter |
|-----|--------------------------|
| All | no filter |
| Processing | `processing` |
| Approved | `metering_approved` |
| MCO | `mco` |

---

## 5. Metering Workflow Actions (existing UI buttons)

Backend should support transitions shown in Metering cards:

| Action | Suggested endpoint | New status |
|--------|-------------------|------------|
| Move to MCO | `PATCH /api/admin/metering/:id` | `mco` |
| Back to Processing | `PATCH /api/admin/metering/:id` | `processing` |
| Back to Approved | `PATCH /api/admin/metering/:id` | `metering_approved` |
| Move to Confirmation | `PATCH /api/admin/metering/:id` | `confirmation` |
| Upload MCO Docs | `POST /api/admin/metering/:id/mco-documents` | multipart |

```json
PATCH /api/admin/metering/:id
{ "metering_status": "mco", "mco_date": "2026-02-06" }
```

---

## 6. Quotations List — Show Metering Option

**GET /api/admin/quotations** — extend each item:

```json
{
  "id": "QT-B2Q2X6",
  "status": "pending",
  "in_metering": false,
  "metering_record_id": null,
  "can_send_to_metering": true
}
```

| Field | Rule |
|-------|------|
| `in_metering` | `true` if metering record exists |
| `can_send_to_metering` | `true` when `!in_metering` and status is `pending` (and not cancelled) |
| Approved rows | `in_metering` should be `true` after auto-sync |

Frontend shows **“Send to Metering”** in Status / Ops dropdown when `can_send_to_metering === true`.

---

## 7. Field Mapping (Quotation → Metering)

| Quotation | Metering record |
|-----------|-----------------|
| `id` | `quotation_id` |
| `customer.firstName + lastName` | `customer_name` |
| `customer.mobile` | `customer_mobile` |
| `customer.email` | `customer_email` |
| `customer.address` (formatted) | `customer_address` |
| `dealerId` / dealer name | `dealer_id`, `dealer_name` |
| `pricing.finalAmount` | `quotation_amount` |
| `products.phase` or system size | `phase` |

---

## 8. Endpoints Checklist

### Quotations
- [ ] On status → `approved`, auto-create metering record
- [ ] `POST /api/admin/quotations/:id/send-to-metering` for pending manual send
- [ ] `GET /api/admin/quotations` returns `in_metering`, `can_send_to_metering`

### Metering
- [ ] `GET /api/admin/metering` with status filters (All / Processing / Approved / MCO)
- [ ] `GET /api/admin/metering/:id` for detail modal
- [ ] `PATCH /api/admin/metering/:id` for status transitions
- [ ] `POST /api/admin/metering/:id/mco-documents` for uploads (if not already present)

---

## 9. Test Plan

1. **Auto on approve** — Set quotation to Approved → appears in `GET /admin/metering?status=processing` without manual action.
2. **Manual from pending** — Pending quotation → `POST send-to-metering` → appears in Metering; quotation status stays Pending.
3. **No duplicate** — Approve then call send-to-metering → single metering record.
4. **Idempotent send** — Call send-to-metering twice → 200, same record id.
5. **MCO flow** — Move to MCO → visible under MCO tab only.
6. **Search** — Metering search by customer mobile finds record copied from quotation.

---

## 10. Summary

| Requirement | Backend action |
|-------------|----------------|
| Approved (green) → Metering | Hook approval; upsert `metering_records` |
| Pending → Send to Metering | `POST /admin/quotations/:id/send-to-metering` |
| Metering tab data | `GET /admin/metering` with status filters |
| No duplicate rows | Unique `quotation_id` on metering table |
| Quotations UI | Return `can_send_to_metering` flag on list API |

---

## Note for Frontend Team

The **Admin Panel** UI (Quotations + Metering tabs) is **not** in the `inventoryfrontend` repository. Implement UI changes in the admin app repo:

1. Quotations — add **“Send to Metering”** in Status / Ops when `can_send_to_metering`.
2. Metering — consume `GET /api/admin/metering`; approved quotations should appear without manual refresh after approval webhook/poll.
