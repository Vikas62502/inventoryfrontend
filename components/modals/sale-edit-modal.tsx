"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle, Search } from "lucide-react"
import { salesApi, productsApi, type Sale, type Product } from "@/lib/api"
import AddressFields, { type Address } from "@/components/forms/address-fields"
import { normalizeSaleQuantity, isWholeSaleQuantity, hasSufficientStock, parseDecimalInput, SALE_QUANTITY_DECIMALS } from "@/lib/utils"

interface SaleEditModalProps {
  saleId: string
  onClose: () => void
  onSuccess: (updated: Sale) => void
  availableStock?: Record<string, number> // For agent: restrict quantity to available stock
}

type EditItem = { product_id: string; quantity: number; unit_price: number; gst_rate: number; serial_numbers?: string[] }

export default function SaleEditModal({
  saleId,
  onClose,
  onSuccess,
  availableStock,
}: SaleEditModalProps) {
  const [sale, setSale] = useState<Sale | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    customer_name: "",
    company_name: "",
    gst_number: "",
    contact_person: "",
    customer_email: "",
    customer_phone: "",
    notes: "",
    billing_address: { line1: "", line2: "", city: "", state: "", postal_code: "", country: "India" },
    delivery_address: { line1: "", line2: "", city: "", state: "", postal_code: "", country: "India" },
    delivery_matches_billing: false,
  })
  const [items, setItems] = useState<EditItem[]>([])
  /** Search query per item index for serial numbers display */
  const [serialSearchPerItem, setSerialSearchPerItem] = useState<Record<number, string>>({})

  const emptyAddr: Address = {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "India",
  }

  const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  const getAddr = (data: any, key: string) => {
    const addr = data[key] || data[toCamel(key)]
    if (addr && typeof addr === "object") {
      return {
        line1: addr.line1 || addr.line_1 || "",
        line2: addr.line2 || addr.line_2 || "",
        city: addr.city || "",
        state: addr.state || "",
        postal_code: addr.postal_code || addr.postalCode || addr.pincode || "",
        country: addr.country || "India",
      }
    }
    return emptyAddr
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [saleData, productsData] = await Promise.all([
          salesApi.getById(saleId),
          productsApi.getAll(),
        ])
        setSale(saleData)
        setProducts(productsData)

        const billing = getAddr(saleData, "billing_address")
        const deliveryMatchesBilling = saleData.delivery_matches_billing ?? (saleData as any).deliveryMatchesBilling ?? false
        const delivery = deliveryMatchesBilling ? billing : getAddr(saleData, "delivery_address")

        setFormData({
          customer_name: saleData.customer_name || (saleData as any).customerName || "",
          company_name: saleData.company_name || (saleData as any).companyName || "",
          gst_number: saleData.gst_number || (saleData as any).gstNumber || "",
          contact_person: saleData.contact_person || (saleData as any).contactPerson || "",
          customer_email: saleData.customer_email || (saleData as any).customerEmail || "",
          customer_phone: saleData.customer_phone || (saleData as any).customerPhone || "",
          notes: saleData.notes || "",
          billing_address: billing,
          delivery_address: delivery,
          delivery_matches_billing: deliveryMatchesBilling,
        })

        const saleItems = saleData.items || (saleData as any).Items || []
        if (saleItems.length > 0) {
          setItems(
            saleItems.map((it: any) => ({
              product_id: it.product_id || it.productId || it.product?.id || "",
              quantity: it.quantity || 0,
              unit_price: it.unit_price ?? it.unitPrice ?? 0,
              gst_rate: it.gst_rate ?? it.gstRate ?? 0,
              serial_numbers: it.serial_numbers || it.serialNumbers,
            }))
          )
        } else {
          setItems([{ product_id: "", quantity: 0, unit_price: 0, gst_rate: 18 }])
        }
      } catch (err: any) {
        setError(err.message || "Failed to load sale")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [saleId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError(null)
  }

  const addItem = () => setItems((p) => [...p, { product_id: "", quantity: 0, unit_price: 0, gst_rate: 18 }])
  const removeItem = (index: number) => setItems((p) => p.filter((_, i) => i !== index))
  const updateItem = (index: number, field: keyof EditItem, value: string | number) => {
    setItems((p) => {
      const next = [...p]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
    const taxAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (item.gst_rate / 100)), 0)
    const totalAmount = subtotal + taxAmount
    return { subtotal, taxAmount, totalAmount }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sale) return
    if (items.length === 0 || items.every((i) => !i.product_id)) {
      setError("Please add at least one product")
      return
    }

    const normalizedItems = items
      .filter((i) => i.product_id)
      .map((item) => {
        const quantity = normalizeSaleQuantity(item.quantity)
        const unit_price = Math.round(parseDecimalInput(String(item.unit_price)) * 100) / 100
        const payload: any = {
          product_id: item.product_id,
          quantity,
          unit_price,
          gst_rate: Number(item.gst_rate) ?? 0,
        }
        if (item.serial_numbers && item.serial_numbers.length > 0 && isWholeSaleQuantity(quantity)) {
          payload.serial_numbers = item.serial_numbers
        }
        return payload
      })

    if (normalizedItems.length === 0) {
      setError("Please add at least one product with valid details")
      return
    }

    const { subtotal, taxAmount, totalAmount } = calculateTotals()
    setError(null)
    setIsSubmitting(true)

    try {
      const updated = await salesApi.update(sale.id, {
        customer_name: formData.customer_name.trim(),
        company_name: formData.company_name.trim() || undefined,
        gst_number: formData.gst_number.trim() || undefined,
        contact_person: formData.contact_person.trim() || undefined,
        customer_email: formData.customer_email.trim() || undefined,
        customer_phone: formData.customer_phone.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        billing_address: formData.billing_address,
        delivery_address: formData.delivery_matches_billing ? formData.billing_address : formData.delivery_address,
        delivery_matches_billing: formData.delivery_matches_billing,
        items: normalizedItems,
        subtotal,
        tax_amount: taxAmount,
        discount_amount: 0,
        total_amount: totalAmount,
      } as any)
      onSuccess(updated)
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to update sale")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
        <Card className="bg-slate-800 border-slate-700 p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-slate-400">Loading sale...</p>
        </Card>
      </div>
    )
  }

  if (!sale) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
        <Card className="bg-slate-800 border-slate-700 p-6 max-w-md">
          <p className="text-red-400 mb-4">{error || "Sale not found"}</p>
          <Button onClick={onClose} variant="outline" className="border-slate-600 text-slate-300">
            Close
          </Button>
        </Card>
      </div>
    )
  }

  const filteredProducts = availableStock
    ? products.filter((p) => (availableStock[p.id] || 0) > 0)
    : products
  const { subtotal, taxAmount, totalAmount } = calculateTotals()

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-xl md:max-w-2xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-slate-800 pb-4 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Edit Sale</h2>
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

        <div className="mb-4 p-3 bg-slate-700/50 rounded-lg text-sm text-slate-300">
          <p><span className="text-slate-400">Type:</span> {sale.type}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Customer Name *</label>
            <input
              type="text"
              name="customer_name"
              value={formData.customer_name}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          {sale.type === "B2B" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Company Name</label>
                <input
                  type="text"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">GST Number</label>
                <input
                  type="text"
                  name="gst_number"
                  value={formData.gst_number}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Contact Person</label>
                <input
                  type="text"
                  name="contact_person"
                  value={formData.contact_person}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              name="customer_email"
              value={formData.customer_email}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
            <input
              type="text"
              name="customer_phone"
              value={formData.customer_phone}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <AddressFields
            label="Billing Address"
            address={formData.billing_address}
            onChange={(addr) => setFormData((p) => ({ ...p, billing_address: addr }))}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="delivery_matches_billing"
              checked={formData.delivery_matches_billing}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  delivery_matches_billing: e.target.checked,
                  delivery_address: e.target.checked ? p.billing_address : p.delivery_address,
                }))
              }
              className="rounded border-slate-600 bg-slate-700"
            />
            <label htmlFor="delivery_matches_billing" className="text-sm text-slate-300">
              Same as billing address
            </label>
          </div>
          {!formData.delivery_matches_billing && (
            <AddressFields
              label="Delivery Address"
              address={formData.delivery_address}
              onChange={(addr) => setFormData((p) => ({ ...p, delivery_address: addr }))}
            />
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-300">Products *</label>
              <Button type="button" onClick={addItem} variant="outline" size="sm" className="border-slate-600 text-slate-300">
                Add Product
              </Button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex flex-col gap-3 p-3 bg-slate-700/30 rounded-lg">
                  <select
                    value={item.product_id}
                    onChange={(e) => updateItem(index, "product_id", e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select Product</option>
                    {filteredProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.model && product.model !== product.name ? `${product.name} - ${product.model}` : product.name}
                        {availableStock ? ` (Available: ${availableStock[product.id] || 0})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => {
                        const normalized = normalizeSaleQuantity(parseDecimalInput(e.target.value))
                        const maxQty = availableStock?.[item.product_id]
                        const nextQty =
                          maxQty !== undefined && Number.isFinite(maxQty)
                            ? hasSufficientStock(maxQty, normalized)
                              ? normalized
                              : normalizeSaleQuantity(maxQty)
                            : normalized
                        updateItem(index, "quantity", nextQty)
                      }}
                      placeholder="Qty"
                      min="0.001"
                      step={10 ** -SALE_QUANTITY_DECIMALS}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="number"
                      value={item.unit_price || ""}
                      onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                      placeholder="Price (₹)"
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="number"
                      value={item.gst_rate || ""}
                      onChange={(e) => updateItem(index, "gst_rate", parseFloat(e.target.value) || 0)}
                      placeholder="GST %"
                      step="0.1"
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                    <Button type="button" onClick={() => removeItem(index)} variant="outline" size="sm" className="border-red-600 text-red-400">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {item.serial_numbers && item.serial_numbers.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-600/50">
                      <p className="text-xs text-slate-400 mb-1">Serial numbers (sold)</p>
                      {item.serial_numbers.length > 0 && (
                        <div className="relative mb-2">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search serial numbers..."
                            value={serialSearchPerItem[index] ?? ""}
                            onChange={(e) => setSerialSearchPerItem((prev) => ({ ...prev, [index]: e.target.value }))}
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs"
                          />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {item.serial_numbers
                          .filter((sn) => !(serialSearchPerItem[index] ?? "").trim() || sn.toLowerCase().includes((serialSearchPerItem[index] ?? "").trim().toLowerCase()))
                          .map((sn, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-700 rounded text-sm text-cyan-300 font-mono whitespace-nowrap">
                              {sn}
                            </span>
                          ))}
                      </div>
                      {(serialSearchPerItem[index] ?? "").trim() && item.serial_numbers.filter((sn) => sn.toLowerCase().includes((serialSearchPerItem[index] ?? "").trim().toLowerCase())).length === 0 && (
                        <p className="text-xs text-slate-400 mt-1">No serial numbers match &quot;{serialSearchPerItem[index]}&quot;</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

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

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
