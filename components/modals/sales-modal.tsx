"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle } from "lucide-react"
import { productsApi, salesApi } from "@/lib/api"
import type { Product, SaleItem } from "@/lib/api"
import AddressFields, { type Address } from "@/components/forms/address-fields"

interface SalesModalProps {
  saleType: "b2b" | "b2c"
  onClose: () => void
  onSave: (sale: any) => void
}

export default function SalesModal({ saleType, onClose, onSave }: SalesModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const [items, setItems] = useState<Array<{ product_id: string; quantity: number; unit_price: number; gst_rate: number }>>([])

  // Address structure matching the Address model
  const emptyAddress: Address = {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
  }

  // B2B fields
  const [b2bFields, setB2bFields] = useState({
    customer_name: "",
    company_name: "",
    gst_number: "",
    contact_person: "",
    customer_email: "",
    customer_phone: "",
    billing_address: { ...emptyAddress },
    delivery_address: { ...emptyAddress },
    delivery_matches_billing: false,
  })

  // B2C fields
  const [b2cFields, setB2cFields] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    billing_address: { ...emptyAddress },
    delivery_address: { ...emptyAddress },
    delivery_matches_billing: false,
  })

  const [notes, setNotes] = useState("")

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const data = await productsApi.getAll()
        setProducts(data)
      } catch (err: any) {
        setError(err.message || "Failed to load products")
      } finally {
        setLoading(false)
      }
    }
    loadProducts()
  }, [])

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 0, unit_price: 0, gst_rate: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    
    // Auto-fill unit price from product
    if (field === "product_id" && value) {
      const product = products.find(p => p.id === value)
      if (product) {
        updated[index].unit_price = product.unit_price || product.price || 0
      }
    }
    
    setItems(updated)
  }

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
    const taxAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (item.gst_rate / 100)), 0)
    const totalAmount = subtotal + taxAmount
    return { subtotal, taxAmount, totalAmount }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file")
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Image size must be less than 5MB")
        return
      }
      setImageFile(file)
      setError(null)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (items.length === 0) {
      setError("Please add at least one product")
      return
    }

    if (items.some(item => !item.product_id || item.quantity <= 0 || item.unit_price <= 0)) {
      setError("Please fill all product details correctly")
      return
    }

    // Validate B2B fields
    if (saleType === "b2b") {
      if (!b2bFields.customer_name || !b2bFields.company_name || !b2bFields.contact_person) {
        setError("Please fill all required B2B fields")
        return
      }
      // Validate billing address
      const billing = b2bFields.billing_address
      if (!billing.line1 || !billing.city || !billing.state || !billing.postal_code || !billing.country) {
        setError("Please fill all required billing address fields")
        return
      }
      // Validate delivery address if different
      if (!b2bFields.delivery_matches_billing) {
        const delivery = b2bFields.delivery_address
        if (!delivery.line1 || !delivery.city || !delivery.state || !delivery.postal_code || !delivery.country) {
          setError("Please fill all required delivery address fields")
          return
        }
      }
    }

    // Validate B2C fields
    if (saleType === "b2c") {
      if (!b2cFields.customer_name || !b2cFields.customer_phone) {
        setError("Please fill all required B2C fields")
        return
      }
      // Validate billing address
      const billing = b2cFields.billing_address
      if (!billing.line1 || !billing.city || !billing.state || !billing.postal_code || !billing.country) {
        setError("Please fill all required billing address fields")
        return
      }
      // Validate delivery address if different
      if (!b2cFields.delivery_matches_billing) {
        const delivery = b2cFields.delivery_address
        if (!delivery.line1 || !delivery.city || !delivery.state || !delivery.postal_code || !delivery.country) {
          setError("Please fill all required delivery address fields")
          return
        }
      }
    }

    setIsSubmitting(true)

    try {
      const { subtotal, taxAmount } = calculateTotals()
      
      const saleData: any = {
        type: saleType === "b2b" ? "B2B" : "B2C",
        customer_name: saleType === "b2b" ? b2bFields.customer_name : b2cFields.customer_name,
        items: items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_rate: item.gst_rate || 0,
        })),
        tax_amount: taxAmount,
        discount_amount: 0,
        delivery_matches_billing: saleType === "b2b" ? b2bFields.delivery_matches_billing : b2cFields.delivery_matches_billing,
        notes: notes || undefined,
        image: imageFile || undefined,
      }

      // Add B2B specific fields
      if (saleType === "b2b") {
        saleData.company_name = b2bFields.company_name
        saleData.gst_number = b2bFields.gst_number || undefined
        saleData.contact_person = b2bFields.contact_person
        saleData.customer_email = b2bFields.customer_email || undefined
        saleData.customer_phone = b2bFields.customer_phone || undefined
        // Send address objects - backend will create them
        saleData.billing_address = b2bFields.billing_address
        if (!b2bFields.delivery_matches_billing) {
          saleData.delivery_address = b2bFields.delivery_address
        }
      }

      // Add B2C specific fields
      if (saleType === "b2c") {
        saleData.customer_email = b2cFields.customer_email || undefined
        saleData.customer_phone = b2cFields.customer_phone
        // Send address objects - backend will create them
        saleData.billing_address = b2cFields.billing_address
        if (!b2cFields.delivery_matches_billing) {
          saleData.delivery_address = b2cFields.delivery_address
        }
      }

      const created = await salesApi.create(saleData)
      onSave(created)
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to create sale")
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

  const { subtotal, taxAmount, totalAmount } = calculateTotals()

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-xl md:max-w-2xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-slate-800 pb-4 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            {saleType === "b2b" ? "Create B2B Sale" : "Create B2C Sale"}
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
          {/* Customer Details */}
          {saleType === "b2b" ? (
            <div className="space-y-4 p-4 bg-slate-700/30 rounded-lg">
              <h3 className="font-semibold text-white mb-3">B2B Customer Details</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Customer Name *</label>
                  <input
                    type="text"
                    value={b2bFields.customer_name}
                    onChange={(e) => setB2bFields({ ...b2bFields, customer_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Company Name *</label>
                  <input
                    type="text"
                    value={b2bFields.company_name}
                    onChange={(e) => setB2bFields({ ...b2bFields, company_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">GST Number</label>
                  <input
                    type="text"
                    value={b2bFields.gst_number}
                    onChange={(e) => setB2bFields({ ...b2bFields, gst_number: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Contact Person *</label>
                  <input
                    type="text"
                    value={b2bFields.contact_person}
                    onChange={(e) => setB2bFields({ ...b2bFields, contact_person: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={b2bFields.customer_email}
                    onChange={(e) => setB2bFields({ ...b2bFields, customer_email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={b2bFields.customer_phone}
                    onChange={(e) => setB2bFields({ ...b2bFields, customer_phone: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              
              <AddressFields
                address={b2bFields.billing_address}
                onChange={(address: Address) => setB2bFields({ ...b2bFields, billing_address: address })}
                label="Billing Address"
                required
              />
              
          <div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={b2bFields.delivery_matches_billing}
                    onChange={(e) => {
                      setB2bFields({ 
                        ...b2bFields, 
                        delivery_matches_billing: e.target.checked,
                        delivery_address: e.target.checked ? { ...b2bFields.billing_address } : { ...emptyAddress }
                      })
                    }}
                    className="rounded"
                  />
                  Delivery address same as billing address
            </label>
              </div>
              
              {!b2bFields.delivery_matches_billing && (
                <AddressFields
                  address={b2bFields.delivery_address}
                  onChange={(address: Address) => setB2bFields({ ...b2bFields, delivery_address: address })}
                  label="Delivery Address"
                  required
                />
              )}
            </div>
          ) : (
            <div className="space-y-4 p-4 bg-slate-700/30 rounded-lg">
              <h3 className="font-semibold text-white mb-3">B2C Customer Details</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Customer Name *</label>
            <input
              type="text"
                    value={b2cFields.customer_name}
                    onChange={(e) => setB2cFields({ ...b2cFields, customer_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Phone *</label>
                  <input
                    type="tel"
                    value={b2cFields.customer_phone}
                    onChange={(e) => setB2cFields({ ...b2cFields, customer_phone: e.target.value })}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
                  />
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={b2cFields.customer_email}
                    onChange={(e) => setB2cFields({ ...b2cFields, customer_email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              
              <AddressFields
                address={b2cFields.billing_address}
                onChange={(address: Address) => setB2cFields({ ...b2cFields, billing_address: address })}
                label="Billing Address"
                required
              />
              
              <div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={b2cFields.delivery_matches_billing}
                    onChange={(e) => {
                      setB2cFields({ 
                        ...b2cFields, 
                        delivery_matches_billing: e.target.checked,
                        delivery_address: e.target.checked ? { ...b2cFields.billing_address } : { ...emptyAddress }
                      })
                    }}
                    className="rounded"
                  />
                  Delivery address same as billing address
                </label>
              </div>
              
              {!b2cFields.delivery_matches_billing && (
                <AddressFields
                  address={b2cFields.delivery_address}
                  onChange={(address: Address) => setB2cFields({ ...b2cFields, delivery_address: address })}
                  label="Delivery Address"
                  required
                />
              )}
            </div>
          )}

          {/* Products */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-300">Products *</label>
              <Button
                type="button"
                onClick={addItem}
                variant="outline"
                size="sm"
                className="border-slate-600 text-slate-300 bg-transparent"
              >
                Add Product
              </Button>
            </div>
            
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex flex-col gap-3 p-3 bg-slate-700/30 rounded-lg">
                  <select
                    value={item.product_id}
                    onChange={(e) => updateItem(index, "product_id", e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} - {product.model}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                      placeholder="Qty"
                      min="1"
                      className="w-full px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                      required
                    />
                    <input
                      type="number"
                      value={item.unit_price || ""}
                      onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                      placeholder="Price (₹)"
                      step="0.01"
                      min="0"
                      className="w-full px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                      required
                    />
                    <input
                      type="number"
                      value={item.gst_rate || ""}
                      onChange={(e) => updateItem(index, "gst_rate", parseFloat(e.target.value) || 0)}
                      placeholder="GST %"
                      step="0.1"
                      min="0"
                      max="100"
                      className="w-full px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                    />
                    <Button
                      type="button"
                      onClick={() => removeItem(index)}
                      variant="outline"
                      size="sm"
                      className="w-full border-red-600 text-red-400 hover:bg-red-950"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {items.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Click "Add Product" to add items</p>
              )}
            </div>
          </div>

          {/* Totals */}
          {items.length > 0 && (
            <div className="bg-slate-700/50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal:</span>
                <span>₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Tax (GST):</span>
                <span>₹{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-white border-t border-slate-600 pt-2">
                <span>Total:</span>
                <span className="text-emerald-400">₹{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Sale Image (Optional)</label>
            {imagePreview && (
              <div className="mb-2 relative w-full h-32 rounded-lg overflow-hidden border border-slate-600">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null)
                    setImagePreview(null)
                  }}
                  className="absolute top-2 right-2 p-1 bg-red-600 rounded-full hover:bg-red-700"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">PNG, JPG, GIF up to 5MB</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none h-20"
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 bg-transparent"
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
                  Creating...
                </>
              ) : (
                "Create Sale"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
