"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle, Check } from "lucide-react"
import { productsApi, type Product } from "@/lib/api"

const COMMON_CATEGORIES = [
  "Panels",
  "Inverters",
  "Batteries",
  "Structure",
  "Cable",
  "Cables - Copper",
  "Cables - Aluminum",
  "Other",
]

export interface QuotationStyleProductModalProps {
  product?: Product | null
  onClose: () => void
  /** Called after a successful create/update (parent should refetch). */
  onSuccess: () => void | Promise<void>
}

/**
 * Add / Edit Product — same simple form as create-quotation-flow Super Admin
 * (Name, Model, Category, Wattage, Quantity, Unit, Unit Price, Selling Price).
 */
export default function QuotationStyleProductModal({
  product,
  onClose,
  onSuccess,
}: QuotationStyleProductModalProps) {
  const isEdit = !!product
  const [form, setForm] = useState({
    name: product?.name ?? "",
    model: product?.model ?? "",
    category: product?.category ?? "",
    wattage: product?.wattage ?? "",
    quantity:
      product?.quantity != null
        ? String(product.quantity)
        : product?.central_stock != null
          ? String(product.central_stock)
          : "",
    unit: (product as Product & { unit?: string })?.unit ?? "",
    unit_price:
      product?.unit_price != null
        ? String(product.unit_price)
        : product?.price != null
          ? String(product.price)
          : "",
    selling_price:
      product?.selling_price != null ? String(product.selling_price) : "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (field: keyof typeof form, val: string) =>
    setForm((p) => ({ ...p, [field]: val }))

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError("Product name is required")
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        model: form.model.trim() || form.name.trim(),
        category: form.category.trim() || "Other",
      }
      if (form.wattage.trim()) body.wattage = form.wattage.trim()
      if (form.unit.trim()) body.unit = form.unit.trim()
      if (form.quantity !== "") body.quantity = Number(form.quantity)
      if (form.unit_price !== "") body.unit_price = Number(form.unit_price)
      if (form.selling_price !== "" && Number(form.selling_price) > 0) {
        body.selling_price = Number(form.selling_price)
      }

      if (isEdit && product) {
        await productsApi.update(product.id, body as any)
      } else {
        if (body.quantity === undefined) body.quantity = 0
        if (body.unit_price === undefined) body.unit_price = 0
        await productsApi.create(body as any)
      }
      await onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || err?.data?.error || "Failed to save product")
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-stone-200 bg-stone-100 text-stone-900 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white text-stone-900 border border-stone-200 rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 shrink-0">
          <h2 className="text-lg font-bold text-stone-900">
            {isEdit ? "Edit Product" : "Add Product"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-500">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Product name"
                className={inputClass}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-500">Model</label>
              <input
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="Model / SKU"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-500">Category</label>
              <input
                list="sa-product-category-options"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                placeholder="Panels, Inverters..."
                className={inputClass}
              />
              <datalist id="sa-product-category-options">
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-500">Wattage</label>
              <input
                value={form.wattage}
                onChange={(e) => update("wattage", e.target.value)}
                placeholder="e.g. 540W"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-500">Quantity</label>
              <input
                type="number"
                step="0.01"
                value={form.quantity}
                onChange={(e) => update("quantity", e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-500">Unit</label>
              <input
                value={form.unit}
                onChange={(e) => update("unit", e.target.value)}
                placeholder="units, m, kg..."
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-500">
                Unit Price (cost)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => update("unit_price", e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-500">
                Selling Price
              </label>
              <input
                type="number"
                step="0.01"
                value={form.selling_price}
                onChange={(e) => update("selling_price", e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-stone-200 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit()}
            disabled={submitting}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                {isEdit ? "Save Changes" : "Create Product"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
