# Backend Changes - Latest Requirements

## 📄 Quick Reference

**New:** See **`BACKEND_CHANGES_FRONTEND_UPDATES.md`** for a summary of current frontend behavior, payload examples, and API contract.

---

## 🚨 URGENT: Serial Number Metadata Association

**Status:** Required for current feature  
**Priority:** High  
**Document:** `BACKEND_CHANGES_SERIAL_NUMBER_METADATA.md`

### Quick Summary
Every serial number must store:
1. **Cost Price** (`cost_price`) - Already implemented
2. **Product Name** (`product_name`) - **NEW**
3. **Category** (`category`) - **NEW**

### API Changes Required

#### POST /api/products
**New Fields:**
- `product_name` (string, optional) - Falls back to `name` if not provided
- `product_category` (string, optional) - Falls back to `category` if not provided

**Example Request:**
```json
{
  "name": "Solar Panel 400W",
  "category": "Panels",
  "quantity": 5,
  "serial_numbers": ["SN001", "SN002", "SN003", "SN004", "SN005"],
  "default_price": 1500,
  "product_name": "Solar Panel 400W",      // NEW
  "product_category": "Panels"              // NEW
}
```

#### PUT /api/products/:id
**New Fields:**
- `product_name` (string, optional) - Falls back to existing product `name`
- `product_category` (string, optional) - Falls back to existing product `category`

**Example Request:**
```json
{
  "stock_to_add": 3,
  "serial_numbers": ["SN004", "SN005", "SN006"],
  "default_price": 1500,
  "product_name": "Solar Panel 400W",      // NEW
  "product_category": "Panels"              // NEW
}
```

### Database Schema Update

**Table: `product_serial_numbers`**

Add/Ensure these columns exist:
```sql
ALTER TABLE product_serial_numbers
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS category VARCHAR(255) NOT NULL;
```

**Migration for Existing Data:**
```sql
UPDATE product_serial_numbers sn
SET 
  product_name = p.name,
  category = p.category
FROM products p
WHERE sn.product_id = p.id
  AND (sn.product_name IS NULL OR sn.category IS NULL);
```

### Response Updates

**GET /api/products/:id/serial-numbers** should return:
```json
[
  {
    "id": "sn_123",
    "serial_number": "SN001",
    "cost_price": 1500.00,
    "product_name": "Solar Panel 400W",    // NEW
    "category": "Panels",                   // NEW
    "status": "available"
  }
]
```

---

## 📋 Other Backend Change Documents

### 1. Serial Number Pricing
**Document:** `BACKEND_CHANGES_SERIAL_NUMBER_PRICING.md`  
**Status:** Already implemented  
**Summary:** Support for `default_price` and `serial_number_prices` in product creation/update

### 2. Product Creation Flow
**Document:** `BACKEND_CHANGES_PRODUCT_CREATION_FLOW.md`  
**Status:** Already implemented  
**Summary:** Serial numbers are optional when adding stock, `unit_price` available for all users

### 3. Duplicate Product Validation
**Document:** `BACKEND_CHANGES_DUPLICATE_PRODUCT_VALIDATION.md`  
**Status:** Already implemented  
**Summary:** Backend validates duplicate products by name + model combination

### 4. Centralized Stock Management
**Document:** `BACKEND_CHANGES_CENTRALIZED_STOCK.md`  
**Status:** Already implemented  
**Summary:** Agents work directly with admin's stock, no separate agent stock requests

### 5. Serial Number Range Transfer
**Document:** `BACKEND_CHANGES_SERIAL_NUMBER_RANGE_TRANSFER.md`  
**Status:** Already implemented  
**Summary:** SuperAdmin can transfer stock to Admin with serial number ranges

### 6. Quotations B2C Sales Integration
**Document:** `BACKEND_CHANGES_QUOTATIONS_B2C_SALES.md`  
**Status:** Already implemented  
**Summary:** Integration with quotations API for B2C sales customer data

### 7. Super Admin Manager Role
**Document:** `BACKEND_CHANGES_PRODUCT_MANAGER_ROLE.md`  
**Status:** Already implemented  
**Summary:** New role "super-admin-manager" for product management

---

## 🔧 Implementation Checklist

### For Serial Number Metadata Association:

- [ ] Update `product_serial_numbers` table schema
  - [ ] Add `product_name` column (VARCHAR(255), NOT NULL)
  - [ ] Add `category` column (VARCHAR(255), NOT NULL)
- [ ] Update `POST /api/products` endpoint
  - [ ] Accept `product_name` and `product_category` fields
  - [ ] Store these values when creating serial numbers
  - [ ] Fallback to product `name` and `category` if not provided
- [ ] Update `PUT /api/products/:id` endpoint
  - [ ] Accept `product_name` and `product_category` fields
  - [ ] Store these values when adding serial numbers
  - [ ] Fallback to existing product `name` and `category` if not provided
- [ ] Update `GET /api/products/:id/serial-numbers` endpoint
  - [ ] Return `product_name` and `category` in response
- [ ] Update `GET /api/serial-numbers/search` endpoint
  - [ ] Return `product_name` and `category` in response
- [ ] Create migration script for existing serial numbers
  - [ ] Populate `product_name` and `category` from related product
- [ ] Add validation
  - [ ] Ensure `product_name` and `category` are always set (not null)
  - [ ] Validate cost_price > 0

---

## 📝 Notes

1. **Historical Data:** `product_name` and `category` should be stored at serial number creation time and remain static even if the product name/category changes later.

2. **Backward Compatibility:** If `product_name` or `product_category` are not provided in the request, use the product's current `name` and `category` values.

3. **Data Integrity:** These fields should be set to NOT NULL after migration is complete.

---

## 🧪 Testing

Test the following scenarios:

1. ✅ Create product with serial numbers (single price) - verify `product_name` and `category` are stored
2. ✅ Create product with serial numbers (individual prices) - verify `product_name` and `category` are stored
3. ✅ Add stock to existing product - verify `product_name` and `category` are stored
4. ✅ Retrieve serial numbers - verify `product_name` and `category` are returned
5. ✅ Migration script - verify existing serial numbers get `product_name` and `category` populated

---

**Last Updated:** February 2025  
**Contact:** Frontend Team
