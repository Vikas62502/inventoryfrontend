# Backend Changes: Serial Number Tracking for Stock Additions

## Overview
This document outlines the backend changes required to implement serial number tracking when adding stock to products. When stock is added (e.g., quantity 8), the system should capture and store serial numbers for each unit.

**Important:** The frontend now implements a **two-step product creation flow**:
1. **Step 1:** Create product with basic details (name, model, category, quantity, etc.)
2. **Step 2:** Upload serial numbers for the created product (if quantity > 0)

This means when a new product is created with quantity > 0, the frontend will:
- First call `POST /api/products` to create the product
- Then immediately call `PUT /api/products/:id` with `stock_to_add` equal to the initial quantity and serial numbers

---

## 1. Database Schema Changes

### 1.1 New Table: `product_serial_numbers`

**Purpose:** Store serial numbers for each product unit in inventory


**Schema:**
```sql
CREATE TABLE product_serial_numbers (
  id VARCHAR(50) PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL,
  serial_number VARCHAR(255) NOT NULL UNIQUE,
  stock_addition_id VARCHAR(50), -- Optional: link to stock addition record
  owner_id VARCHAR(50), -- NULL for central/SuperAdmin stock, or admin/agent ID
  owner_type VARCHAR(20), -- 'super-admin', 'admin', 'agent', or NULL
  status VARCHAR(20) DEFAULT 'available', -- 'available', 'sold', 'returned', 'damaged', etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_product_id (product_id),
  INDEX idx_serial_number (serial_number),
  INDEX idx_owner_id (owner_id),
  INDEX idx_status (status)
);
```

**Fields:**
- `id`: Primary key
- `product_id`: Foreign key to products table
- `serial_number`: Unique serial number for the unit
- `stock_addition_id`: Optional reference to track which stock addition this serial number came from
- `owner_id`: NULL for central/SuperAdmin stock, or the ID of the admin/agent who owns this serial number
- `owner_type`: 'super-admin', 'admin', 'agent', or NULL for central stock
- `status`: Current status of the serial number - 'available' (default), 'sold', 'returned', 'damaged', etc.
- `created_at`: Timestamp when serial number was added
- `updated_at`: Timestamp when serial number was last updated

### 1.2 Optional: Stock Addition Tracking Table

**Purpose:** Track stock additions with metadata (date, user, method)

**Schema:**
```sql
CREATE TABLE stock_additions (
  id VARCHAR(50) PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL,
  quantity_added INTEGER NOT NULL,
  added_by_id VARCHAR(50), -- User who added the stock
  addition_method ENUM('manual', 'barcode', 'photo') DEFAULT 'manual',
  serial_number_image_url VARCHAR(500), -- If photo was uploaded
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_product_id (product_id),
  INDEX idx_created_at (created_at)
);
```

---

## 2. API Endpoint Changes

### 2.1 Update Product Endpoint

**Endpoint:** `PUT /api/products/:id`

**Current Behavior:**
- Updates product information
- Updates quantity/stock

**New Behavior:**
- Accept serial numbers when stock is being added
- Store serial numbers in `product_serial_numbers` table
- Validate that number of serial numbers matches quantity being added

**Request Body (FormData when serial numbers are included):**
```typescript
{
  // Existing fields
  name?: string
  model?: string
  category?: string
  wattage?: string
  quantity?: number // Final quantity after addition
  unit_price?: number
  image?: File
  
  // New fields for stock addition
  stock_to_add?: number // Quantity being added
  serial_numbers?: string[] // Array of serial numbers (JSON string in FormData)
  // serial_number_image?: File // REMOVED: Photo upload no longer supported
  serial_number_excel?: File // Excel/CSV file containing serial numbers
}
```

**Example Request:**
```javascript
// FormData
formData.append("stock_to_add", "8")
formData.append("serial_numbers", JSON.stringify(["SN001", "SN002", "SN003", "SN004", "SN005", "SN006", "SN007", "SN008"]))
// OR
// formData.append("serial_number_image", imageFile) // REMOVED: Photo upload no longer supported
// OR
formData.append("serial_number_excel", excelFile) // For Excel/CSV upload
```

**Validation (category-aware):**
1. If `stock_to_add > 0`:
   - Resolve product category/name → `requiresSerialNumbers(category, name)` (Panels & Inverters **only** — see **`BACKEND_CHANGES_METER_SERIAL_OPTIONAL.md`**)
   - If `requiresSerialNumbers` is **true** and no `serial_numbers` / `serial_number_excel`: return **400** — serials required
   - If `requiresSerialNumbers` is **false** (Meters, cables, etc.): increment quantity only; serials optional
   - If `serial_numbers` is provided: validate `serial_numbers.length === stock_to_add`
   - If `serial_number_excel` is provided: extract serial numbers from Excel/CSV file (see section 3.2)

**Response:**
```json
{
  "id": "product_id",
  "name": "Product Name",
  "quantity": 15, // Updated quantity
  "serial_numbers_added": 8, // Number of serial numbers added
  "message": "Stock added successfully with 8 serial numbers"
}
```

**Action Required:**
- Update `PUT /api/products/:id` endpoint to:
  1. Accept `stock_to_add`, `serial_numbers`, and `serial_number_excel` fields (photo upload removed)
  2. Validate serial numbers match quantity
  3. Store serial numbers in database
  4. **Handle two-step product creation:**
     - If `stock_to_add === product.quantity` (initial stock), only store serial numbers, don't increment quantity
     - If `stock_to_add < product.quantity` (adding to existing stock), increment quantity by `stock_to_add`
  5. Update product quantity only when adding to existing stock (not for initial stock)

---

## 3. OCR Integration for Photo Upload

> **⚠️ UPDATE (January 15, 2025):** Photo upload has been **removed** from the frontend. OCR integration is **not required** at this time. This section is kept for future reference only.

### 3.1 Serial Number Extraction from Images

**When `serial_number_image` is provided:** (Currently not used - frontend removed photo upload)
- Extract serial numbers from the uploaded image using OCR
- Return extracted serial numbers to frontend for confirmation
- OR: Store image and extract serial numbers asynchronously

**OCR Options:**
1. **Tesseract.js** (Node.js): Free, open-source OCR
2. **Google Cloud Vision API**: Paid, high accuracy
3. **AWS Textract**: Paid, high accuracy
4. **Azure Computer Vision**: Paid, high accuracy

**Recommended Approach:**
- Use Tesseract.js for initial implementation (free)
- Allow upgrade to cloud OCR services later if needed

**Implementation Example (Tesseract.js):**
```typescript
import Tesseract from 'tesseract.js';

async function extractSerialNumbers(imageFile: File): Promise<string[]> {
  const { data: { text } } = await Tesseract.recognize(imageFile, 'eng', {
    logger: m => console.log(m)
  });
  
  // Parse text to extract serial numbers
  // This depends on the format of serial numbers in the image
  const serialNumbers = text
    .split(/\n/)
    .map(line => line.trim())
    .filter(line => /^[A-Z0-9-]+$/.test(line)) // Adjust regex based on serial number format
  
  return serialNumbers;
}
```

**Action Required:**
- Implement OCR extraction for serial numbers
- Handle various serial number formats
- Return extracted serial numbers for validation

### 3.2 Excel/CSV File Processing

**When `serial_number_excel` is provided:**
- Extract serial numbers from the uploaded Excel (.xlsx, .xls) or CSV file
- Serial numbers should be in the first column of the file
- Validate that the number of serial numbers matches `stock_to_add`

**File Format Requirements:**
- **Excel Files (.xlsx, .xls):**
  - Serial numbers in column A (first column)
  - First row may be a header (skip if present)
  - Each row contains one serial number
  
- **CSV Files (.csv):**
  - Serial numbers in first column
  - Comma-separated values
  - First row may be a header (skip if present)

**Implementation Example (Node.js with `xlsx` library):**
```typescript
import * as XLSX from 'xlsx';
import * as fs from 'fs';

async function extractSerialNumbersFromExcel(file: File): Promise<string[]> {
  // Read file buffer
  const buffer = await file.arrayBuffer();
  
  // Parse Excel file
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Convert to JSON (array of arrays)
  const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  
  // Extract first column (column A)
  const serialNumbers: string[] = [];
  let startRow = 0;
  
  // Skip header row if first row looks like a header
  if (data.length > 0 && typeof data[0][0] === 'string' && 
      (data[0][0].toLowerCase().includes('serial') || 
       data[0][0].toLowerCase().includes('number') ||
       data[0][0].toLowerCase().includes('sn'))) {
    startRow = 1;
  }
  
  // Extract serial numbers from first column
  for (let i = startRow; i < data.length; i++) {
    const cellValue = data[i][0];
    if (cellValue && String(cellValue).trim() !== '') {
      serialNumbers.push(String(cellValue).trim());
    }
  }
  
  return serialNumbers;
}

// For CSV files
async function extractSerialNumbersFromCSV(file: File): Promise<string[]> {
  const text = await file.text();
  const lines = text.split('\n');
  
  const serialNumbers: string[] = [];
  let startRow = 0;
  
  // Skip header row if present
  if (lines.length > 0 && 
      (lines[0].toLowerCase().includes('serial') || 
       lines[0].toLowerCase().includes('number') ||
       lines[0].toLowerCase().includes('sn'))) {
    startRow = 1;
  }
  
  // Extract serial numbers from first column
  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      // Split by comma and take first value
      const firstColumn = line.split(',')[0].trim();
      if (firstColumn) {
        serialNumbers.push(firstColumn);
      }
    }
  }
  
  return serialNumbers;
}
```

**Error Handling:**
- Return error if file format is not supported
- Return error if file is corrupted or cannot be read
- Return error if no serial numbers found in file
- Return error if number of serial numbers doesn't match `stock_to_add`

**Action Required:**
- Install Excel/CSV parsing library (e.g., `xlsx` for Node.js)
- Implement Excel file parsing
- Implement CSV file parsing
- Validate extracted serial numbers match quantity

---

## 4. Serial Number Validation

### 4.1 Uniqueness Validation

**Rules:**
- Serial numbers must be unique across all products
- OR: Serial numbers must be unique per product (recommended)
- Check for duplicates before storing

**Validation Logic:**
```typescript
// Check if serial numbers already exist
const existingSerials = await ProductSerialNumber.findAll({
  where: {
    serial_number: { [Op.in]: serialNumbers }
  }
});

if (existingSerials.length > 0) {
  return res.status(400).json({
    error: "Duplicate serial numbers found",
    details: existingSerials.map(s => s.serial_number)
  });
}
```

**Action Required:**
- Add uniqueness validation for serial numbers
- Return clear error messages for duplicates

### 4.2 Format Validation

**Rules:**
- Serial numbers should match a specific format (e.g., alphanumeric, length)
- Configurable per product or globally

**Example Validation:**
```typescript
const SERIAL_NUMBER_REGEX = /^[A-Z0-9-]{5,20}$/; // Adjust based on requirements

for (const serial of serialNumbers) {
  if (!SERIAL_NUMBER_REGEX.test(serial)) {
    return res.status(400).json({
      error: "Invalid serial number format",
      details: `Serial number "${serial}" does not match required format`
    });
  }
}
```

**Action Required:**
- Add format validation for serial numbers
- Make format configurable if needed

---

## 5. API Endpoints for Serial Number Management

### 5.1 Get Serial Numbers for Product

**Endpoint:** `GET /api/products/:id/serial-numbers`

**Purpose:** Retrieve all serial numbers assigned to a specific product. This endpoint is used by the frontend to display assigned serial numbers in the product edit modal with an eye icon button.

**Authentication:** Required (user must be authenticated)

**Authorization:** 
- Super Admin: Can view all serial numbers for any product
- Admin: Can view serial numbers for products in their inventory
- Agent: Can view serial numbers for products they have access to

**Request:**
```
GET /api/products/{productId}/serial-numbers
Headers:
  Authorization: Bearer <token>
```

**Response Format (Array of Serial Numbers):**
```json
[
  {
    "id": "sn-001",
    "product_id": "product-123",
    "serial_number": "SN001",
    "owner_id": null,
    "owner_type": null,
    "status": "available",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  },
  {
    "id": "sn-002",
    "product_id": "product-123",
    "serial_number": "SN002",
    "owner_id": "admin-456",
    "owner_type": "admin",
    "status": "available",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  }
]
```

**Response (Empty Array - No Serial Numbers):**
```json
[]
```

**Response (Error - 404 Not Found):**
```json
{
  "error": "Product not found"
}
```

**Response (Error - 403 Forbidden):**
```json
{
  "error": "Unauthorized",
  "message": "You do not have permission to view serial numbers for this product"
}
```

**Query Parameters (Optional):**
- `status` - Filter by status (e.g., `?status=available`)
- `owner_id` - Filter by owner ID (e.g., `?owner_id=admin-456`)
- `limit` - Limit number of results (e.g., `?limit=100`, default: no limit)
- `offset` - Pagination offset (e.g., `?offset=0`)

**Example Queries:**
```
GET /api/products/product-123/serial-numbers
GET /api/products/product-123/serial-numbers?status=available
GET /api/products/product-123/serial-numbers?status=available&limit=50&offset=0
```

**Backend Implementation:**

1. **Basic Query:**
   ```sql
   SELECT 
     id,
     product_id,
     serial_number,
     owner_id,
     owner_type,
     status,
     created_at,
     updated_at
   FROM product_serial_numbers
   WHERE product_id = ?
   ORDER BY created_at DESC
   ```

2. **With Status Filter:**
   ```sql
   SELECT * FROM product_serial_numbers
   WHERE product_id = ? AND status = ?
   ORDER BY created_at DESC
   ```

3. **Authorization Logic:**
   ```typescript
   // Pseudo-code
   async function getSerialNumbersByProduct(productId: string, userId: string, userRole: string) {
     // Check if product exists
     const product = await getProductById(productId);
     if (!product) {
       throw new Error("Product not found");
     }
     
     // Authorization check
     if (userRole === "super-admin") {
       // Super Admin can view all
       return await getSerialNumbers(productId);
     } else if (userRole === "admin") {
       // Admin can view if product is in their inventory
       const hasAccess = await checkAdminInventoryAccess(productId, userId);
       if (!hasAccess) {
         throw new Error("Unauthorized");
       }
       return await getSerialNumbers(productId);
     } else if (userRole === "agent") {
       // Agent can view if product is in their accessible stock
       const hasAccess = await checkAgentStockAccess(productId, userId);
       if (!hasAccess) {
         throw new Error("Unauthorized");
       }
       return await getSerialNumbers(productId);
     }
     
     throw new Error("Unauthorized");
   }
   ```

4. **Performance Considerations:**
   - Use indexed queries on `product_id` and `status`
   - Consider pagination for products with many serial numbers (100+)
   - Cache results if appropriate (with TTL based on update frequency)

**Action Required:**
- ✅ Create endpoint to retrieve serial numbers for a product
- ✅ Return array format (not wrapped object) - frontend expects array
- ✅ Implement role-based authorization checks
- ✅ Add optional filtering by status and owner
- ✅ Add pagination support for large datasets
- ✅ Return empty array `[]` if no serial numbers (not an error)

### 5.2 Search Serial Number

**Endpoint:** `GET /api/serial-numbers/search?q=<serial_number>`

**Purpose:** Search for a serial number across all products

**Response:**
```json
{
  "serial_number": "SN001",
  "product": {
    "id": "product_id",
    "name": "Product Name",
    "model": "Model"
  },
  "created_at": "2026-01-23T10:00:00Z"
}
```

**Action Required:**
- Create endpoint to search for serial numbers

### 5.3 Delete Serial Number

**Endpoint:** `DELETE /api/serial-numbers/:id`

**Purpose:** Remove a serial number (e.g., when product is sold or returned)

**Action Required:**
- Create endpoint to delete serial numbers

---

## 6. Stock Addition Flow

### 6.1 Current Flow
1. User edits product
2. Enters quantity to add
3. Product quantity is updated

### 6.2 New Flow with Serial Numbers
1. User edits product
2. Enters quantity to add (e.g., 8)
3. **User enters serial numbers** (manual, barcode, or photo)
4. **System validates** serial numbers match quantity
5. **System stores** serial numbers in database
6. Product quantity is updated

**Backend Processing:**
```typescript
// Pseudo-code
async function addStockWithSerialNumbers(productId, stockToAdd, serialNumbers, imageFile) {
  // 1. Validate quantity
  if (stockToAdd <= 0) {
    throw new Error("Stock to add must be greater than 0");
  }
  
  // 2. Extract serial numbers from image if provided
  let extractedSerials = serialNumbers || [];
  if (imageFile) {
    extractedSerials = await extractSerialNumbersFromImage(imageFile);
  }
  
  // 3. Validate serial numbers match quantity
  if (extractedSerials.length !== stockToAdd) {
    throw new Error(`Expected ${stockToAdd} serial numbers, got ${extractedSerials.length}`);
  }
  
  // 4. Validate uniqueness
  await validateSerialNumberUniqueness(extractedSerials, productId);
  
  // 5. Store serial numbers
  const stockAddition = await createStockAddition(productId, stockToAdd, extractedSerials.length);
  await storeSerialNumbers(productId, extractedSerials, stockAddition.id);
  
  // 6. Update product quantity
  await updateProductQuantity(productId, stockToAdd);
  
  return {
    success: true,
    serialNumbersAdded: extractedSerials.length
  };
}
```

**Action Required:**
- Implement stock addition flow with serial number tracking
- Ensure atomicity (use database transactions)

---

## 7. Database Transactions

### 7.1 Atomic Operations

**When adding stock with serial numbers:**
- All operations must succeed or all must fail
- Use database transactions to ensure consistency

**Example:**
```typescript
await db.transaction(async (transaction) => {
  // 1. Create stock addition record
  const stockAddition = await StockAddition.create({
    product_id: productId,
    quantity_added: stockToAdd,
    added_by_id: userId
  }, { transaction });
  
  // 2. Store serial numbers
  for (const serial of serialNumbers) {
    await ProductSerialNumber.create({
      product_id: productId,
      serial_number: serial,
      stock_addition_id: stockAddition.id
    }, { transaction });
  }
  
  // 3. Update product quantity
  await Product.increment('quantity', {
    by: stockToAdd,
    where: { id: productId },
    transaction
  });
});
```

**Action Required:**
- Use database transactions for stock addition operations
- Ensure rollback on any error

---

## 8. Sales Integration (Future)

### 8.1 Link Serial Numbers to Sales

**When a product is sold:**
- Optionally link serial numbers to the sale
- Track which serial numbers were sold

**Schema Addition:**
```sql
ALTER TABLE sales_items ADD COLUMN serial_numbers JSON; -- Array of serial numbers
```

**Action Required:**
- Consider adding serial number tracking to sales (optional for now)

---

## 9. Testing Checklist

### 9.1 Serial Number Entry
- [ ] Manual entry: Can enter serial numbers separated by commas/newlines
- [ ] Barcode scanner: Can scan and add serial numbers one by one
- [ ] Photo upload: Can upload image and extract serial numbers
- [ ] Validation: Error when serial numbers don't match quantity
- [ ] Validation: Error when duplicate serial numbers are entered
- [ ] Validation: Error when serial number format is invalid

### 9.2 Stock Addition
- [ ] Stock addition with serial numbers updates product quantity (for existing products)
- [ ] Initial stock serial numbers are stored without incrementing quantity (for new products)
- [ ] Serial numbers are stored in database
- [ ] Serial numbers are linked to stock addition record
- [ ] Transaction rollback on error
- [ ] Two-step product creation: Product created first, then serial numbers added
- [ ] Backend correctly identifies initial stock vs. additional stock

### 9.3 API Endpoints
- [ ] `PUT /api/products/:id` accepts serial numbers
- [ ] `GET /api/products/:id/serial-numbers` returns serial numbers
- [ ] `GET /api/serial-numbers/search` finds serial numbers
- [ ] `DELETE /api/serial-numbers/:id` removes serial numbers

### 9.4 OCR Integration
- [ ] Photo upload extracts serial numbers correctly
- [ ] Handles various image formats (JPG, PNG, etc.)
- [ ] Handles various serial number formats
- [ ] Returns extracted serial numbers for confirmation

### 9.5 Excel/CSV File Processing
- [ ] Excel file (.xlsx) upload extracts serial numbers correctly
- [ ] Excel file (.xls) upload extracts serial numbers correctly
- [ ] CSV file upload extracts serial numbers correctly
- [ ] Handles header rows correctly (skips if present)
- [ ] Extracts serial numbers from first column only
- [ ] Validates file format before processing
- [ ] Returns error for unsupported file formats
- [ ] Returns error if file is corrupted
- [ ] Validates extracted serial numbers match quantity

---

## 10. Summary of Changes

### Database:
1. **Create `product_serial_numbers` table** - Store serial numbers
2. **Create `stock_additions` table** (optional) - Track stock additions
3. **Add indexes** for performance

### API Endpoints:
1. **Update `PUT /api/products/:id`** - Accept serial numbers
2. **Create `GET /api/products/:id/serial-numbers`** - Get serial numbers
3. **Create `GET /api/serial-numbers/search`** - Search serial numbers
4. **Create `DELETE /api/serial-numbers/:id`** - Delete serial numbers

### Validation:
1. **Uniqueness validation** - Ensure serial numbers are unique
2. **Format validation** - Validate serial number format
3. **Quantity matching** - Ensure serial numbers match quantity

### OCR Integration:
1. **Image upload handling** - Accept image files
2. **OCR extraction** - Extract serial numbers from images
3. **Format parsing** - Parse extracted text to serial numbers

### Excel/CSV Processing:
1. **File upload handling** - Accept Excel (.xlsx, .xls) and CSV files
2. **File parsing** - Extract serial numbers from first column
3. **Header detection** - Skip header rows if present
4. **Format validation** - Validate file format and structure

---

## 11. Quick Start Guide

1. **Create Database Tables:**
   ```sql
   CREATE TABLE product_serial_numbers (...);
   CREATE TABLE stock_additions (...);
   ```

2. **Update Product Update Endpoint:**
   ```typescript
   // In PUT /api/products/:id
   if (req.body.stock_to_add > 0) {
     const serialNumbers = req.body.serial_numbers || [];
     if (serialNumbers.length !== req.body.stock_to_add) {
       return res.status(400).json({ error: "Serial numbers must match quantity" });
     }
     await storeSerialNumbers(productId, serialNumbers);
   }
   ```

3. **Implement OCR (Optional):**
   ```typescript
   if (req.file && req.file.fieldname === 'serial_number_image') {
     const extractedSerials = await extractSerialNumbersFromImage(req.file);
     // Use extracted serial numbers
   }
   ```

4. **Implement Excel/CSV Processing:**
   ```typescript
   if (req.file && req.file.fieldname === 'serial_number_excel') {
     let extractedSerials: string[] = [];
     if (req.file.originalname.endsWith('.csv')) {
       extractedSerials = await extractSerialNumbersFromCSV(req.file);
     } else {
       extractedSerials = await extractSerialNumbersFromExcel(req.file);
     }
     // Validate and use extracted serial numbers
     if (extractedSerials.length !== stockToAdd) {
       return res.status(400).json({ 
         error: `Expected ${stockToAdd} serial numbers, found ${extractedSerials.length} in file` 
       });
     }
   }
   ```

---

## 12. Questions for Backend Team

1. **Serial Number Uniqueness:**
   - Should serial numbers be unique globally or per product?
   - How should duplicate serial numbers be handled?

2. **OCR Service:**
   - Which OCR service should we use? (Tesseract.js, Google Cloud Vision, AWS Textract, etc.)
   - What is the budget for OCR services?

3. **Excel/CSV Processing:**
   - Which library should we use for Excel parsing? (xlsx, exceljs, etc.)
   - Should we support both .xlsx and .xls formats?
   - How should we handle CSV files with different delimiters?
   - Should we support multiple sheets in Excel files?

3. **Serial Number Format:**
   - What format should serial numbers follow? (e.g., alphanumeric, length, pattern)
   - Should format be configurable per product?

4. **Stock Addition History:**
   - Do we need to track stock addition history?
   - Should we store who added stock and when?

5. **Sales Integration:**
   - Should serial numbers be linked to sales?
   - How should serial numbers be handled when products are sold?

---

## 13. Two-Step Product Creation Flow (Frontend Implementation)

### 13.1 Overview

The frontend now implements a two-step product creation process:
1. **Step 1:** Create product with basic details (name, model, category, quantity, etc.)
2. **Step 2:** Upload serial numbers for the created product (if quantity > 0)

### 13.2 API Flow

**Step 1: Create Product**
- Endpoint: `POST /api/products`
- Request Body:
  ```json
  {
    "name": "Product Name",
    "model": "Model",
    "category": "Category",
    "quantity": 8,
    "unit_price": 100,
    ...
  }
  ```
- Creates product with initial quantity
- Returns product ID

**Step 2: Add Serial Numbers**
- Endpoint: `PUT /api/products/:id`
- Request Body (FormData):
  ```
  stock_to_add: 8 (equals the initial quantity)
  serial_numbers: ["SN001", "SN002", ...] (JSON string)
  OR
  serial_number_image: <File> (for OCR)
  OR
  serial_number_excel: <File> (for Excel/CSV processing)
  ```
- Adds serial numbers to the created product
- `stock_to_add` will equal the product's current quantity (initial stock)

### 13.3 Backend Requirements

**Key Implementation Details:**

1. **Detect Initial Stock:**
   - When `stock_to_add === product.quantity`, this indicates serial numbers for initial stock
   - In this case, **DO NOT increment** the product quantity (it's already correct)
   - Only store the serial numbers

2. **Detect Additional Stock:**
   - When `stock_to_add < product.quantity`, this indicates adding stock to existing product
   - In this case, **increment** the product quantity by `stock_to_add`
   - Store the serial numbers

3. **Validation:**
   - Validate that `stock_to_add > 0`
   - Validate that serial numbers count matches `stock_to_add`
   - Validate serial number uniqueness
   - If `stock_to_add > product.quantity`, return error (cannot add more than current quantity for initial stock scenario)

**Action Required:**
- Update `PUT /api/products/:id` to:
  1. Check if `stock_to_add === product.quantity` (initial stock scenario)
  2. If initial stock: Store serial numbers only, don't increment quantity
  3. If additional stock: Store serial numbers AND increment quantity
  4. Add appropriate validation and error messages

**Example Implementation:**
```typescript
// In PUT /api/products/:id handler
if (req.body.stock_to_add > 0) {
  const product = await getProductById(productId);
  const isInitialStock = req.body.stock_to_add === product.quantity;
  
  // Extract and validate serial numbers
  const serialNumbers = await extractSerialNumbers(req.body);
  
  if (serialNumbers.length !== req.body.stock_to_add) {
    return res.status(400).json({
      error: `Expected ${req.body.stock_to_add} serial numbers, got ${serialNumbers.length}`
    });
  }
  
  // Store serial numbers
  await storeSerialNumbers(productId, serialNumbers);
  
  // Only increment quantity if adding to existing stock
  if (!isInitialStock) {
    await incrementProductQuantity(productId, req.body.stock_to_add);
  }
}
```

### 13.4 Testing Two-Step Flow

- [ ] Create product with quantity 8 → Product created successfully
- [ ] Add 8 serial numbers → Serial numbers stored, quantity remains 8
- [ ] Create product with quantity 0 → Product created, no Step 2
- [ ] Edit existing product, add 5 stock → Quantity incremented by 5, serial numbers stored

---

**Last Updated:** January 15, 2025  
**Priority:** High  
**Estimated Time:** 4-6 days (depending on OCR and Excel processing integration complexity)

---

## Related Changes

### Photo Upload Removed
- **Status:** Photo upload option has been removed from the frontend
- **Impact:** Backend OCR support for image extraction is **not required** at this time
- **Current Methods:** Manual Entry, Barcode Scanner, Excel Upload only

### Serial Number Range Transfer
- **New Feature:** See `BACKEND_CHANGES_SERIAL_NUMBER_RANGE_TRANSFER.md` for SuperAdmin → Admin transfer functionality
- **Summary:** SuperAdmin can now specify serial number ranges (from-to) when dispatching stock to Admin
- **Priority:** High (required for proper serial number ownership tracking)

### Serial Number Viewing in Product Edit Modal
- **New Feature:** Frontend now displays assigned serial numbers in the product edit modal
- **API Endpoint:** `GET /api/products/:id/serial-numbers` (see Section 5.1 for complete details)
- **Frontend Usage:** 
  - Eye icon button appears when serial numbers exist
  - Clicking opens a modal showing all assigned serial numbers
  - Displays count: "X serial number(s) assigned"
- **Backend Requirements:**
  - ✅ Endpoint must return **array format** (not wrapped object)
  - ✅ Include all fields: `id`, `serial_number`, `created_at`, `updated_at`, `status`, `owner_id`, `owner_type`
  - ✅ Implement role-based authorization (Super Admin, Admin, Agent)
  - ✅ Return empty array `[]` if no serial numbers exist (not an error)
  - ✅ Support optional filtering by `status` and `owner_id` query parameters
- **Priority:** High (required for product management UI)

### Serial Number Viewing in Product Edit Modal
- **New Feature:** Frontend now displays assigned serial numbers in the product edit modal
- **API Endpoint:** `GET /api/products/:id/serial-numbers` (see Section 5.1 for details)
- **Requirements:**
  - Endpoint must return array of serial numbers for the product
  - Include `id`, `serial_number`, `created_at`, `status`, `owner_id`, `owner_type` in response
  - Implement role-based authorization (Super Admin, Admin, Agent)
  - Support optional filtering by status and owner
  - Return empty array `[]` if no serial numbers exist (not an error)
- **Priority:** High (required for product management UI)
