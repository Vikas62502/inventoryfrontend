# Backend Changes Required: Quotations Integration for B2C Sales

## Overview
The frontend has been updated to integrate quotations API with B2C sales. Agents can now select customers from existing quotations, and all customer details will auto-fill from the quotation data.

### Additional update (June 2026)

The sales modal now also supports **phone-based prefill** from:
1. **Latest quotation** by mobile (`GET /api/quotations/customer-by-phone`) — **new, preferred**
2. **Latest prior sale** by mobile (`GET /api/sales/customer-by-phone`) — fallback

Also: unit-aware stock display in agent stock-out, multiple PI/sales per customer phone.

- Multiple PI/sales for the same customer phone are allowed.
- Customer profile should be prefillable by phone (quotation first, then sale).
- Product `unit` must be returned reliably for proper stock labels (Meters, Quantity, Pieces, etc.).

---

## 🎯 Current Status

**Frontend Status**: ✅ Complete and Ready  
**Backend Status**: ⏳ Deploy `GET /api/quotations/customer-by-phone` (implemented in `inventorybackend`, needs production deploy)

---

## 📋 API Endpoints Required

### 1. Get All Quotations (List)

**Endpoint**: `GET /api/admin/quotations`

**Purpose**: Fetch all quotations for the logged-in agent/dealer to populate the customer dropdown in B2C sales form.

**Authorization**: 
- Should return quotations for the logged-in user (agent/dealer)
- Or return all quotations if accessed by admin/super-admin

**Response Format**:
```json
{
  "success": true,
  "data": {
    "quotations": [
      {
        "id": "QT-50FCED",
        "dealer": {
          "id": "dealer_63c7f642-c3ab-4a64-886a-1f21d69087f8",
          "firstName": "sanju",
          "lastName": "shekhawat"
        },
        "customer": {
          "firstName": "marudhar ",
          "lastName": "kanwar",
          "mobile": "9057205471"
        },
        "systemType": "dcr",
        "finalAmount": 190000,
        "status": "pending",
        "createdAt": "2026-01-23T06:09:52.116Z"
      }
    ]
  }
}
```

**Required Fields**:
- ✅ `id` - Quotation ID
- ✅ `customer.firstName` - Customer first name
- ✅ `customer.lastName` - Customer last name
- ✅ `customer.mobile` - Customer phone number
- ✅ `status` - Quotation status
- ✅ `createdAt` - Creation date

**Optional Fields**:
- `dealer` - Dealer information
- `systemType` - System type
- `finalAmount` - Final amount

---

### 2. Get Quotation Details

**Endpoint**: `GET /api/quotations/{quotationId}`

**Purpose**: Fetch complete quotation details including full customer address and all product information.

**Authorization**: 
- Should allow access to the quotation owner (dealer/agent)
- Or admin/super-admin for all quotations

**Response Format**:
```json
{
  "success": true,
  "data": {
    "id": "QT-50FCED",
    "dealerId": "dealer_63c7f642-c3ab-4a64-886a-1f21d69087f8",
    "dealer": {
      "id": "dealer_63c7f642-c3ab-4a64-886a-1f21d69087f8",
      "firstName": "sanju",
      "lastName": "shekhawat",
      "email": "chairbordsolar4733@gmail.com",
      "mobile": "7014814733",
      "username": "sanjushekhawat",
      "role": "dealer"
    },
    "customer": {
      "id": "16c4d157-ab18-475b-b075-aee6bebb54ee",
      "firstName": "marudhar ",
      "lastName": "kanwar",
      "mobile": "9057205471",
      "email": null,
      "address": {
        "street": "jaipur",
        "city": "jaipur",
        "state": "Rajasthan",
        "pincode": "302012"
      }
    },
    "products": {
      "systemType": "dcr",
      "phase": "1-Phase",
      "panelBrand": "Tata",
      "panelSize": "555W",
      "panelQuantity": 9,
      "inverterType": "String Inverter",
      "inverterBrand": "GoodWe",
      "inverterSize": "5kW",
      "structureType": "GI Structure",
      "structureSize": "5kW",
      "meterBrand": "L&T",
      "acCableBrand": "Polycab",
      "acCableSize": "4 sq mm",
      "dcCableBrand": "Polycab",
      "dcCableSize": "4 sq mm",
      "acdb": "Havells (1-Phase)",
      "dcdb": "Havells (1-Phase)",
      "centralSubsidy": 78000,
      "stateSubsidy": 17000
    },
    "pricing": {
      "subtotal": 285000,
      "centralSubsidy": 78000,
      "stateSubsidy": 17000,
      "totalSubsidy": 95000,
      "totalAmount": 190000,
      "finalAmount": 190000
    },
    "status": "pending",
    "createdAt": "2026-01-23T06:09:52.116Z",
    "validUntil": "2026-01-28"
  }
}
```

**Required Fields for Customer Auto-Fill**:
- ✅ `customer.firstName` - Customer first name
- ✅ `customer.lastName` - Customer last name
- ✅ `customer.mobile` - Customer phone number
- ✅ `customer.email` - Customer email (can be null)
- ✅ `customer.address.street` - Street address
- ✅ `customer.address.city` - City
- ✅ `customer.address.state` - State
- ✅ `customer.address.pincode` - Postal code

**Optional Fields**:
- `customer.id` - Customer ID
- `dealer` - Dealer information
- `products` - Product details
- `pricing` - Pricing information

---

### 3. Get Customer by Phone (from Quotation) — **NEW**

**Endpoint**: `GET /api/quotations/customer-by-phone?phone={mobile}`

**Purpose**: When agent types a phone number in B2C/B2B stock-out (without selecting from quotation dropdown), fetch customer name + full address from the **latest quotation** for that mobile — same data as `GET /api/quotations/{id}` but keyed by phone.

**Route order**: Must be registered **before** `GET /api/quotations/:quotationId` (literal path `customer-by-phone`).

**Authorization**: Same as quotation read (`authorizeDealerAdminOrVisitor`):
- Inventory agents: quotations for mapped dealer only
- Inventory admin / super-admin: all quotations
- Account managers: approved quotations only
- Dealers: own quotations; dealer admins: all

**Query params**:
| Param | Required | Description |
|-------|----------|-------------|
| `phone` | Yes | 10-digit mobile (also accepts `+91`, spaces) |

**Success response (200)**:
```json
{
  "success": true,
  "source": "quotation",
  "customer": {
    "customer_name": "Ravi Sharma",
    "customer_phone": "9876543210",
    "customer_email": "ravi@example.com",
    "company_name": null,
    "gst_number": null,
    "contact_person": "Ravi Sharma",
    "billing_address": {
      "line1": "Sitapura Industrial Area",
      "line2": "",
      "city": "Jaipur",
      "state": "Rajasthan",
      "postal_code": "302022",
      "country": "India"
    },
    "delivery_address": {
      "line1": "Sitapura Industrial Area",
      "line2": "",
      "city": "Jaipur",
      "state": "Rajasthan",
      "postal_code": "302022",
      "country": "India"
    },
    "delivery_matches_billing": true
  },
  "quotation": {
    "id": "QT-C0FMAY",
    "status": "approved",
    "created_at": "2026-06-18T10:00:00.000Z"
  }
}
```

**Address mapping** (quotation DB → inventory sales form):

| Quotation `customer` field | Response field |
|----------------------------|----------------|
| `streetAddress` | `billing_address.line1` |
| `city` | `billing_address.city` |
| `state` | `billing_address.state` |
| `pincode` | `billing_address.postal_code` |
| — | `billing_address.country` = `"India"` |

**Errors**:
| Status | When |
|--------|------|
| `400` | Invalid / missing phone |
| `404` | No customer or no accessible quotation for this phone |
| `500` | Server error |

**Implementation** (`inventorybackend`):
- Controller: `getQuotationCustomerByPhone` in `controllers/quotationController.ts`
- Route: `routes/quotationRoutes.ts` → `GET /customer-by-phone`

---

### 4. Get Customer by Phone (from Sales) — Fallback

**Endpoint**: `GET /api/sales/customer-by-phone?phone={mobile}`

**Purpose**: If no quotation exists for the phone, prefill from the latest B2B/B2C sale.

**Success response (200)**:
```json
{
  "customer": {
    "customer_name": "ABC Solar",
    "customer_phone": "9876543210",
    "customer_email": "abc@example.com",
    "company_name": "ABC Solar Pvt Ltd",
    "gst_number": "08ABCDE1234F1Z5",
    "contact_person": "Ravi Sharma",
    "billing_address": { "line1": "...", "city": "...", "state": "...", "postal_code": "...", "country": "India" },
    "delivery_address": { "..." : "..." },
    "delivery_matches_billing": true
  },
  "latest_sale": { "..." },
  "recent_sales": [ "..." ]
}
```

**404** if no sale found for phone.

---

## Frontend phone prefill flow (June 2026)

```
Agent types phone in B2C/B2B form → on 10th digit (auto)
    ↓
1. GET /api/quotations/customer-by-phone?phone=...
    ↓ (if 404)
2. GET /api/sales/customer-by-phone?phone=...
    ↓
Auto-fill name, email, billing + delivery address
```

Quotation dropdown still uses `GET /api/quotations/{id}` when agent picks a quotation explicitly.

---

## 🔐 Authorization Requirements

### Access Control

**For Agents:**
- Should only see quotations created by them or assigned to them
- Filter by `dealerId` matching the logged-in agent's ID

**For Admins/Super-Admins:**
- Can see all quotations
- No filtering required

**Example Authorization Logic:**
```javascript
// Get current user from JWT token
const currentUser = req.user

// Filter quotations based on role
let quotations
if (currentUser.role === 'agent') {
  // Agents see only their own quotations
  quotations = await Quotation.findAll({
    where: { dealerId: currentUser.id }
  })
} else if (currentUser.role === 'admin' || currentUser.role === 'super-admin') {
  // Admins see all quotations
  quotations = await Quotation.findAll()
} else {
  return res.status(403).json({ error: 'Access denied' })
}
```

---

## 💰 Quotation Pricing – Use Selling Price

**Important:** When an agent creates a quotation, all product amounts must use **selling_price** (separate field), not `unit_price` (cost price).

- **selling_price** = separate column in `products` table (set by Super Admin)
- **unit_price** = cost price – must NOT be used for quotation amounts
- Line-item rate = product selling price
- Line-item amount = quantity × selling price

See **BACKEND_CHANGES_COST_PRICE_SELLING_PRICE_SERIALS.md** (Section 4) for full details.

---

## 🗄️ Database Schema

### Quotations Table

Ensure the quotations table has the following structure:

```sql
CREATE TABLE quotations (
  id VARCHAR(50) PRIMARY KEY,
  dealer_id UUID REFERENCES users(id),
  customer_id UUID REFERENCES customers(id),
  system_type VARCHAR(50),
  final_amount DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  valid_until DATE,
  -- ... other fields
);

CREATE TABLE customers (
  id UUID PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  -- ... other fields
);

CREATE TABLE customer_addresses (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  street VARCHAR(255),
  city VARCHAR(255),
  state VARCHAR(255),
  pincode VARCHAR(20),
  -- ... other fields
);
```

---

## 📊 Data Mapping

### Quotation → B2C Sale Form Fields

| Quotation Field | B2C Sale Form Field | Mapping |
|----------------|---------------------|---------|
| `customer.firstName + lastName` | `customer_name` | Concatenated |
| `customer.mobile` | `customer_phone` | Direct |
| `customer.email` | `customer_email` | Direct (can be null) |
| `customer.address.street` | `billing_address.line1` | Direct |
| `customer.address.city` | `billing_address.city` | Direct |
| `customer.address.state` | `billing_address.state` | Direct |
| `customer.address.pincode` | `billing_address.postal_code` | Direct |
| - | `billing_address.country` | Default: "India" |
| - | `billing_address.line2` | Empty string |
| `billing_address` | `delivery_address` | Copy (same as billing) |

---

## 🧪 Testing Requirements

### Test Case 1: Get All Quotations
```bash
# Login as agent
POST /api/inventory-auth/login
{
  "username": "agent123",
  "password": "password123"
}

# Get quotations
GET /api/admin/quotations
Headers: { "Authorization": "Bearer jwt_token" }

# ✅ Expected Response:
{
  "success": true,
  "data": {
    "quotations": [
      {
        "id": "QT-50FCED",
        "customer": {
          "firstName": "marudhar",
          "lastName": "kanwar",
          "mobile": "9057205471"
        },
        "status": "pending",
        "createdAt": "2026-01-23T06:09:52.116Z"
      }
    ]
  }
}
```

### Test Case 2: Get Quotation Details
```bash
# Get specific quotation
GET /api/quotations/QT-50FCED
Headers: { "Authorization": "Bearer jwt_token" }

# ✅ Expected Response:
{
  "success": true,
  "data": {
    "id": "QT-50FCED",
    "customer": {
      "firstName": "marudhar",
      "lastName": "kanwar",
      "mobile": "9057205471",
      "email": null,
      "address": {
        "street": "jaipur",
        "city": "jaipur",
        "state": "Rajasthan",
        "pincode": "302012"
      }
    },
    "status": "pending",
    "createdAt": "2026-01-23T06:09:52.116Z"
  }
}
```

### Test Case 3: Agent Creates B2C Sale from Quotation
```bash
# 1. Agent selects quotation in dropdown
# 2. Frontend calls GET /api/quotations/QT-50FCED
# 3. Frontend auto-fills customer details
# 4. Agent creates sale with auto-filled data

# ✅ Expected: Sale created with customer details from quotation
```

---

## 🔧 Backend Code Examples

### Node.js/Express Example

```javascript
// routes/quotations.js

// Get all quotations (for dropdown)
router.get('/admin/quotations', authenticate, async (req, res) => {
  try {
    const currentUser = req.user
    
    let quotations
    
    // Filter by role
    if (currentUser.role === 'agent') {
      // Agents see only their quotations
      quotations = await Quotation.findAll({
        where: { dealerId: currentUser.id },
        include: [
          {
            model: Customer,
            attributes: ['firstName', 'lastName', 'mobile']
          },
          {
            model: Dealer,
            attributes: ['id', 'firstName', 'lastName']
          }
        ],
        attributes: ['id', 'systemType', 'finalAmount', 'status', 'createdAt'],
        order: [['createdAt', 'DESC']]
      })
    } else {
      // Admins see all quotations
      quotations = await Quotation.findAll({
        include: [
          {
            model: Customer,
            attributes: ['firstName', 'lastName', 'mobile']
          },
          {
            model: Dealer,
            attributes: ['id', 'firstName', 'lastName']
          }
        ],
        attributes: ['id', 'systemType', 'finalAmount', 'status', 'createdAt'],
        order: [['createdAt', 'DESC']]
      })
    }
    
    res.json({
      success: true,
      data: {
        quotations: quotations.map(q => ({
          id: q.id,
          dealer: q.dealer ? {
            id: q.dealer.id,
            firstName: q.dealer.firstName,
            lastName: q.dealer.lastName
          } : null,
          customer: {
            firstName: q.customer.firstName,
            lastName: q.customer.lastName,
            mobile: q.customer.mobile
          },
          systemType: q.systemType,
          finalAmount: q.finalAmount,
          status: q.status,
          createdAt: q.createdAt
        }))
      }
    })
  } catch (err) {
    console.error('Error fetching quotations:', err)
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch quotations' 
    })
  }
})

// Get quotation details
router.get('/quotations/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const currentUser = req.user
    
    const quotation = await Quotation.findByPk(id, {
      include: [
        {
          model: Customer,
          include: [
            {
              model: CustomerAddress,
              as: 'address'
            }
          ]
        },
        {
          model: Dealer
        },
        {
          model: QuotationProduct,
          as: 'products'
        },
        {
          model: QuotationPricing,
          as: 'pricing'
        }
      ]
    })
    
    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'Quotation not found'
      })
    }
    
    // Check authorization
    if (currentUser.role === 'agent' && quotation.dealerId !== currentUser.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      })
    }
    
    res.json({
      success: true,
      data: {
        id: quotation.id,
        dealerId: quotation.dealerId,
        dealer: quotation.dealer ? {
          id: quotation.dealer.id,
          firstName: quotation.dealer.firstName,
          lastName: quotation.dealer.lastName,
          email: quotation.dealer.email,
          mobile: quotation.dealer.mobile,
          username: quotation.dealer.username,
          role: quotation.dealer.role
        } : null,
        customer: {
          id: quotation.customer.id,
          firstName: quotation.customer.firstName,
          lastName: quotation.customer.lastName,
          mobile: quotation.customer.mobile,
          email: quotation.customer.email,
          address: quotation.customer.address ? {
            street: quotation.customer.address.street,
            city: quotation.customer.address.city,
            state: quotation.customer.address.state,
            pincode: quotation.customer.address.pincode
          } : null
        },
        products: quotation.products,
        pricing: quotation.pricing,
        status: quotation.status,
        createdAt: quotation.createdAt,
        validUntil: quotation.validUntil
      }
    })
  } catch (err) {
    console.error('Error fetching quotation:', err)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotation'
    })
  }
})
```

---

## 📋 Implementation Checklist

- [ ] Verify `GET /api/admin/quotations` endpoint exists and works
- [ ] Verify `GET /api/quotations/{id}` endpoint exists and works
- [ ] Ensure quotations include customer information (firstName, lastName, mobile)
- [ ] Ensure quotation details include full customer address
- [ ] Implement authorization (agents see only their quotations)
- [ ] Test quotation list endpoint returns correct format
- [ ] Test quotation details endpoint returns correct format
- [ ] Verify customer address structure matches expected format
- [ ] Test with agent role (should filter by dealerId)
- [ ] Test with admin role (should see all quotations)
- [ ] Handle edge cases (null email, missing address, etc.)

---

## ⚠️ Important Notes

### Response Format
- Both endpoints must return `{ success: true, data: {...} }` format
- List endpoint: `data.quotations` (array)
- Detail endpoint: `data` (single object)

### Customer Address
- Address must be nested in `customer.address` object
- Required fields: `street`, `city`, `state`, `pincode`
- Can be `null` if customer has no address

### Authorization
- Agents should only see quotations where `dealerId` matches their user ID
- Admins/Super-Admins can see all quotations
- Return 403 if unauthorized access attempted

### Error Handling
- Return 404 if quotation not found
- Return 403 if access denied
- Return 500 for server errors
- Always include `success: false` in error responses

---

## 🎯 Expected Behavior

### Frontend Flow:
1. Agent opens "Create B2C Sale" modal
2. Frontend calls `GET /api/admin/quotations`
3. Dropdown populates with quotations
4. Agent selects a quotation
5. Frontend calls `GET /api/quotations/{id}`
6. Customer details auto-fill:
   - Name: `${firstName} ${lastName}`
   - Phone: `mobile`
   - Email: `email` (if available)
   - Address: `address.street, city, state, pincode`
7. Agent can edit fields if needed
8. Agent creates sale

---

## 📊 Data Flow Diagram

```
Agent Opens B2C Sale Modal
    ↓
GET /api/admin/quotations
    ↓
Dropdown Shows: "Customer Name - Phone (QT-ID)"
    ↓
Agent Selects Quotation
    ↓
GET /api/quotations/{id}
    ↓
Auto-Fill Customer Details:
├─ Name: firstName + lastName
├─ Phone: mobile
├─ Email: email
└─ Address: street, city, state, pincode
    ↓
Agent Edits (Optional)
    ↓
Create Sale
```

---

## 🔍 Field Requirements Summary

### Minimum Required for Dropdown:
- `id` - Quotation ID
- `customer.firstName` - First name
- `customer.lastName` - Last name
- `customer.mobile` - Phone number

### Required for Auto-Fill:
- `customer.firstName` - First name
- `customer.lastName` - Last name
- `customer.mobile` - Phone number
- `customer.email` - Email (can be null)
- `customer.address.street` - Street address
- `customer.address.city` - City
- `customer.address.state` - State
- `customer.address.pincode` - Postal code

---

## 🧪 Test Scenarios

### Scenario 1: Agent with Quotations
- ✅ Agent logs in
- ✅ Opens B2C sale modal
- ✅ Sees quotations in dropdown
- ✅ Selects quotation
- ✅ Customer details auto-fill
- ✅ Can edit fields
- ✅ Creates sale

### Scenario 2: Agent without Quotations
- ✅ Agent logs in
- ✅ Opens B2C sale modal
- ✅ Dropdown shows "No quotations available"
- ✅ Can enter customer details manually
- ✅ Creates sale

### Scenario 3: Quotation with Missing Address
- ✅ Agent selects quotation
- ✅ Quotation has no address
- ✅ Address fields remain empty
- ✅ Agent can fill manually
- ✅ Creates sale

### Scenario 4: Unauthorized Access
- ❌ Agent tries to access another agent's quotation
- ✅ Returns 403 Forbidden
- ✅ Frontend shows error message

---

## 📝 API Response Examples

### Success Response (List):
```json
{
  "success": true,
  "data": {
    "quotations": [
      {
        "id": "QT-50FCED",
        "customer": {
          "firstName": "marudhar",
          "lastName": "kanwar",
          "mobile": "9057205471"
        },
        "status": "pending",
        "createdAt": "2026-01-23T06:09:52.116Z"
      }
    ]
  }
}
```

### Success Response (Details):
```json
{
  "success": true,
  "data": {
    "id": "QT-50FCED",
    "customer": {
      "firstName": "marudhar",
      "lastName": "kanwar",
      "mobile": "9057205471",
      "email": null,
      "address": {
        "street": "jaipur",
        "city": "jaipur",
        "state": "Rajasthan",
        "pincode": "302012"
      }
    }
  }
}
```

### Error Response:
```json
{
  "success": false,
  "error": "Quotation not found"
}
```

---

## ✅ Verification Steps

1. **Test List Endpoint:**
   ```bash
   curl -X GET http://localhost:3050/api/admin/quotations \
     -H "Authorization: Bearer {token}"
   ```
   ✅ Should return quotations array

2. **Test Details Endpoint:**
   ```bash
   curl -X GET http://localhost:3050/api/quotations/QT-50FCED \
     -H "Authorization: Bearer {token}"
   ```
   ✅ Should return full quotation with customer address

3. **Test Authorization:**
   - Login as Agent A
   - Try to access Agent B's quotation
   - ✅ Should return 403 Forbidden

4. **Test Frontend Integration:**
   - Open B2C sale modal
   - ✅ Dropdown should populate
   - Select quotation
   - ✅ Customer details should auto-fill

---

**Last Updated**: January 23, 2026  
**Frontend Status**: ✅ Complete  
**Backend Status**: ⏳ Needs Verification  
**Priority**: 🟡 MEDIUM (Enhancement feature)  
**Complexity**: 🟢 EASY (Endpoints likely already exist)
