import { apiClient, type ApiClientError } from "./api-client"
import type { User, LoginResponse, LoginCredentials } from "./auth"
import { authService } from "./auth"

// Auth API - Inventory System
export const authApi = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>("/inventory-auth/login", credentials)
  },

  async getCurrentUser(): Promise<User> {
    return apiClient.get<User>("/inventory-auth/me")
  },

  async forgotPassword(username: string): Promise<{ message: string; resetToken?: string; expiresIn?: string }> {
    return apiClient.post<{ message: string; resetToken?: string; expiresIn?: string }>("/inventory-auth/forgot-password", { username })
  },

  async resetPassword(resetToken: string, newPassword: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>("/inventory-auth/reset-password", { resetToken, newPassword })
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>("/inventory-auth/change-password", { currentPassword, newPassword })
  },
}

// Users API
export const usersApi = {
  async getAll(role?: string): Promise<User[]> {
    const params = role ? { role } : undefined
    return apiClient.get<User[]>("/users", params)
  },

  async getAgents(): Promise<User[]> {
    // Try specific endpoint for agents first
    try {
      return await apiClient.get<User[]>("/users/agents")
    } catch (err) {
      // Fallback to role filter
      try {
        return await apiClient.get<User[]>("/users", { role: "agent" })
      } catch (err2) {
        // Try alternative endpoint for account role
        try {
          return await apiClient.get<User[]>("/account/agents")
        } catch (err3) {
          // Re-throw the original error
          throw err
        }
      }
    }
  },

  async getById(id: string): Promise<User> {
    return apiClient.get<User>(`/users/${id}`)
  },

  async create(user: {
    username: string
    password: string
    name: string
    role: string
    is_active?: boolean
  }): Promise<User> {
    return apiClient.post<User>("/users", user)
  },

  async update(id: string, updates: Partial<User>): Promise<User> {
    return apiClient.put<User>(`/users/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/users/${id}`)
  },
}

// Products API
export interface Product {
  id: string
  name: string
  model: string
  category: string
  wattage?: string
  unit_price: number
  selling_price?: number // Super Admin: explicit selling price (default = max cost from stock)
  central_stock?: number
  distributed_stock?: number
  total_stock?: number
  quantity?: number // For backward compatibility
  price?: number // For backward compatibility
  image?: string
  created_at?: string
  updated_at?: string
  serial_numbers?: string[] // May be returned by backend after create/update
  unit?: string
}

export interface ProductInventoryLevel {
  id: string
  name: string
  model: string
  category: string
  central_stock: number
  distributed_stock: number
  total_stock: number
}

export const productsApi = {
  async getAll(params?: { category?: string; search?: string }): Promise<Product[]> {
    return apiClient.get<Product[]>("/products", params)
  },

  async getById(id: string): Promise<Product> {
    return apiClient.get<Product>(`/products/${id}`)
  },

  async getInventoryLevels(): Promise<ProductInventoryLevel[]> {
    return apiClient.get<ProductInventoryLevel[]>("/products/inventory/levels")
  },

  async create(
    product: {
      name: string
      model: string
      category: string
      wattage?: string
      quantity: number
      unit_price: number
      unit?: string
      image?: File
      serial_numbers?: string[]
      default_price?: number
      serial_number_prices?: Record<string, number>
      product_name?: string
      product_category?: string
    }
  ): Promise<Product> {
    const formData = new FormData()
    formData.append("name", product.name)
    formData.append("model", product.model)
    formData.append("category", product.category)
    if (product.wattage) formData.append("wattage", product.wattage)
    formData.append("quantity", (product.quantity ?? 0).toString())
    formData.append("unit_price", (product.unit_price ?? 0).toString())
    if (product.unit) formData.append("unit", product.unit)
    if (product.image) formData.append("image", product.image)
    
    // Add serial numbers if provided
    if (product.serial_numbers && Array.isArray(product.serial_numbers)) {
      formData.append("serial_numbers", JSON.stringify(product.serial_numbers))
    }
    
    // Add pricing for serial numbers
    if (product.default_price !== undefined) {
      formData.append("default_price", product.default_price.toString())
    }
    if (product.serial_number_prices) {
      formData.append("serial_number_prices", JSON.stringify(product.serial_number_prices))
    }
    
    // Add product metadata for serial number association
    if (product.product_name) {
      formData.append("product_name", product.product_name)
    }
    if (product.product_category) {
      formData.append("product_category", product.product_category)
    }

    return apiClient.post<Product>("/products", formData, true)
  },

  async update(
    id: string,
    updates: Partial<Omit<Product, "id">> & { 
      image?: File
      serial_numbers?: string[]
      stock_to_add?: number
      default_price?: number
      serial_number_prices?: Record<string, number>
      product_name?: string
      product_category?: string
      use_max_cost_price?: boolean
      selling_price?: number
    }
  ): Promise<Product> {
    // Use FormData if we have image, serial_numbers, stock_to_add, or pricing fields
    if (updates.image || updates.serial_numbers || updates.stock_to_add !== undefined || 
        updates.default_price !== undefined || updates.serial_number_prices) {
      const formData = new FormData()
      
      // Handle image file
      if (updates.image) {
        formData.append("image", updates.image)
      }
      
      // Handle serial_numbers as JSON string array (backend requirement)
      if (updates.serial_numbers && Array.isArray(updates.serial_numbers)) {
        formData.append("serial_numbers", JSON.stringify(updates.serial_numbers))
      }
      
      // Handle stock_to_add (backend expects as string)
      if (updates.stock_to_add !== undefined) {
        formData.append("stock_to_add", updates.stock_to_add.toString())
      }
      
      // Handle pricing for serial numbers
      if (updates.default_price !== undefined) {
        formData.append("default_price", updates.default_price.toString())
      }
      if (updates.serial_number_prices) {
        formData.append("serial_number_prices", JSON.stringify(updates.serial_number_prices))
      }
      
      // Add product metadata for serial number association
      if (updates.product_name) {
        formData.append("product_name", updates.product_name)
      }
      if (updates.product_category) {
        formData.append("product_category", updates.product_category)
      }
      
      // Super Admin: selling price options
      if (updates.use_max_cost_price !== undefined) {
        formData.append("use_max_cost_price", String(updates.use_max_cost_price))
      }
      if (updates.selling_price !== undefined && updates.selling_price > 0) {
        formData.append("selling_price", updates.selling_price.toString())
      }
      
      // Handle other fields
      Object.keys(updates).forEach((key) => {
        const value = updates[key as keyof typeof updates]
        if (key !== "image" && key !== "serial_numbers" && key !== "stock_to_add" && 
            key !== "default_price" && key !== "serial_number_prices" && 
            key !== "product_name" && key !== "product_category" &&
            key !== "use_max_cost_price" && key !== "selling_price" && value !== undefined) {
          formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value))
        }
      })
      
      return apiClient.put<Product>(`/products/${id}`, formData, true)
    }
    return apiClient.put<Product>(`/products/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/products/${id}`)
  },
}

// Serial Numbers API
export interface SerialNumber {
  id: string
  product_id: string
  serial_number: string
  created_at?: string
  updated_at?: string
  cost_price?: number
  product_name?: string
  category?: string
  status?: string
}

export interface SerialNumberSearchResult {
  serial_number: string
  product: {
    id: string
    name: string
    model: string
  }
  created_at?: string
}

export const serialNumbersApi = {
  async getByProduct(productId: string): Promise<SerialNumber[]> {
    return apiClient.get<SerialNumber[]>(`/products/${productId}/serial-numbers`)
  },

  async search(query: string): Promise<SerialNumberSearchResult | null> {
    return apiClient.get<SerialNumberSearchResult | null>(`/serial-numbers/search`, { q: query })
  },

  async delete(serialNumberId: string): Promise<void> {
    return apiClient.delete<void>(`/serial-numbers/${serialNumberId}`)
  },
}

// Categories API
export interface Category {
  label: string
}

export const categoriesApi = {
  async getAll(): Promise<Category[]> {
    return apiClient.get<Category[]>("/categories")
  },

  async getByLabel(label: string): Promise<Category> {
    return apiClient.get<Category>(`/categories/${label}`)
  },

  async create(label: string): Promise<Category> {
    return apiClient.post<Category>("/categories", { label })
  },
}

// Stock Requests API
export interface StockRequestItem {
  product_id: string
  quantity: number
}

export interface StockRequest {
  id: string
  requested_from: "super-admin" | string  // Can be "super-admin" or admin ID string
  requested_by_id: string
  requested_by_name?: string
  items: Array<{
    id?: string
    product_id: string
    product?: Product
    quantity: number
  }>
  status: "pending" | "dispatched" | "confirmed" | "rejected"
  notes?: string
  rejection_reason?: string
  dispatch_image?: string
  confirmation_image?: string
  created_at: string
  updated_at: string
  dispatched_at?: string
  confirmed_at?: string
  // Backend fields
  primary_product_name?: string
  requested_date?: string
  // Legacy fields for backward compatibility
  productName?: string
  model?: string
  quantity?: number
  adminName?: string
  requestedDate?: string
  rejectionReason?: string
}

export const stockRequestsApi = {
  async getAll(params?: {
    status?: string
    requested_by_id?: string
    requested_from?: string
  }): Promise<StockRequest[]> {
    return apiClient.get<StockRequest[]>("/stock-requests", params)
  },

  async getById(id: string): Promise<StockRequest> {
    return apiClient.get<StockRequest>(`/stock-requests/${id}`)
  },

  async create(request: {
    requested_from: "super-admin" | string  // Can be "super-admin" or admin ID for admin-to-admin transfers
    items: StockRequestItem[]
    notes?: string
    billing_address?: {
      line1: string
      line2?: string
      city: string
      state: string
      postal_code: string
      country: string
    }
    delivery_address?: {
      line1: string
      line2?: string
      city: string
      state: string
      postal_code: string
      country: string
    }
    customer_name?: string
    company_name?: string
    gst_number?: string
    contact_person?: string
    customer_email?: string
    customer_phone?: string
    request_type?: "b2b" | "b2c"
  }): Promise<StockRequest> {
    return apiClient.post<StockRequest>("/stock-requests", request)
  },

  async dispatch(
    id: string,
    data?: {
      rejection_reason?: string
      dispatch_image?: File
      serial_number_ranges?: Record<string, { from: string; to: string }>
    }
  ): Promise<StockRequest> {
    if (data?.dispatch_image) {
      const formData = new FormData()
      if (data.rejection_reason) {
        formData.append("rejection_reason", data.rejection_reason)
      }
      formData.append("dispatch_image", data.dispatch_image)
      if (data.serial_number_ranges) {
        formData.append("serial_number_ranges", JSON.stringify(data.serial_number_ranges))
      }
      return apiClient.post<StockRequest>(`/stock-requests/${id}/dispatch`, formData, true)
    }
    const body: any = {}
    if (data?.rejection_reason) {
      body.rejection_reason = data.rejection_reason
    }
    if (data?.serial_number_ranges) {
      body.serial_number_ranges = data.serial_number_ranges
    }
    return apiClient.post<StockRequest>(`/stock-requests/${id}/dispatch`, body)
  },

  async confirm(id: string, confirmation_image?: File): Promise<StockRequest> {
    if (confirmation_image) {
      const formData = new FormData()
      formData.append("confirmation_image", confirmation_image)
      return apiClient.post<StockRequest>(`/stock-requests/${id}/confirm`, formData, true)
    }
    return apiClient.post<StockRequest>(`/stock-requests/${id}/confirm`, {})
  },

  async update(
    id: string,
    updates: {
      items?: StockRequestItem[]
      notes?: string
    }
  ): Promise<StockRequest> {
    return apiClient.put<StockRequest>(`/stock-requests/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/stock-requests/${id}`)
  },
}

// Sales API
export interface SaleItem {
  product_id: string
  quantity: number
  unit_price: number
  gst_rate?: number
}

export interface Sale {
  id: string
  type: "B2B" | "B2C"
  customer_name: string
  items: Array<{
    id?: string
    product_id: string
    product?: Product
    quantity: number
    unit_price: number
    gst_rate: number
    subtotal: number
  }>
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  payment_status: "pending" | "completed"
  billing_address_id?: string
  delivery_address_id?: string
  billing_address?: {
    line1: string
    line2?: string
    city: string
    state: string
    postal_code: string
    country: string
  }
  delivery_address?: {
    line1: string
    line2?: string
    city: string
    state: string
    postal_code: string
    country: string
  }
  delivery_matches_billing?: boolean
  company_name?: string
  gst_number?: string
  contact_person?: string
  customer_email?: string
  customer_phone?: string
  notes?: string
  image?: string
  bill_image?: string
  created_by_id: string
  created_by_name?: string
  created_at: string
  updated_at: string
  // Account approval: when approved, Download is shown; pending = no download
  approval_status?: "pending" | "approved"
  // Legacy fields for backward compatibility
  productName?: string
  quantity?: number
  totalAmount?: number
  saleDate?: string
  agent_name?: string
}

export interface SaleSummary {
  type: "B2B" | "B2C"
  payment_status: "pending" | "completed"
  sale_count: number
  total_quantity: number
  total_revenue: number
  total_subtotal: number
}

export const salesApi = {
  async getAll(params?: {
    type?: string
    payment_status?: string
    customer_name?: string
    start_date?: string
    end_date?: string
  }): Promise<Sale[]> {
    return apiClient.get<Sale[]>("/sales", params)
  },

  async getSummary(): Promise<SaleSummary[]> {
    return apiClient.get<SaleSummary[]>("/sales/summary")
  },

  async getById(id: string): Promise<Sale> {
    return apiClient.get<Sale>(`/sales/${id}`)
  },

  async create(
    sale: {
      type: "B2B" | "B2C"
      customer_name: string
      items: SaleItem[]
      tax_amount: number
      discount_amount?: number
      billing_address_id?: string
      delivery_address_id?: string
      billing_address?: {
        line1: string
        line2?: string
        city: string
        state: string
        postal_code: string
        country: string
      }
      delivery_address?: {
        line1: string
        line2?: string
        city: string
        state: string
        postal_code: string
        country: string
      }
      delivery_matches_billing?: boolean
      company_name?: string
      gst_number?: string
      contact_person?: string
      customer_email?: string
      customer_phone?: string
      notes?: string
      image?: File
    }
  ): Promise<Sale> {
    if (sale.image) {
      const formData = new FormData()
      Object.keys(sale).forEach((key) => {
        const value = sale[key as keyof typeof sale]
        if (key === "image" && value instanceof File) {
          formData.append(key, value)
        } else if (key === "items") {
          formData.append(key, JSON.stringify(value))
        } else if (value !== undefined && key !== "image") {
          formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value))
        }
      })
      return apiClient.post<Sale>("/sales", formData, true)
    }
    return apiClient.post<Sale>("/sales", sale)
  },

  async update(id: string, updates: Partial<Sale>): Promise<Sale> {
    return apiClient.put<Sale>(`/sales/${id}`, updates)
  },

  async confirmBill(id: string, bill_image: File): Promise<Sale> {
    const formData = new FormData()
    formData.append("bill_image", bill_image)
    return apiClient.post<Sale>(`/sales/${id}/confirm-bill`, formData, true)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/sales/${id}`)
  },
}

// Inventory Transactions API
export interface InventoryTransaction {
  id: string
  product_id: string
  product?: Product
  transaction_type: "purchase" | "sale" | "adjustment" | "return" | "transfer"
  quantity: number
  reference: string
  notes?: string
  related_stock_request_id?: string
  related_sale_id?: string
  created_at: string
  // Legacy fields
  type?: "purchase" | "sale" | "return" | "adjustment"
  timestamp?: string
}

export const inventoryTransactionsApi = {
  async getAll(params?: {
    product_id?: string
    transaction_type?: string
    start_date?: string
    end_date?: string
  }): Promise<InventoryTransaction[]> {
    return apiClient.get<InventoryTransaction[]>("/inventory-transactions", params)
  },

  async getById(id: string): Promise<InventoryTransaction> {
    return apiClient.get<InventoryTransaction>(`/inventory-transactions/${id}`)
  },

  async create(transaction: {
    product_id: string
    transaction_type: string
    quantity: number
    reference: string
    notes?: string
    related_stock_request_id?: string
    related_sale_id?: string
  }): Promise<InventoryTransaction> {
    return apiClient.post<InventoryTransaction>("/inventory-transactions", transaction)
  },
}

// Admin Inventory API
export interface AdminInventory {
  id: string
  admin_id: string
  admin?: User
  product_id: string
  product?: Product
  quantity: number
  created_at: string
  updated_at: string
}

export const adminInventoryApi = {
  async getAll(admin_id?: string): Promise<AdminInventory[]> {
    const params = admin_id ? { admin_id } : undefined
    return apiClient.get<AdminInventory[]>("/admin-inventory", params)
  },

  async getByAdmin(adminId: string): Promise<AdminInventory[]> {
    return apiClient.get<AdminInventory[]>(`/admin-inventory/admin/${adminId}`)
  },

  async createOrUpdate(inventory: {
    admin_id: string
    product_id: string
    quantity: number
  }): Promise<AdminInventory> {
    return apiClient.post<AdminInventory>("/admin-inventory", inventory)
  },

  async update(id: string, updates: { quantity: number }): Promise<AdminInventory> {
    return apiClient.put<AdminInventory>(`/admin-inventory/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/admin-inventory/${id}`)
  },
}

// Stock Returns API
export interface StockReturn {
  id: string
  admin_id: string
  admin?: User
  product_id: string
  product?: Product
  quantity: number
  reason: string
  status: "pending" | "processed"
  created_at: string
  updated_at: string
  processed_at?: string
}

export const stockReturnsApi = {
  async getAll(params?: {
    admin_id?: string
    status?: string
    start_date?: string
    end_date?: string
  }): Promise<StockReturn[]> {
    return apiClient.get<StockReturn[]>("/stock-returns", params)
  },

  async getById(id: string): Promise<StockReturn> {
    return apiClient.get<StockReturn>(`/stock-returns/${id}`)
  },

  async create(returnData: {
    product_id: string
    quantity: number
    reason: string
  }): Promise<StockReturn> {
    return apiClient.post<StockReturn>("/stock-returns", returnData)
  },

  async process(id: string): Promise<StockReturn> {
    return apiClient.post<StockReturn>(`/stock-returns/${id}/process`, {})
  },

  async update(id: string, updates: { quantity?: number; reason?: string }): Promise<StockReturn> {
    return apiClient.put<StockReturn>(`/stock-returns/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/stock-returns/${id}`)
  },
}

// Quotations API (for B2C Sales)
export interface QuotationDealer {
  id: string
  firstName: string
  lastName: string
  email?: string
  mobile?: string
  username?: string
  role?: string
}

export interface QuotationCustomer {
  id?: string
  firstName: string
  lastName: string
  mobile: string
  email?: string | null
  address?: {
    street?: string
    city?: string
    state?: string
    pincode?: string
  }
}

export interface QuotationProducts {
  systemType: string
  phase?: string
  panelBrand?: string
  panelSize?: string
  panelQuantity?: number
  dcrPanelBrand?: string | null
  dcrPanelSize?: string | null
  dcrPanelQuantity?: number | null
  nonDcrPanelBrand?: string | null
  nonDcrPanelSize?: string | null
  nonDcrPanelQuantity?: number | null
  inverterType?: string
  inverterBrand?: string
  inverterSize?: string
  structureType?: string
  structureSize?: string
  meterBrand?: string
  acCableBrand?: string
  acCableSize?: string
  dcCableBrand?: string
  dcCableSize?: string
  acdb?: string
  dcdb?: string
  hybridInverter?: string | null
  batteryCapacity?: string | null
  centralSubsidy?: number
  stateSubsidy?: number
}

export interface QuotationPricing {
  panelPrice?: number
  inverterPrice?: number
  structurePrice?: number
  meterPrice?: number
  cablePrice?: number
  acdbDcdbPrice?: number
  subtotal: number
  centralSubsidy?: number
  stateSubsidy?: number
  totalSubsidy?: number
  totalAmount: number
  amountAfterSubsidy?: number
  discountAmount?: number
  finalAmount: number
}

export interface Quotation {
  id: string
  dealerId?: string
  dealer?: QuotationDealer
  customer: QuotationCustomer
  finalAmount?: number
  products?: QuotationProducts
  pricing?: QuotationPricing
  status: string
  discount?: string
  documents?: any
  paymentMode?: string | null
  paidAmount?: number | null
  paymentDate?: string | null
  paymentStatus?: string | null
  createdAt: string
  validUntil?: string
}

export interface QuotationsListResponse {
  success: boolean
  data: {
    quotations: Quotation[]
  }
}

export interface QuotationDetailResponse {
  success: boolean
  data: Quotation
}

// Agent-Dealer mapping API
export interface AgentDealerResponse {
  dealerId: string
  agentId: string
}

export const agentDealerApi = {
  async getDealerId(): Promise<string | null> {
    try {
      const response = await apiClient.get<AgentDealerResponse>("/inventory-auth/agent-dealer")
      console.log("Agent-Dealer mapping response:", response)
      return response.dealerId || null
    } catch (err: any) {
      console.error("Error fetching agent-dealer mapping:", err)
      // Return null if agent doesn't have a dealerId mapped
      return null
    }
  },
}

export const quotationsApi = {
  async getAll(dealerId?: string): Promise<Quotation[]> {
    try {
      // For agents: first get their dealerId, then fetch quotations
      let targetDealerId = dealerId
      
      // If dealerId not provided, try to get it for agents
      if (!targetDealerId) {
        try {
          const currentUser = authService.getUser()
          if (currentUser?.role === "agent") {
            console.log("Agent detected, fetching dealerId...")
            targetDealerId = await agentDealerApi.getDealerId()
            if (!targetDealerId) {
              console.warn("Agent does not have a dealerId mapped. Quotations may not be available.")
              return []
            }
            console.log("Found dealerId for agent:", targetDealerId)
          }
        } catch (err: any) {
          console.error("Error getting dealerId for agent:", err)
          // Continue without dealerId - might be admin/super-admin
        }
      }

      // Build query params
      const params: Record<string, string> | undefined = targetDealerId 
        ? { dealerId: targetDealerId }
        : undefined
      
      console.log("Fetching quotations from /admin/quotations", params ? `with dealerId: ${params.dealerId}` : "without dealerId")
      const response = await apiClient.get<any>("/admin/quotations", params)
      console.log("Quotations API raw response:", response)
      
      // Handle different response formats
      // Format 1: { success: true, data: { quotations: [...] } }
      if (response && typeof response === 'object') {
        if (response.success && response.data?.quotations && Array.isArray(response.data.quotations)) {
          console.log("Found quotations in response.data.quotations:", response.data.quotations.length)
          return response.data.quotations
        }
        
        // Format 2: { success: true, data: [...] } (data is directly the array)
        if (response.success && Array.isArray(response.data)) {
          console.log("Found quotations in response.data:", response.data.length)
          return response.data
        }
        
        // Format 3: { quotations: [...] }
        if (Array.isArray(response.quotations)) {
          console.log("Found quotations in response.quotations:", response.quotations.length)
          return response.quotations
        }
        
        // Format 4: Response is directly an array
        if (Array.isArray(response)) {
          console.log("Response is directly an array:", response.length)
          return response
        }
      }
      
      console.warn("Unexpected quotations response format:", response)
      console.warn("Response type:", typeof response)
      console.warn("Response keys:", response && typeof response === 'object' ? Object.keys(response) : 'N/A')
      return []
    } catch (err: any) {
      console.error("Error fetching quotations:", err)
      console.error("Error details:", {
        message: err.message,
        status: err.status,
        data: err.data
      })
      // Return empty array instead of throwing to allow manual entry
      return []
    }
  },

  async getById(id: string): Promise<Quotation> {
    try {
      const response = await apiClient.get<QuotationDetailResponse>(`/quotations/${id}`)
      console.log("Quotation detail API response:", response)
      
      // Handle different response formats
      if (response.success && response.data) {
        return response.data
      } else if (response.id) {
        // If response is directly the quotation object
        return response as Quotation
      }
      
      throw new Error("Unexpected quotation detail response format")
    } catch (err: any) {
      console.error("Error fetching quotation details:", err)
      throw err
    }
  },
}

export type { ApiClientError }

