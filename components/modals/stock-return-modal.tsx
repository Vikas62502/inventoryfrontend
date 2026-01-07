"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle, Plus } from "lucide-react"
import { productsApi, stockReturnsApi, type Product } from "@/lib/api"

interface StockReturnModalProps {
  onClose: () => void
  onSuccess: () => void
  userRole: "agent" | "admin" // Role determines where stock is returned to
}

export default function StockReturnModal({
  onClose,
  onSuccess,
  userRole,
}: StockReturnModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [items, setItems] = useState<Array<{ product_id: string; quantity: number; reason: string }>>([])

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const productsData = await productsApi.getAll()
        setProducts(productsData)
      } catch (err: any) {
        setError(err.message || "Failed to load products")
      } finally {
        setLoading(false)
      }
    }
    loadProducts()
  }, [])

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 0, reason: "" }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: "product_id" | "quantity" | "reason", value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (items.length === 0) {
      setError("Please add at least one product to return")
      return
    }

    if (items.some((item) => !item.product_id || item.quantity <= 0 || !item.reason.trim())) {
      setError("Please fill all fields for each product (product, quantity, and reason)")
      return
    }

    setIsSubmitting(true)

    try {
      // Create stock returns for each item
      await Promise.all(
        items.map((item) =>
          stockReturnsApi.create({
            product_id: item.product_id,
            quantity: item.quantity,
            reason: item.reason,
          })
        )
      )

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to create stock return")
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
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Return Stock to {userRole === "agent" ? "Admin" : "Super Admin"}
          </h2>
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
          {/* Products to Return */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-slate-300">Products to Return</label>
              <Button
                type="button"
                onClick={addItem}
                variant="outline"
                size="sm"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-3 p-3 bg-slate-700/30 rounded-lg">
                  <select
                    value={item.product_id}
                    onChange={(e) => updateItem(index, "product_id", e.target.value)}
                    className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} - {product.model}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={item.quantity || ""}
                    onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                    placeholder="Quantity"
                    min="1"
                    className="w-full sm:w-24 px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                    required
                  />
                  <input
                    type="text"
                    value={item.reason}
                    onChange={(e) => updateItem(index, "reason", e.target.value)}
                    placeholder="Return reason"
                    className="flex-1 px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                    required
                  />
                  <Button
                    type="button"
                    onClick={() => removeItem(index)}
                    variant="outline"
                    size="sm"
                    className="border-red-600 text-red-400 hover:bg-red-950 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {items.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-4">
                Click "Add Product" to add items to return
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || items.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Return Request"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

