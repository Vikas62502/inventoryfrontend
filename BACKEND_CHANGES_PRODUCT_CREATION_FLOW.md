# Backend Changes: Product Creation Flow Updates

## Overview
This document outlines the backend changes required to support the updated product creation flow where:
1. Price can be set during product creation (for all users, not just agents)
2. Serial numbers are optional - products can be created without serial numbers
3. Product is created in Step 1, and serial numbers can be added later in Step 2

---

## Frontend Update Notes

### Product Creation Flow
- **Step 1**: Create product with basic details (name, model, category, quantity, unit, price)
- **Step 2**: Optionally add serial numbers (can be skipped)

### Key Changes
1. Price field is now available for all users during product creation
2. Serial numbers are optional - product can be created without them
3. Price can be set in Step 1 (product creation) or later when adding serial numbers

### Adding Stock (PUT /api/products/:id)

**Serial numbers are now optional when adding stock.**

You can call `PUT /api/products/:id` with just:
```json
{
  "stock_to_add": 10
}
```
and it will increase quantity without serial numbers.

**If you do send serial numbers, keep the same rules:**
- `serial_numbers` count must equal `stock_to_add`
- Only one of `default_price` or `serial_number_prices` (not both)

**Example with serial numbers:**
```json
{
  "stock_to_add": 3,
  "serial_numbers": ["SN001", "SN002", "SN003"],
  "default_price": 1500.00
}
```

**No other frontend changes needed.**

---

## API Endpoints to Update

### 1. `POST /api/products` (Create Product)

#### Current Behavior
- May restrict price setting to agents only
- May require serial numbers for products with quantity > 0

#### Required Changes

**Request Body:**
```typescript
{
  name: string,
  model: string,
  category: string,
  wattage?: string,
  quantity: number,
  unit: string,
  unit_price?: number,  // NEW: Available for all users, optional
  image?: File
}
```

**Example Request:**
```json
{
  "name": "Secure 1 PHASE NET METER",
  "model": "Secure 1 PHASE NET METER",
  "category": "Meters",
  "quantity": 10,
  "unit": "Quantity",
  "unit_price": 1500.00
}
```

**Validation Rules:**
1. `unit_price` is optional (can be 0 or null)
2. `unit_price` can be set by any user (not restricted to agents)
3. If `unit_price` is provided, it must be >= 0
4. Product can be created without serial numbers even if `quantity > 0`
5. Serial numbers can be added later via `PUT /api/products/:id`

**Response:**
- Success: 200 OK with created product
- Validation Error: 400 Bad Request with error details

---

### 2. `PUT /api/products/:id` (Update Product)

#### Current Behavior
- May require serial numbers when adding stock

#### Required Changes

**Request Body (when adding stock):**
```typescript
{
  stock_to_add: number,
  serial_numbers?: string[],  // OPTIONAL - can be empty or omitted
  default_price?: number,
  serial_number_prices?: { [serialNumber: string]: number }
}
```

**Validation Rules:**
1. `serial_numbers` is optional - can be empty array, omitted, or null
2. If `serial_numbers` is provided but empty, product stock is updated without serial numbers
3. If `serial_numbers` is provided with values, validation applies:
   - If `default_price` is provided, all serial numbers get that price
   - If `serial_number_prices` is provided, each serial number must have a price
4. Product can have stock without serial numbers (serial numbers are optional)

**Example Request (Add stock without serial numbers):**
```json
{
  "stock_to_add": 10
}
```

**Example Request (Add stock with serial numbers):**
```json
{
  "stock_to_add": 5,
  "serial_numbers": ["SN001", "SN002", "SN003", "SN004", "SN005"],
  "default_price": 1500.00
}
```

---

## Database Schema Considerations

### Current Schema
The `products` table should already support:
- `unit_price` column (nullable or default 0)
- `quantity` column

The `product_serial_numbers` table:
- Should allow products to exist without serial numbers
- `price` column should be nullable (as per previous changes)

### No Schema Changes Required
The existing schema should already support:
- Products without serial numbers
- Products with price set during creation
- Optional serial numbers when adding stock

---

## Implementation Details

### Product Creation Handler

```typescript
// Pseudo-code for POST /api/products handler

async function createProduct(req: Request, res: Response) {
  const { 
    name, 
    model, 
    category, 
    quantity, 
    unit,
    unit_price,  // Optional, available for all users
    wattage 
  } = req.body;

  // Validation
  if (!name || !model || !category || !quantity || !unit) {
    return res.status(400).json({
      error: "Validation error",
      details: [{ path: "required_fields", message: "Missing required fields" }]
    });
  }

  // Price validation (optional, but if provided must be valid)
  if (unit_price !== undefined && unit_price !== null) {
    if (unit_price < 0) {
      return res.status(400).json({
        error: "Validation error",
        details: [{ path: "unit_price", message: "unit_price must be >= 0" }]
      });
    }
  }

  // Create product (serial numbers not required)
  const product = await db.products.create({
    data: {
      name,
      model,
      category,
      quantity,
      unit,
      unit_price: unit_price || 0,  // Default to 0 if not provided
      wattage: wattage || null,
      // No serial numbers required at creation
    }
  });

  return res.status(201).json(product);
}
```

### Product Update Handler (Add Stock)

```typescript
// Pseudo-code for PUT /api/products/:id handler (when adding stock)

async function updateProduct(req: Request, res: Response) {
  const { id } = req.params;
  const { 
    stock_to_add, 
    serial_numbers,  // Optional
    default_price,
    serial_number_prices 
  } = req.body;

  // Validate stock_to_add
  if (stock_to_add && stock_to_add > 0) {
    // Serial numbers are optional
    if (serial_numbers && serial_numbers.length > 0) {
      // Process serial numbers with pricing (as per previous document)
      // ... existing serial number logic ...
    } else {
      // No serial numbers provided - just update stock
      // This is allowed - product can have stock without serial numbers
      await db.products.update({
        where: { id },
        data: {
          quantity: {
            increment: stock_to_add
          }
        }
      });
    }
  }

  return res.json(updatedProduct);
}
```

---

## Edge Cases and Considerations

### 1. Products Without Serial Numbers
- Products can have `quantity > 0` without any serial numbers
- This is a valid state - serial numbers are optional
- Serial numbers can be added later via update endpoint

### 2. Price Setting
- Price can be set during product creation (Step 1)
- Price can be set when adding serial numbers (Step 2)
- Price can be updated later via product update
- Price is optional - can be 0 or null

### 3. Stock Management
- Stock can be added without serial numbers
- Stock can be added with serial numbers
- Both scenarios are valid

### 4. Backward Compatibility
- Existing products without prices will continue to work (price = 0 or null)
- Existing products with serial numbers will continue to work
- No breaking changes to existing functionality

---

## Testing Scenarios

### Test Case 1: Create Product with Price (No Serial Numbers)
```json
POST /api/products
{
  "name": "Test Product",
  "model": "TP-001",
  "category": "Test",
  "quantity": 10,
  "unit": "Quantity",
  "unit_price": 1500.00
}
```
**Expected:** Product created with price, no serial numbers required

### Test Case 2: Create Product without Price
```json
POST /api/products
{
  "name": "Test Product",
  "model": "TP-002",
  "category": "Test",
  "quantity": 10,
  "unit": "Quantity"
}
```
**Expected:** Product created with price = 0 or null

### Test Case 3: Add Stock without Serial Numbers
```json
PUT /api/products/:id
{
  "stock_to_add": 5
}
```
**Expected:** Stock increased by 5, no serial numbers added

### Test Case 4: Add Stock with Serial Numbers
```json
PUT /api/products/:id
{
  "stock_to_add": 3,
  "serial_numbers": ["SN001", "SN002", "SN003"],
  "default_price": 1500.00
}
```
**Expected:** Stock increased, serial numbers added with prices

### Test Case 5: Add Stock with Empty Serial Numbers Array
```json
PUT /api/products/:id
{
  "stock_to_add": 5,
  "serial_numbers": []
}
```
**Expected:** Stock increased, no serial numbers added (valid)

---

## Migration Requirements

### No Database Migration Needed
The existing schema should already support:
- Optional `unit_price` (nullable or default 0)
- Products without serial numbers
- Optional serial numbers when adding stock

### Code Changes Only
- Update product creation endpoint to accept `unit_price` from all users
- Update product update endpoint to make `serial_numbers` optional
- Remove any restrictions that require serial numbers for products with quantity > 0

---

## Priority

**High** - Required for the updated product creation flow to work end-to-end.

---

## Notes

1. **User Role**: Price setting is no longer restricted to agents - all users can set price during product creation.

2. **Serial Numbers**: Serial numbers are now optional throughout the flow:
   - Product can be created without serial numbers
   - Stock can be added without serial numbers
   - Serial numbers can be added later if needed

3. **Two-Step Flow**: The frontend uses a two-step process:
   - Step 1: Create product (with optional price)
   - Step 2: Optionally add serial numbers
   - Backend should support both steps independently

4. **Flexibility**: This change makes the system more flexible:
   - Products can be created quickly without serial number entry
   - Serial numbers can be added later when available
   - Price can be set at any stage

---

## Last Updated
January 2025
