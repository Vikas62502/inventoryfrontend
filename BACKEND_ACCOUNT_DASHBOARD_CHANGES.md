# Backend Changes – Account Dashboard

**Last Updated:** February 2025  
**For:** Backend developers  
**Context:** Account role dashboard – agent approvals and sales list

---

## Overview

The Account dashboard allows users with the `account` role to:
1. View and approve/reject agents (Agents tab)
2. View all agent sales (Sales tab) with Agent name, Date, and Download (only when approved)

This document lists the backend changes required to support these features.

---

## 1. GET /api/sales – Include Agent Name and Date

**Issue:** Agent and Date columns show "N/A" in the Account dashboard sales table.

**Cause:** The sales list response does not include agent name or sale date in the expected format.

### Required Response Fields

For each sale in `GET /api/sales` (and when filtered for Account role), include:

| Field | Type | Description |
|-------|------|-------------|
| `created_by_name` | string | Name of the agent who created the sale |
| `agent_name` | string | Alternative to `created_by_name` – same purpose |
| `created_at` | string (ISO 8601) | Sale creation timestamp |
| `sale_date` | string (ISO 8601) | Alternative date field if different from `created_at` |

**Implementation:** Join with the `users` table on `created_by_id` and return the creator’s `name` as `created_by_name` (or `agent_name`).

**Example response shape:**
```json
{
  "id": "sale-123",
  "type": "B2B",
  "customer_name": "CBPL",
  "company_name": "CBPL",
  "total_amount": 157500,
  "payment_status": "completed",
  "approval_status": "approved",
  "created_by_id": "user-456",
  "created_by_name": "Agent Name",
  "created_at": "2025-02-10T14:30:00Z",
  "updated_at": "2025-02-10T14:30:00Z"
}
```

---

## 2. Sale Approval Status – Download Only When Approved

**Requirement:** The Download button in the Account dashboard should appear only when the sale is approved.

### Option A: New `approval_status` Field (Recommended)

Add `approval_status` to the sales model and API:

| Value | Meaning |
|-------|---------|
| `"pending"` | Sale not yet approved by Account – no Download |
| `"approved"` | Sale approved – Download shown |

**API:**
- `GET /api/sales` – Include `approval_status` in each sale object.
- `PUT /api/sales/:id` or `POST /api/sales/:id/approve` – Allow Account role to set `approval_status` to `"approved"`.

**Database:** Add column `approval_status VARCHAR(20) DEFAULT 'pending'` to sales table.

### Option B: Use `payment_status` as Proxy

If you do not add `approval_status`, the frontend uses `payment_status === "completed"` to show the Download button. In that case:
- Sales with `payment_status: "completed"` → Download shown
- Sales with `payment_status: "pending"` → "Pending approval" shown

---

## 3. Agent Approval – Access Control

**Requirement:** When Account approves an agent from the Agents tab, the agent must be able to log in and perform actions. When not approved, the agent must be blocked.

### Current Flow

- Account dashboard calls `PUT /api/users/:id` with `{ "is_active": true }` to approve.
- Backend already has `is_active` on users.

### Backend Checklist

1. **Login:** Block login for users with `is_active === false` (return 401 with message like "Account is inactive and needs approval").
2. **API access:** Reject API requests from inactive agents (except perhaps password reset).
3. **Agent creation:** When Admin creates an agent, set `is_active: false` by default so Account must approve.

---

## 4. Agent Edit & Approval Visibility

**Flow:**
1. Agent creates a sale (customer, address, items, amount, etc.)
2. Agent can **Edit** their sale (customer, address, **items**, amounts, contact, notes) before Account approval
3. Account approves the sale from Account dashboard (Sales tab → Approve)
4. **Only after approval** does the Quote/Download action show to the agent

**Agent dashboard:**
- Edit button: Shown for sales from sales API. Agent can edit customer name, company, contact, address, **line items (products, qty, price, GST)**, notes.
- Quote button: Shown only when `approval_status === "approved"` or `payment_status === "completed"`
- When pending: Shows "Pending approval" – agent can still edit

**Backend:** `PUT /api/sales/:id` must accept `billing_address`, `delivery_address`, `delivery_matches_billing`, **`items`**, **`subtotal`**, **`tax_amount`**, **`total_amount`** for agent/account edits.

---

## 4a. GET /api/sales/:id – Full Sale for Edit Modal

**Requirement:** When Account or Agent opens the Edit modal, the frontend fetches the sale by ID. The response must include **full sale data** (same structure as create) so the edit form can be prefilled.

### Required Response Fields

| Field | Type | Purpose |
|-------|------|---------|
| `customer_name` | string | Prefill |
| `company_name` | string | B2B |
| `gst_number` | string | B2B |
| `contact_person` | string | B2B |
| `customer_email` | string | Prefill |
| `customer_phone` | string | Prefill |
| `notes` | string | Prefill |
| `billing_address` | object | `{ line1, line2?, city, state, postal_code, country }` |
| `delivery_address` | object | Same structure |
| `delivery_matches_billing` | boolean | Prefill checkbox |
| **`items`** | **array** | **Required** – line items for edit form |

### Items Array (each element)

| Field | Type | Purpose |
|-------|------|---------|
| `product_id` | string | Product ID |
| `quantity` | number | Quantity |
| `unit_price` | number | Unit price |
| `gst_rate` | number | GST % |

**Note:** Frontend accepts snake_case or camelCase (`productId`, `unitPrice`, `gstRate`). Items may include nested `product` object – frontend extracts `product.id` as `product_id`.

---

## 4b. PUT /api/sales/:id – Accept Items & Amounts

**Requirement:** Edit modal sends full sale update including line items and recalculated amounts.

| Field | Type | Purpose |
|-------|------|---------|
| (all customer/address fields) | — | Same as before |
| **`items`** | **array** | `[{ product_id, quantity, unit_price, gst_rate }]` |
| **`subtotal`** | **number** | Sum of (quantity × unit_price) |
| **`tax_amount`** | **number** | Sum of GST per line |
| **`discount_amount`** | number | Optional, default 0 |
| **`total_amount`** | **number** | subtotal + tax_amount - discount_amount |

Backend must persist updated items and recalculated amounts.

---

## 5. Account User Creation

**Requirement:** Super Admin can create Account users with the same flow as Admin (username, password, name).

### API

- `POST /api/users` must accept `role: "account"`.
- Request body: `{ "username", "password", "name", "role": "account" }`.
- Account users should be created with `is_active: true` (no approval needed for Account role).

---

## 6. Summary Checklist

| # | Change | Endpoint / Area | Priority |
|---|--------|-----------------|----------|
| 1 | Include `created_by_name` (or `agent_name`) in sales list | `GET /api/sales` | High |
| 2 | Include `created_at` (or `sale_date`) in sales list | `GET /api/sales` | High |
| 3 | Add `approval_status` to sales (or rely on `payment_status`) | Sales model + `GET /api/sales` | Medium |
| 4 | Add sale approval endpoint for Account role | `PUT /api/sales/:id` or `POST /api/sales/:id/approve` | Medium |
| 5 | **GET sale by ID returns full `items`** (product_id, quantity, unit_price, gst_rate) | `GET /api/sales/:id` | High |
| 6 | **PUT accepts `items`, `subtotal`, `tax_amount`, `total_amount`** for edit | `PUT /api/sales/:id` | High |
| 7 | Block inactive agents from login | `POST /inventory-auth/login` | High |
| 8 | Support `role: "account"` in user creation | `POST /api/users` | High |

---

## 7. Frontend Fallbacks (No Backend Change Required)

The frontend already uses these fallbacks when fields are missing:

- **Agent:** `created_by_name` → `agent_name` → `created_by.name` → `user.name` → "N/A"
- **Date:** `created_at` → `sale_date` → `saleDate` → `updated_at` → "N/A"
- **Download:** `approval_status === "approved"` OR `payment_status === "completed"`

Implementing the recommended fields above will remove "N/A" and align behavior with the intended design.

---

**Contact:** Frontend Team
