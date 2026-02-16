"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle, Plus, Trash2 } from "lucide-react"
import { productsApi, adminInventoryApi, type Product, type AdminInventory } from "@/lib/api"
import { stockRequestsApi } from "@/lib/api"
import { authService } from "@/lib/auth"

interface AgentStockRequestModalProps {
  onClose: () => void
  onSuccess: () => void
}

export default function AgentStockRequestModal({ onClose, onSuccess }: AgentStockRequestModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [adminInventory, setAdminInventory] = useState<AdminInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [items, setItems] = useState<Array<{ product_id: string; quantity: number }>>([{ product_id: "", quantity: 0 }])
  const [notes, setNotes] = useState("")

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true)
        const currentUser = authService.getUser()
        // Check both created_by_id and admin_id (backend might use either)
        const adminId = currentUser?.created_by_id || currentUser?.admin_id

        if (!adminId) {
          setError("Unable to identify your admin. Please contact support.")
          setLoading(false)
          return
        }

        // Load all products
        const allProducts = await productsApi.getAll()
        
        // Load admin's inventory (products they have in stock)
        const adminStock = await adminInventoryApi.getByAdmin(adminId)
        setAdminInventory(adminStock)

        // Filter products to only show those the admin has in stock (quantity > 0)
        const availableProducts = allProducts.filter(product => {
          const inventoryItem = adminStock.find(inv => inv.product_id === product.id)
          return inventoryItem && inventoryItem.quantity > 0
        })

        setProducts(availableProducts)

        if (availableProducts.length === 0) {
          setError("Your admin currently has no products in stock. Please contact your admin.")
        }
      } catch (err: any) {
        console.error("Failed to load products:", err)
        setError(err.message || "Failed to load products")
      } finally {
        setLoading(false)
      }
    }
    loadProducts()
  }, [])

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: "product_id" | "quantity", value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (items.length === 0) {
      setError("Please add at least one product")
      return
    }
    
    // Validate each item
    for (const item of items) {
      if (!item.product_id || item.quantity <= 0) {
        setError("Please select a product and enter a valid quantity for all items")
        return
      }

      // Check if requested quantity exceeds admin's available stock
      const inventoryItem = adminInventory.find(inv => inv.product_id === item.product_id)
      const availableStock = inventoryItem?.quantity || 0
      
      if (item.quantity > availableStock) {
        const product = products.find(p => p.id === item.product_id)
        const productName = product ? `${product.name} ${product.model ? `- ${product.model}` : ''}` : 'Selected product'
        setError(`${productName}: Requested quantity (${item.quantity}) exceeds available stock (${availableStock})`)
        return
      }
    }

    try {
      setIsSubmitting(true)
      const currentUser = authService.getUser()
      // Check both created_by_id and admin_id (backend might use either)
      const adminId = currentUser?.created_by_id || currentUser?.admin_id
      
      if (!adminId) {
        setError("Unable to identify your admin. Please contact support.")
        setIsSubmitting(false)
        return
      }
      
      const requestData: any = {
        requested_from: adminId,
        items: items.map(item => ({ 
          product_id: item.product_id, 
          quantity: parseInt(item.quantity.toString()) 
        })),
        notes: notes || "Stock request from agent",
        status: "pending",
      }

      console.log("Creating stock request:", requestData)
      await stockRequestsApi.create(requestData)
      
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error("Failed to create stock request:", err)
      
      // Enhanced error handling
      if (err && typeof err.status === 'number') {
        const apiErrorRaw = err.data?.error || err.data?.message || err.message || ""
        const apiError = typeof apiErrorRaw === 'string' ? apiErrorRaw : JSON.stringify(apiErrorRaw)

        if (err.status === 400) {
          const validationErrors = err.data?.details || err.data?.error
          if (Array.isArray(validationErrors)) {
            setError(validationErrors.join(", "))
          } else if (typeof validationErrors === 'object' && validationErrors !== null) {
            const fieldErrors = Object.entries(validationErrors)
              .map(([field, message]) => `${field}: ${message}`)
              .join(", ")
            setError(fieldErrors || apiError || "Validation error. Please check your input.")
          } else {
            setError(apiError || "Validation error. Please check your input.")
          }
        } else {
          setError(apiError || err.message || `Server error (${err.status}). Please try again.`)
        }
      } else {
        setError(err.message || "Failed to create stock request. Please try again.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <Card className="bg-slate-800 border-slate-700 p-8 max-w-md w-full">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <p className="text-white">Loading products...</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-xl md:max-w-2xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-slate-800 pb-4 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Request Stock from Admin</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition flex-shrink-0 ml-2">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Products Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-300">Products *</label>
              <Button
                type="button"
                onClick={addItem}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                Add Product
              </Button>
            </div>
            
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                  <select
                    value={item.product_id}
                    onChange={(e) => updateItem(index, "product_id", e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 h-10"
                    required
                  >
                    <option value="">Select Product</option>
                      {products.map((product) => {
                        const inventoryItem = adminInventory.find(inv => inv.product_id === product.id)
                        const availableStock = inventoryItem?.quantity || 0
                        // Format: "Product Name - Model (Available: X units)" or "Product Name (Available: X units)"
                        const productDisplay = product.model && product.model !== product.name
                          ? `${product.name} - ${product.model}`
                          : product.name
                        return (
                      <option key={product.id} value={product.id}>
                            {productDisplay} (Available: {availableStock} units)
                      </option>
                        )
                      })}
                  </select>
                  </div>
                  
                  <div className="w-20 flex-shrink-0">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                      placeholder="Qty"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 h-10"
                      required
                    />
                  </div>

                  {items.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => removeItem(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-950 px-2 h-10 w-10 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add any additional notes or instructions..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <p className="text-sm text-blue-300">
              💡 <strong>Note:</strong> Only products that your admin has in stock are shown. Request stock from your admin. Once approved and transferred, you can use it for both B2B and B2C sales.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
