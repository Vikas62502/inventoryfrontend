/**
 * ============================================================
 * SuperAdminInventoryPanel — Portable COMPLETE Super Admin Inventory Panel
 * ============================================================
 *
 * PURPOSE
 * -------
 * A fully self-contained React component that gives a Super Admin the
 * COMPLETE inventory experience, styled like the quotation admin (light theme).
 * It bundles every Super Admin capability into 8 tabs:
 *
 *   1. Overview       — Stats + full Products Catalog (add / edit / delete)
 *   2. Stock Requests — Review & dispatch (or reject) admin stock requests
 *   3. Approvals      — Approve/reject pending agents & pending sales
 *   4. Agent          — Record B2B / B2C sales from an admin's stock
 *   5. Admin          — Admin stock table, request stock, create agents, serials
 *   6. Returns        — Approve pending stock returns
 *   7. Selling Price  — Set per-product selling price
 *   8. Users          — Create Admin / Account users, toggle active
 *
 * HOW TO IMPORT
 * -------------
 *   import { SuperAdminInventoryPanel } from "@/components/inventory/super-admin-inventory-panel"
 *
 * PROPS
 * -----
 *   getAuthToken  : () => string | null
 *       A function that returns the current Bearer token (or null).
 *       Called before every API request. Works with any auth system.
 *
 *   apiBaseUrl?   : string   (optional)
 *       Base URL of the inventory API.
 *       Defaults to: "https://api.inventory.chairbordsolar.com/api"
 *
 * USAGE EXAMPLE
 * -------------
 *   "use client"
 *   import { SuperAdminInventoryPanel } from "@/components/inventory/super-admin-inventory-panel"
 *   import { useAuth } from "@/lib/auth"
 *
 *   export default function InventoryPage() {
 *     const { getToken } = useAuth()
 *     return <SuperAdminInventoryPanel getAuthToken={getToken} />
 *   }
 *
 * PEER DEPENDENCIES (must exist in host project)
 * -----------------------------------------------
 *   @/components/ui/card    → Card, CardContent, CardHeader, CardTitle
 *   @/components/ui/button  → Button
 *   @/components/ui/tabs    → Tabs, TabsList, TabsTrigger, TabsContent
 *   @/components/ui/input   → Input
 *   @/components/ui/label   → Label
 *   lucide-react            → various icons
 *
 * NOTES
 * -----
 *   • All API logic is inlined — no imports from the inventoryfrontend repo.
 *   • File is intentionally large to be drop-in portable.
 *   • Qty values are always displayed with 2 decimal places (en-IN locale).
 * ============================================================
 */
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Package,
  Plus,
  Loader2,
  AlertCircle,
  X,
  RefreshCw,
  ShoppingCart,
  Users,
  UserPlus,
  Search,
  Eye,
  CheckCircle,
  TrendingUp,
  BarChart3,
  LayoutDashboard,
  ClipboardList,
  ShieldCheck,
  RotateCcw,
  Tag,
  Pencil,
  Trash2,
  Truck,
  Check,
  XCircle,
} from "lucide-react"

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface IUser {
  id: string
  username: string
  name?: string
  role: string
  is_active?: boolean
  created_by_id?: string
  created_at?: string
}

interface IProduct {
  id: string
  name: string
  model: string
  category: string
  wattage?: string
  unit_price: number
  selling_price?: number
  central_stock?: number
  quantity?: number
  unit?: string
}

interface ISaleItem {
  product_id: string
  quantity: number
  unit_price: number
  gst_rate?: number
}

interface ISale {
  id: string
  type: "B2B" | "B2C"
  customer_name: string
  customer_phone?: string
  total_amount: number
  subtotal?: number
  tax_amount?: number
  discount_amount?: number
  payment_status: "pending" | "completed"
  approval_status?: "pending" | "approved"
  created_at: string
  created_by_name?: string
  agent_name?: string
  items?: Array<{
    product_id: string
    product?: IProduct
    quantity: number
    unit_price: number
    gst_rate?: number
    subtotal?: number
  }>
  admin_id?: string
  notes?: string
}

interface IAdminInventory {
  id: string
  admin_id: string
  product_id: string
  product?: IProduct
  quantity: number
  created_at?: string
  updated_at?: string
}

interface IStockRequestItem {
  product_id: string
  quantity: number
}

interface ISerialNumber {
  id: string
  serial_number: string
  product_id: string
  status?: string
  cost_price?: number
  created_at?: string
}

interface IStockRequest {
  id: string
  requested_from?: string
  requested_by_id?: string
  requested_by_name?: string
  primary_product_name?: string
  items: Array<{
    id?: string
    product_id: string
    product?: IProduct
    quantity: number
    serial_numbers?: string[]
  }>
  status: "pending" | "dispatched" | "confirmed" | "rejected"
  notes?: string
  rejection_reason?: string
  dispatch_image?: string
  created_at: string
  updated_at?: string
}

interface IStockReturn {
  id: string
  admin_id: string
  admin?: IUser
  product_id: string
  product?: IProduct
  quantity: number
  reason: string
  status: "pending" | "processed"
  created_at: string
  updated_at?: string
  processed_at?: string
}

// ─────────────────────────────────────────────
// API HELPER
// ─────────────────────────────────────────────

function createInventoryFetch(
  getAuthToken: () => string | null,
  apiBaseUrl: string
) {
  return async function inventoryFetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = getAuthToken()
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    if (
      options.body &&
      !(options.body instanceof FormData)
    ) {
      headers["Content-Type"] = "application/json"
    }
    const res = await fetch(`${apiBaseUrl}${path}`, { ...options, headers })
    if (!res.ok) {
      let msg = `API error ${res.status}`
      try {
        const body = await res.json()
        msg = body?.message || body?.error || msg
      } catch {}
      throw new Error(msg)
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }
}

// ─────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────

function fmtQty(n: number | undefined | null): string {
  const v = typeof n === "number" ? n : 0
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtCurrency(n: number | undefined | null): string {
  const v = typeof n === "number" ? n : 0
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v)
}

function fmtDate(s: string | undefined): string {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const COMMON_CATEGORIES = [
  "Panels",
  "Inverters",
  "Batteries",
  "Structure",
  "Cable",
  "Other",
]

const SERIAL_CATEGORIES = new Set(["panels", "inverters"])

// ─────────────────────────────────────────────
// INLINE MODAL: CREATE AGENT
// ─────────────────────────────────────────────

interface CreateAgentModalProps {
  adminId: string
  adminName: string
  onClose: () => void
  onSuccess: () => void
  fetch: <T>(path: string, opts?: RequestInit) => Promise<T>
}

function CreateAgentModal({
  adminId,
  adminName,
  onClose,
  onSuccess,
  fetch: apiFetch,
}: CreateAgentModalProps) {
  const [form, setForm] = useState({
    username: "",
    name: "",
    password: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username.trim() || !form.password.trim()) {
      setError("Username and password are required")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          username: form.username.trim(),
          name: form.name.trim() || form.username.trim(),
          password: form.password,
          role: "agent",
          created_by_id: adminId,
          is_active: true,
        }),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || "Failed to create agent")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-600">
          <div>
            <h2 className="text-lg font-bold text-white">Create Agent</h2>
            <p className="text-xs text-slate-400 mt-0.5">Under admin: {adminName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Username *</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              placeholder="agent.username"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Full Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Agent full name (optional)"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Password *</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="••••••••"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-600 text-slate-400 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Create Agent
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// INLINE MODAL: STOCK REQUEST
// ─────────────────────────────────────────────

interface StockRequestModalProps {
  adminId: string
  adminName: string
  onClose: () => void
  onSuccess: () => void
  fetch: <T>(path: string, opts?: RequestInit) => Promise<T>
}

function StockRequestModal({
  adminId,
  adminName,
  onClose,
  onSuccess,
  fetch: apiFetch,
}: StockRequestModalProps) {
  const [products, setProducts] = useState<IProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [items, setItems] = useState<Array<{ product_id: string; quantity: string }>>([
    { product_id: "", quantity: "" },
  ])
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<IProduct[]>("/products")
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch((e) => setError(e?.message || "Failed to load products"))
      .finally(() => setLoadingProducts(false))
  }, [])

  const addLine = () => setItems((p) => [...p, { product_id: "", quantity: "" }])
  const removeLine = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: "product_id" | "quantity", val: string) =>
    setItems((p) => p.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const validItems = items.filter((it) => it.product_id && Number(it.quantity) > 0)
    if (validItems.length === 0) {
      setError("Add at least one product with qty > 0")
      return
    }
    setSubmitting(true)
    try {
      await apiFetch("/stock-requests", {
        method: "POST",
        body: JSON.stringify({
          requested_from: "super-admin",
          items: validItems.map((it) => ({
            product_id: it.product_id,
            quantity: Number(it.quantity),
          })),
          notes: notes.trim() || undefined,
          on_behalf_of_admin_id: adminId,
        }),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || "Failed to create stock request")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-600 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Request Stock</h2>
            <p className="text-xs text-slate-400 mt-0.5">On behalf of: {adminName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {loadingProducts ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading products…
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="text-slate-400 text-sm font-medium">Products</Label>
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={item.product_id}
                    onChange={(e) => updateLine(i, "product_id", e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.model}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateLine(i, "quantity", e.target.value)}
                    placeholder="Qty"
                    className="w-24 bg-slate-700 border-slate-600 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="text-slate-400 hover:text-red-400 px-1"
                    disabled={items.length === 1}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addLine}
                className="border-slate-600 text-slate-400 hover:bg-slate-700 text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Product
              </Button>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Notes (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any notes for this request…"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </form>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-600 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-slate-400 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit as any}
            disabled={submitting || loadingProducts}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <Package className="w-4 h-4 mr-1.5" />
                Submit Request
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// INLINE MODAL: SERIALS VIEW
// ─────────────────────────────────────────────

interface SerialsViewModalProps {
  adminId: string
  product: IProduct
  onClose: () => void
  fetch: <T>(path: string, opts?: RequestInit) => Promise<T>
}

function SerialsViewModal({ adminId, product, onClose, fetch: apiFetch }: SerialsViewModalProps) {
  const [serials, setSerials] = useState<ISerialNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    apiFetch<ISerialNumber[]>(`/admin-inventory/admin/${adminId}/serials/${product.id}`)
      .catch(() => apiFetch<ISerialNumber[]>(`/serial-numbers`, {}))
      .then((data) => {
        const arr = Array.isArray(data) ? data : []
        setSerials(arr.filter((s) => s.product_id === product.id || !s.product_id))
      })
      .catch((e) => setError(e?.message || "Failed to load serials"))
      .finally(() => setLoading(false))
  }, [adminId, product.id])

  const filtered = serials.filter((s) =>
    s.serial_number.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-600 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Serial Numbers</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {product.name} — {product.model}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 border-b border-slate-600 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search serial…"
              className="pl-9 bg-slate-700 border-slate-600 text-white"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading serials…
            </div>
          ) : error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">
              {serials.length === 0 ? "No serial numbers recorded" : "No matches"}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between bg-slate-700 rounded-lg px-3 py-2"
                >
                  <span className="text-white text-sm font-mono">{s.serial_number}</span>
                  {s.status && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        s.status === "available"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {s.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-slate-600 shrink-0 text-xs text-slate-400">
          {filtered.length} / {serials.length} serial(s)
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// INLINE MODAL: SIMPLE SALE (B2B / B2C)
// ─────────────────────────────────────────────

interface SimpleSaleModalProps {
  adminId: string
  adminName: string
  saleType: "B2B" | "B2C"
  adminInventory: IAdminInventory[]
  onClose: () => void
  onSuccess: () => void
  fetch: <T>(path: string, opts?: RequestInit) => Promise<T>
}

function SimpleSaleModal({
  adminId,
  adminName,
  saleType,
  adminInventory,
  onClose,
  onSuccess,
  fetch: apiFetch,
}: SimpleSaleModalProps) {
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [gstNumber, setGstNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<
    Array<{ product_id: string; quantity: string; unit_price: string }>
  >([{ product_id: "", quantity: "", unit_price: "" }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stockMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const row of adminInventory) {
      const pid = row.product_id || row.product?.id
      if (pid) m[pid] = Number(row.quantity || 0)
    }
    return m
  }, [adminInventory])

  const productOptions = adminInventory.filter(
    (row) => Number(row.quantity) > 0
  )

  const addLine = () =>
    setLines((p) => [...p, { product_id: "", quantity: "", unit_price: "" }])
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i))
  const updateLine = (
    i: number,
    field: "product_id" | "quantity" | "unit_price",
    val: string
  ) => {
    setLines((p) =>
      p.map((row, idx) => {
        if (idx !== i) return row
        const updated = { ...row, [field]: val }
        if (field === "product_id") {
          const inv = adminInventory.find(
            (r) => (r.product_id || r.product?.id) === val
          )
          if (inv?.product?.unit_price) {
            updated.unit_price = String(inv.product.unit_price)
          }
        }
        return updated
      })
    )
  }

  const subtotal = lines.reduce((acc, l) => {
    return acc + Number(l.quantity || 0) * Number(l.unit_price || 0)
  }, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!customerName.trim()) {
      setError("Customer name is required")
      return
    }
    const validLines = lines.filter(
      (l) => l.product_id && Number(l.quantity) > 0 && Number(l.unit_price) >= 0
    )
    if (validLines.length === 0) {
      setError("Add at least one product line with qty > 0")
      return
    }
    for (const l of validLines) {
      const avail = stockMap[l.product_id] ?? 0
      if (Number(l.quantity) > avail) {
        const inv = adminInventory.find(
          (r) => (r.product_id || r.product?.id) === l.product_id
        )
        setError(
          `Qty exceeds available stock for ${inv?.product?.name ?? l.product_id} (available: ${fmtQty(avail)})`
        )
        return
      }
    }
    setSubmitting(true)
    try {
      const items: ISaleItem[] = validLines.map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        gst_rate: saleType === "B2B" ? 18 : 0,
      }))
      const taxAmount =
        saleType === "B2B"
          ? items.reduce((a, it) => a + it.quantity * it.unit_price * 0.18, 0)
          : 0
      await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          type: saleType,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || undefined,
          company_name: saleType === "B2B" ? companyName.trim() || undefined : undefined,
          gst_number: saleType === "B2B" ? gstNumber.trim() || undefined : undefined,
          items,
          tax_amount: taxAmount,
          discount_amount: 0,
          notes: notes.trim() || undefined,
          admin_id: adminId,
        }),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || "Failed to create sale")
    } finally {
      setSubmitting(false)
    }
  }

  const isB2B = saleType === "B2B"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-600 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">
              New {saleType} Sale
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Stock from admin: {adminName}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            {/* Customer Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-sm">Customer Name *</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-sm">Phone</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="10-digit phone"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              {isB2B && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-slate-400 text-sm">Company Name</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company name"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-400 text-sm">GST Number</Label>
                    <Input
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value)}
                      placeholder="22AAAAA0000A1Z5"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Product Lines */}
            <div className="space-y-3">
              <Label className="text-slate-400 text-sm font-medium">Products</Label>
              {productOptions.length === 0 && (
                <p className="text-amber-300 text-xs border border-amber-500/40 bg-amber-500/20 rounded-lg px-3 py-2">
                  This admin has no stock available for sale.
                </p>
              )}
              {lines.map((line, i) => {
                const available = line.product_id
                  ? (stockMap[line.product_id] ?? 0)
                  : null
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-5">
                      <select
                        value={line.product_id}
                        onChange={(e) => updateLine(i, "product_id", e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Select product…</option>
                        {productOptions.map((row) => {
                          const pid = row.product_id || row.product?.id || ""
                          const pname = row.product?.name ?? pid
                          const pmodel = row.product?.model ?? ""
                          return (
                            <option key={pid} value={pid}>
                              {pname} {pmodel ? `— ${pmodel}` : ""} ({fmtQty(row.quantity)})
                            </option>
                          )
                        })}
                      </select>
                      {available !== null && (
                        <p className="text-xs text-slate-400 mt-1">
                          Available: {fmtQty(available)}
                        </p>
                      )}
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, "quantity", e.target.value)}
                        placeholder="Qty"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) => updateLine(i, "unit_price", e.target.value)}
                        placeholder="Unit price"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="text-slate-400 hover:text-red-400"
                        disabled={lines.length === 1}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                onClick={addLine}
                className="border-slate-600 text-slate-400 hover:bg-slate-700 text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Line
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Notes</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes…"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Summary */}
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>{fmtCurrency(subtotal)}</span>
              </div>
              {isB2B && (
                <div className="flex justify-between text-slate-400">
                  <span>GST (18%)</span>
                  <span>{fmtCurrency(subtotal * 0.18)}</span>
                </div>
              )}
              <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-600 mt-1">
                <span>Total</span>
                <span>{fmtCurrency(isB2B ? subtotal * 1.18 : subtotal)}</span>
              </div>
            </div>
          </div>
        </form>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-600 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-slate-400 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit as any}
            disabled={submitting}
            className={`text-white ${isB2B ? "bg-blue-600 hover:bg-blue-700" : "bg-sky-600 hover:bg-sky-700"}`}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-1.5" />
                Record Sale
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// INLINE MODAL: PRODUCT FORM (create / edit)
// ─────────────────────────────────────────────

interface ProductFormModalProps {
  product: IProduct | null
  onClose: () => void
  onSuccess: () => void
  fetch: <T>(path: string, opts?: RequestInit) => Promise<T>
}

function ProductFormModal({ product, onClose, onSuccess, fetch: apiFetch }: ProductFormModalProps) {
  const isEdit = !!product
  const [form, setForm] = useState({
    name: product?.name ?? "",
    model: product?.model ?? "",
    category: product?.category ?? "",
    wattage: product?.wattage ?? "",
    quantity: product?.quantity != null ? String(product.quantity) : "",
    unit_price: product?.unit_price != null ? String(product.unit_price) : "",
    selling_price: product?.selling_price != null ? String(product.selling_price) : "",
    unit: product?.unit ?? "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (field: keyof typeof form, val: string) =>
    setForm((p) => ({ ...p, [field]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
        await apiFetch(`/products/${product.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
      } else {
        if (body.quantity === undefined) body.quantity = 0
        if (body.unit_price === undefined) body.unit_price = 0
        await apiFetch("/products", {
          method: "POST",
          body: JSON.stringify(body),
        })
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || "Failed to save product")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-600 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEdit ? "Edit Product" : "Add Product"}
            </h2>
            {isEdit && (
              <p className="text-xs text-slate-400 mt-0.5">{product?.name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Product name"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Model</Label>
              <Input
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="Model / SKU"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Category</Label>
              <input
                list="product-category-options"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                placeholder="Panels, Inverters…"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
              />
              <datalist id="product-category-options">
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Wattage</Label>
              <Input
                value={form.wattage}
                onChange={(e) => update("wattage", e.target.value)}
                placeholder="e.g. 540W"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Quantity</Label>
              <Input
                type="number"
                step="0.01"
                value={form.quantity}
                onChange={(e) => update("quantity", e.target.value)}
                placeholder="0.00"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Unit</Label>
              <Input
                value={form.unit}
                onChange={(e) => update("unit", e.target.value)}
                placeholder="units, m, kg…"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Unit Price (cost)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => update("unit_price", e.target.value)}
                placeholder="0.00"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-sm">Selling Price</Label>
              <Input
                type="number"
                step="0.01"
                value={form.selling_price}
                onChange={(e) => update("selling_price", e.target.value)}
                placeholder="0.00"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>
        </form>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-600 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-slate-400 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit as any}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
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

// ─────────────────────────────────────────────
// INLINE MODAL: STOCK REQUEST APPROVAL / DISPATCH
// ─────────────────────────────────────────────

interface ApprovalModalProps {
  request: IStockRequest
  products?: Record<string, IProduct>
  onClose: () => void
  onSuccess: () => void
  fetch: <T>(path: string, opts?: RequestInit) => Promise<T>
}

function ApprovalModal({ request, products, onClose, onSuccess, fetch: apiFetch }: ApprovalModalProps) {
  const [lines, setLines] = useState(
    request.items.map((it) => ({
      product_id: it.product_id,
      quantity: String(it.quantity),
      serials: (it.serial_numbers || []).join(", "),
    }))
  )
  const [dispatchImage, setDispatchImage] = useState<File | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [submitting, setSubmitting] = useState<"dispatch" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const productName = (pid: string, fallback?: IProduct) => {
    const p = products?.[pid] || fallback
    return p ? `${p.name}${p.model ? ` — ${p.model}` : ""}` : pid
  }

  const productCategory = (pid: string, fallback?: IProduct) => {
    const p = products?.[pid] || fallback
    return (p?.category || "").toLowerCase()
  }

  const updateLine = (i: number, field: "quantity" | "serials", val: string) =>
    setLines((p) => p.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)))

  const buildSerialMap = (): Record<string, string[]> => {
    const map: Record<string, string[]> = {}
    for (const l of lines) {
      const serials = l.serials
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      if (serials.length > 0) map[l.product_id] = serials
    }
    return map
  }

  const handleDispatch = async () => {
    setError(null)
    const items = lines.map((l) => ({
      product_id: l.product_id,
      quantity: Number(l.quantity),
    }))
    if (items.some((it) => !(it.quantity > 0))) {
      setError("All dispatch quantities must be greater than 0")
      return
    }
    const serialMap = buildSerialMap()
    setSubmitting("dispatch")
    try {
      if (dispatchImage) {
        const fd = new FormData()
        fd.append("dispatch_image", dispatchImage)
        fd.append("items", JSON.stringify(items))
        if (Object.keys(serialMap).length > 0) {
          fd.append("serial_numbers", JSON.stringify(serialMap))
        }
        await apiFetch(`/stock-requests/${request.id}/dispatch`, {
          method: "POST",
          body: fd,
        })
      } else {
        const body: Record<string, unknown> = { items }
        if (Object.keys(serialMap).length > 0) {
          body.serial_numbers = JSON.stringify(serialMap)
        }
        await apiFetch(`/stock-requests/${request.id}/dispatch`, {
          method: "POST",
          body: JSON.stringify(body),
        })
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || "Failed to dispatch request")
    } finally {
      setSubmitting(null)
    }
  }

  const handleReject = async () => {
    setError(null)
    if (!rejectionReason.trim()) {
      setError("Enter a rejection reason")
      return
    }
    setSubmitting("reject")
    try {
      await apiFetch(`/stock-requests/${request.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ rejection_reason: rejectionReason.trim() }),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || "Failed to reject request")
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-600 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Review &amp; Dispatch</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Request by {request.requested_by_name || "admin"} · {fmtDate(request.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {request.notes && (
            <p className="text-xs text-slate-400 bg-slate-700 rounded-lg px-3 py-2">
              Note: {request.notes}
            </p>
          )}
          <div className="space-y-3">
            <Label className="text-slate-400 text-sm font-medium">Items</Label>
            {lines.map((line, i) => {
              const orig = request.items[i]
              const showSerials = SERIAL_CATEGORIES.has(
                productCategory(line.product_id, orig?.product)
              )
              return (
                <div key={i} className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">
                      {productName(line.product_id, orig?.product)}
                    </p>
                    <span className="text-xs text-slate-400 shrink-0">
                      req: {fmtQty(orig?.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-slate-400 w-24">Dispatch qty</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, "quantity", e.target.value)}
                      className="w-28 bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  {showSerials && (
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">
                        Serial numbers (comma-separated)
                      </Label>
                      <Input
                        value={line.serials}
                        onChange={(e) => updateLine(i, "serials", e.target.value)}
                        placeholder="SN001, SN002, …"
                        className="bg-slate-700 border-slate-600 text-white text-sm"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Dispatch image (optional)</Label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setDispatchImage(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-slate-600"
            />
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-600">
            <Label className="text-slate-400 text-sm">Rejection reason (to reject)</Label>
            <Input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejecting this request…"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
        </div>
        <div className="flex justify-between gap-3 p-5 border-t border-slate-600 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleReject}
            disabled={submitting !== null}
            className="border-red-500/40 text-red-400 hover:bg-red-500/10"
          >
            {submitting === "reject" ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Rejecting…
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-1.5" />
                Reject
              </>
            )}
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-600 text-slate-400 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDispatch}
              disabled={submitting !== null}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting === "dispatch" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Dispatching…
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4 mr-1.5" />
                  Dispatch
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// INLINE MODAL: CREATE USER (Admin / Account)
// ─────────────────────────────────────────────

interface CreateUserModalProps {
  onClose: () => void
  onSuccess: () => void
  fetch: <T>(path: string, opts?: RequestInit) => Promise<T>
}

function CreateUserModal({ onClose, onSuccess, fetch: apiFetch }: CreateUserModalProps) {
  const [form, setForm] = useState({
    username: "",
    name: "",
    password: "",
    role: "admin" as "admin" | "account",
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username.trim() || !form.password.trim()) {
      setError("Username and password are required")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          username: form.username.trim(),
          name: form.name.trim() || form.username.trim(),
          password: form.password,
          role: form.role,
          is_active: true,
        }),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || "Failed to create user")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-600">
          <h2 className="text-lg font-bold text-white">Create User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Role *</Label>
            <div className="flex gap-2">
              {(["admin", "account"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, role: r }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.role === r
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600"
                  }`}
                >
                  {r === "admin" ? "Admin" : "Account"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Username *</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              placeholder="user.name"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Full Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Full name (optional)"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Password *</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="••••••••"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-600 text-slate-400 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Create User
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// INLINE MODAL: SELLING PRICE
// ─────────────────────────────────────────────

interface SellingPriceModalProps {
  product: IProduct
  onClose: () => void
  onSuccess: () => void
  fetch: <T>(path: string, opts?: RequestInit) => Promise<T>
}

function SellingPriceModal({ product, onClose, onSuccess, fetch: apiFetch }: SellingPriceModalProps) {
  const [price, setPrice] = useState(
    product.selling_price != null ? String(product.selling_price) : ""
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const val = Number(price)
    if (!(val > 0)) {
      setError("Enter a selling price greater than 0")
      return
    }
    setSubmitting(true)
    try {
      await apiFetch(`/products/${product.id}`, {
        method: "PUT",
        body: JSON.stringify({ selling_price: val }),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || "Failed to update selling price")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-600">
          <div>
            <h2 className="text-lg font-bold text-white">Set Selling Price</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {product.name}
              {product.model ? ` — ${product.model}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="text-xs text-slate-400">
            Cost / unit price: {fmtCurrency(product.unit_price)}
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-sm">Selling Price *</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="bg-slate-700 border-slate-600 text-white"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-600 text-slate-400 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Tag className="w-4 h-4 mr-1.5" />
                  Save Price
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// STATUS BADGE HELPER
// ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase()
  const cls =
    s === "pending"
      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
      : s === "dispatched"
      ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
      : s === "confirmed" || s === "approved" || s === "processed"
      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
      : s === "rejected"
      ? "bg-red-500/10 text-red-400 border border-red-500/30"
      : "bg-slate-700 text-slate-400 border border-slate-600"
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize ${cls}`}>
      {status || "—"}
    </span>
  )
}

// ─────────────────────────────────────────────
// MAIN EXPORT: SuperAdminInventoryPanel
// ─────────────────────────────────────────────

export interface SuperAdminInventoryPanelProps {
  /** Returns the current Bearer token, or null if unauthenticated. Called before every request. */
  getAuthToken: () => string | null
  /** Inventory API base URL. Defaults to https://api.inventory.chairbordsolar.com/api */
  apiBaseUrl?: string
  /** Optional display name shown in the dashboard header. */
  userName?: string
}

export function SuperAdminInventoryPanel({
  getAuthToken,
  apiBaseUrl = "https://api.inventory.chairbordsolar.com/api",
  userName = "Admin",
}: SuperAdminInventoryPanelProps) {
  const apiFetch = useMemo(
    () => createInventoryFetch(getAuthToken, apiBaseUrl),
    [getAuthToken, apiBaseUrl]
  )

  // ── Admins & Agents ──────────────────────────────────────
  const [admins, setAdmins] = useState<IUser[]>([])
  const [agents, setAgents] = useState<IUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)

  // ── Selected Admin ────────────────────────────────────────
  const [selectedAdminId, setSelectedAdminId] = useState<string>("")
  const selectedAdmin = admins.find((a) => a.id === selectedAdminId)

  // ── Admin Inventory ───────────────────────────────────────
  const [adminInventory, setAdminInventory] = useState<IAdminInventory[]>([])
  const [loadingInventory, setLoadingInventory] = useState(false)
  const [inventorySearch, setInventorySearch] = useState("")

  // ── Sales ─────────────────────────────────────────────────
  const [sales, setSales] = useState<ISale[]>([])
  const [loadingSales, setLoadingSales] = useState(true)
  const [salesSearch, setSalesSearch] = useState("")
  const [salesTypeFilter, setSalesTypeFilter] = useState<"all" | "B2B" | "B2C">("all")

  // ── Products ──────────────────────────────────────────────
  const [products, setProducts] = useState<IProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [productSearch, setProductSearch] = useState("")
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>("all")
  const [priceSearch, setPriceSearch] = useState("")

  // ── Stock Requests ────────────────────────────────────────
  const [stockRequests, setStockRequests] = useState<IStockRequest[]>([])
  const [loadingStockRequests, setLoadingStockRequests] = useState(true)
  const [stockRequestSearch, setStockRequestSearch] = useState("")

  // ── Stock Returns ─────────────────────────────────────────
  const [stockReturns, setStockReturns] = useState<IStockReturn[]>([])
  const [loadingReturns, setLoadingReturns] = useState(true)
  const [returnSearch, setReturnSearch] = useState("")
  const [processingReturnId, setProcessingReturnId] = useState<string | null>(null)

  // ── Approvals ─────────────────────────────────────────────
  const [approvalSalesSearch, setApprovalSalesSearch] = useState("")
  const [approvalSalesType, setApprovalSalesType] = useState<"all" | "B2B" | "B2C">("all")
  const [processingUserId, setProcessingUserId] = useState<string | null>(null)
  const [approvingSaleId, setApprovingSaleId] = useState<string | null>(null)

  // ── Users tab ─────────────────────────────────────────────
  const [userSearch, setUserSearch] = useState("")
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)

  // ── Modals ────────────────────────────────────────────────
  const [showCreateAgent, setShowCreateAgent] = useState(false)
  const [showStockRequest, setShowStockRequest] = useState(false)
  const [showSerials, setShowSerials] = useState<IProduct | null>(null)
  const [showSale, setShowSale] = useState<"B2B" | "B2C" | null>(null)
  const [productModal, setProductModal] = useState<{ product: IProduct | null } | null>(null)
  const [approvalRequest, setApprovalRequest] = useState<IStockRequest | null>(null)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [sellingPriceProduct, setSellingPriceProduct] = useState<IProduct | null>(null)

  // ── Load Admins + Agents ──────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    setUsersError(null)
    try {
      const [adminsData, agentsData] = await Promise.all([
        apiFetch<IUser[]>("/users?role=admin").catch(() =>
          apiFetch<IUser[]>("/users", {}).then((all: any) =>
            Array.isArray(all) ? (all as IUser[]).filter((u) => u.role === "admin") : []
          )
        ),
        apiFetch<IUser[]>("/users/agents").catch(() =>
          apiFetch<IUser[]>("/users?role=agent").catch(() => [] as IUser[])
        ),
      ])
      setAdmins(Array.isArray(adminsData) ? adminsData : [])
      setAgents(Array.isArray(agentsData) ? agentsData : [])
    } catch (e: any) {
      setUsersError(e?.message || "Failed to load users")
    } finally {
      setLoadingUsers(false)
    }
  }, [apiFetch])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // Auto-select first admin
  useEffect(() => {
    if (!selectedAdminId && admins.length > 0) {
      setSelectedAdminId(admins[0].id)
    }
  }, [admins, selectedAdminId])

  // ── Load Admin Inventory ──────────────────────────────────
  const loadInventory = useCallback(async () => {
    if (!selectedAdminId) {
      setAdminInventory([])
      return
    }
    setLoadingInventory(true)
    try {
      const data = await apiFetch<IAdminInventory[]>(
        `/admin-inventory/admin/${selectedAdminId}`
      )
      setAdminInventory(Array.isArray(data) ? data : [])
    } catch {
      setAdminInventory([])
    } finally {
      setLoadingInventory(false)
    }
  }, [apiFetch, selectedAdminId])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  // ── Load Sales ────────────────────────────────────────────
  const loadSales = useCallback(async () => {
    setLoadingSales(true)
    try {
      const data = await apiFetch<ISale[]>("/sales")
      setSales(Array.isArray(data) ? data : [])
    } catch {
      setSales([])
    } finally {
      setLoadingSales(false)
    }
  }, [apiFetch])

  useEffect(() => {
    loadSales()
  }, [loadSales])

  // ── Load Products ─────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true)
    try {
      const data = await apiFetch<IProduct[]>("/products")
      setProducts(Array.isArray(data) ? data : [])
    } catch {
      setProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }, [apiFetch])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // ── Load Stock Requests ───────────────────────────────────
  const loadStockRequests = useCallback(async () => {
    setLoadingStockRequests(true)
    try {
      const data = await apiFetch<IStockRequest[]>("/stock-requests")
      setStockRequests(Array.isArray(data) ? data : [])
    } catch {
      setStockRequests([])
    } finally {
      setLoadingStockRequests(false)
    }
  }, [apiFetch])

  useEffect(() => {
    loadStockRequests()
  }, [loadStockRequests])

  // ── Load Stock Returns ────────────────────────────────────
  const loadReturns = useCallback(async () => {
    setLoadingReturns(true)
    try {
      const data = await apiFetch<IStockReturn[]>("/stock-returns?status=pending")
      setStockReturns(Array.isArray(data) ? data : [])
    } catch {
      setStockReturns([])
    } finally {
      setLoadingReturns(false)
    }
  }, [apiFetch])

  useEffect(() => {
    loadReturns()
  }, [loadReturns])

  // ── Derived data ──────────────────────────────────────────
  const agentsForAdmin = agents.filter((a) => a.created_by_id === selectedAdminId)

  const pendingAgents = useMemo(
    () => agents.filter((a) => a.is_active === false),
    [agents]
  )

  const productsMap = useMemo(() => {
    const m: Record<string, IProduct> = {}
    for (const p of products) m[p.id] = p
    return m
  }, [products])

  const productCategories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) {
      if (p.category) set.add(p.category)
    }
    return Array.from(set).sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    return products.filter((p) => {
      if (productCategoryFilter !== "all" && p.category !== productCategoryFilter) {
        return false
      }
      if (!q) return true
      return (
        (p.name || "").toLowerCase().includes(q) ||
        (p.model || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      )
    })
  }, [products, productSearch, productCategoryFilter])

  const filteredPriceProducts = useMemo(() => {
    const q = priceSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.model || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
    )
  }, [products, priceSearch])

  const filteredInventory = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase()
    if (!q) return adminInventory
    return adminInventory.filter((row) => {
      const name = row.product?.name?.toLowerCase() ?? ""
      const model = row.product?.model?.toLowerCase() ?? ""
      const cat = row.product?.category?.toLowerCase() ?? ""
      return name.includes(q) || model.includes(q) || cat.includes(q)
    })
  }, [adminInventory, inventorySearch])

  const filteredSales = useMemo(() => {
    return sales
      .filter((s) => salesTypeFilter === "all" || s.type === salesTypeFilter)
      .filter((s) => {
        const q = salesSearch.trim().toLowerCase()
        return !q || (s.customer_name ?? "").toLowerCase().includes(q)
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [sales, salesTypeFilter, salesSearch])

  const pendingSales = useMemo(
    () => sales.filter((s) => (s.approval_status || "pending") === "pending"),
    [sales]
  )

  const filteredApprovalSales = useMemo(() => {
    return pendingSales
      .filter((s) => approvalSalesType === "all" || s.type === approvalSalesType)
      .filter((s) => {
        const q = approvalSalesSearch.trim().toLowerCase()
        return !q || (s.customer_name ?? "").toLowerCase().includes(q)
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [pendingSales, approvalSalesType, approvalSalesSearch])

  const filteredStockRequests = useMemo(() => {
    const q = stockRequestSearch.trim().toLowerCase()
    return stockRequests
      .filter((r) => {
        if (!q) return true
        return (
          (r.requested_by_name || "").toLowerCase().includes(q) ||
          (r.primary_product_name || "").toLowerCase().includes(q)
        )
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [stockRequests, stockRequestSearch])

  const pendingStockRequests = useMemo(
    () => stockRequests.filter((r) => r.status === "pending"),
    [stockRequests]
  )

  const filteredReturns = useMemo(() => {
    const q = returnSearch.trim().toLowerCase()
    return stockReturns
      .filter((r) => {
        if (!q) return true
        const admin = (r.admin?.name || r.admin?.username || "").toLowerCase()
        const product = (r.product?.name || "").toLowerCase()
        const reason = (r.reason || "").toLowerCase()
        return admin.includes(q) || product.includes(q) || reason.includes(q)
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [stockReturns, returnSearch])

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return admins
    return admins.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q)
    )
  }, [admins, userSearch])

  const totalStockValue = useMemo(
    () =>
      adminInventory.reduce((acc, row) => {
        const price = row.product?.unit_price ?? 0
        return acc + Number(row.quantity) * price
      }, 0),
    [adminInventory]
  )

  const totalStockQty = useMemo(
    () => adminInventory.reduce((acc, row) => acc + Number(row.quantity), 0),
    [adminInventory]
  )

  const totalSalesAmount = useMemo(
    () => sales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0),
    [sales]
  )

  // ── Approval actions ──────────────────────────────────────
  const approveAgent = async (user: IUser) => {
    setProcessingUserId(user.id)
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: true }),
      })
      await loadUsers()
    } catch (e: any) {
      alert(e?.message || "Failed to approve agent")
    } finally {
      setProcessingUserId(null)
    }
  }

  const rejectAgent = async (user: IUser) => {
    if (!window.confirm(`Reject ${user.name || user.username}? They will stay inactive.`)) return
    setProcessingUserId(user.id)
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: false }),
      })
      await loadUsers()
    } catch (e: any) {
      alert(e?.message || "Failed to reject agent")
    } finally {
      setProcessingUserId(null)
    }
  }

  const approveSale = async (sale: ISale) => {
    setApprovingSaleId(sale.id)
    try {
      await apiFetch(`/sales/${sale.id}`, {
        method: "PUT",
        body: JSON.stringify({ approval_status: "approved" }),
      })
      await loadSales()
    } catch (e: any) {
      alert(e?.message || "Failed to approve sale")
    } finally {
      setApprovingSaleId(null)
    }
  }

  const processReturn = async (ret: IStockReturn) => {
    setProcessingReturnId(ret.id)
    try {
      await apiFetch(`/stock-returns/${ret.id}/process`, { method: "POST", body: JSON.stringify({}) })
      await loadReturns()
    } catch (e: any) {
      alert(e?.message || "Failed to process return")
    } finally {
      setProcessingReturnId(null)
    }
  }

  const deleteProduct = async (product: IProduct) => {
    if (!window.confirm(`Delete product "${product.name}"? This cannot be undone.`)) return
    try {
      await apiFetch(`/products/${product.id}`, { method: "DELETE" })
      await loadProducts()
    } catch (e: any) {
      alert(e?.message || "Failed to delete product")
    }
  }

  const toggleUserActive = async (user: IUser) => {
    setTogglingUserId(user.id)
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !(user.is_active !== false) }),
      })
      await loadUsers()
    } catch (e: any) {
      alert(e?.message || "Failed to update user")
    } finally {
      setTogglingUserId(null)
    }
  }

  const refreshAll = () => {
    loadUsers()
    loadSales()
    loadInventory()
    loadProducts()
    loadStockRequests()
    loadReturns()
  }

  const tabTriggerClass =
    "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-400 rounded-lg"

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 sm:space-y-6 px-2 sm:px-4 lg:px-6 py-2 sm:py-4 md:py-6">
      {/* ── Error Banner ── */}
      {usersError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {usersError}
          <button
            onClick={loadUsers}
            className="ml-auto underline text-red-400 hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="w-full">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-1">Super Admin Dashboard</h1>
        <p className="text-xs sm:text-sm text-slate-400">Welcome {userName}</p>
      </div>

      {/* ── Key Metrics ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2">Total Products</p>
          <p className="text-2xl sm:text-3xl font-bold text-white">{products.length}</p>
        </Card>
        <Card className="bg-amber-950/30 border-amber-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2">Pending Requests</p>
          <p className="text-2xl sm:text-3xl font-bold text-amber-500">{pendingStockRequests.length}</p>
        </Card>
        <Card className="bg-cyan-950/30 border-cyan-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2">Total Stock</p>
          <p className="text-2xl sm:text-3xl font-bold text-cyan-400">
            {products.reduce((sum, p) => sum + Number(p.quantity ?? p.central_stock ?? 0), 0)}
          </p>
        </Card>
        <Card className="bg-red-950/30 border-red-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            Low Stock
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-red-400">
            {products.filter((p) => Number(p.quantity ?? p.central_stock ?? 0) < 50).length}
          </p>
        </Card>
        <Card className="bg-purple-950/30 border-purple-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2 flex items-center gap-1">
            <Users className="w-4 h-4" />
            Pending Agents
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-purple-400">{pendingAgents.length}</p>
        </Card>
        <Card className="bg-orange-950/30 border-orange-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2 flex items-center gap-1">
            <RotateCcw className="w-4 h-4" />
            Return Approvals
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-orange-400">{stockReturns.length}</p>
        </Card>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="w-full mb-6 sm:mb-8 bg-slate-900 rounded-lg p-1">
          <TabsList className="bg-slate-900 border-0 p-0 w-full grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="stock-requests" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Stock Requests</span>
            </TabsTrigger>
            <TabsTrigger value="approvals" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Approvals</span>
            </TabsTrigger>
            <TabsTrigger value="agent" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Agent</span>
            </TabsTrigger>
            <TabsTrigger value="admin" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Admin</span>
            </TabsTrigger>
            <TabsTrigger value="returns" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Return Approvals</span>
            </TabsTrigger>
            <TabsTrigger value="selling-price" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Set Selling Price</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Users</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ════════════════ OVERVIEW TAB ════════════════ */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Admins</p>
                  <p className="text-xl font-bold text-white">{admins.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Agents</p>
                  <p className="text-xl font-bold text-white">{agents.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Pending Agents</p>
                  <p className="text-xl font-bold text-white">{pendingAgents.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Pending Returns</p>
                  <p className="text-xl font-bold text-white">{stockReturns.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Products Catalog */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold text-slate-400 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-400" />
                  Products Catalog
                  <span className="text-slate-400 font-normal">({filteredProducts.length})</span>
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search products…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 w-44"
                    />
                  </div>
                  <select
                    value={productCategoryFilter}
                    onChange={(e) => setProductCategoryFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All categories</option>
                    {productCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() => setProductModal({ product: null })}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Product
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingProducts ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading products…
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">
                  {products.length === 0 ? "No products yet" : "No matches for your search"}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-slate-400 text-xs uppercase">
                        <th className="text-left px-4 py-3">Product</th>
                        <th className="text-left px-4 py-3">Category</th>
                        <th className="text-right px-4 py-3">Qty</th>
                        <th className="text-right px-4 py-3">Unit Price</th>
                        <th className="text-right px-4 py-3">Selling Price</th>
                        <th className="text-center px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="text-white font-medium">{p.name}</p>
                            <p className="text-xs text-slate-400">
                              {p.model}
                              {p.wattage ? ` · ${p.wattage}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-slate-700 text-slate-400 rounded px-2 py-0.5">
                              {p.category || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-white">
                            {fmtQty(p.quantity ?? p.central_stock)}
                            {p.unit && (
                              <span className="text-xs text-slate-400 ml-1">{p.unit}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-400">
                            {fmtCurrency(p.unit_price)}
                          </td>
                          <td className="px-4 py-3 text-right text-white">
                            {p.selling_price ? fmtCurrency(p.selling_price) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setProductModal({ product: p })}
                                className="border-slate-600 text-slate-400 hover:bg-slate-700 text-xs px-2 py-1 h-auto"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteProduct(p)}
                                className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs px-2 py-1 h-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ STOCK REQUESTS TAB ════════════════ */}
        <TabsContent value="stock-requests" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by admin name…"
                value={stockRequestSearch}
                onChange={(e) => setStockRequestSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 w-56"
              />
            </div>
            <span className="text-xs text-slate-400 ml-auto">
              {pendingStockRequests.length} pending · {stockRequests.length} total
            </span>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              {loadingStockRequests ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading stock requests…
                </div>
              ) : filteredStockRequests.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">No stock requests found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-slate-400 text-xs uppercase">
                        <th className="text-left px-4 py-3">Requested By</th>
                        <th className="text-left px-4 py-3">Items</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-right px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStockRequests.map((req) => {
                        const itemCount = req.items?.length ?? 0
                        const totalQty = (req.items || []).reduce(
                          (a, it) => a + Number(it.quantity || 0),
                          0
                        )
                        return (
                          <tr
                            key={req.id}
                            className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <p className="text-white font-medium">
                                {req.requested_by_name || "—"}
                              </p>
                              {req.primary_product_name && (
                                <p className="text-xs text-slate-400">
                                  {req.primary_product_name}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {itemCount} item(s) · {fmtQty(totalQty)} qty
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={req.status} />
                              {req.status === "rejected" && req.rejection_reason && (
                                <p className="text-xs text-red-400 mt-1">{req.rejection_reason}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                              {fmtDate(req.created_at)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {req.status === "pending" ? (
                                <Button
                                  size="sm"
                                  onClick={() => setApprovalRequest(req)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                                >
                                  <Truck className="w-3.5 h-3.5 mr-1" />
                                  Review &amp; Dispatch
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ APPROVALS TAB ════════════════ */}
        <TabsContent value="approvals" className="mt-4 space-y-4">
          {/* Pending Agents */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-400 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-400" />
                Pending Agents
                <span className="text-slate-400 font-normal">({pendingAgents.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {loadingUsers ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              ) : pendingAgents.length === 0 ? (
                <p className="text-slate-400 text-sm">No agents awaiting approval.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pendingAgents.map((agent) => {
                    const admin = admins.find((a) => a.id === agent.created_by_id)
                    return (
                      <div
                        key={agent.id}
                        className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 space-y-2"
                      >
                        <div>
                          <p className="text-white text-sm font-medium truncate">
                            {agent.name || agent.username}
                          </p>
                          <p className="text-slate-400 text-xs truncate">@{agent.username}</p>
                          {admin && (
                            <p className="text-slate-400 text-xs truncate">
                              under {admin.name || admin.username}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => approveAgent(agent)}
                            disabled={processingUserId === agent.id}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                          >
                            {processingUserId === agent.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rejectAgent(agent)}
                            disabled={processingUserId === agent.id}
                            className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-8"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Sales */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold text-slate-400 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-blue-400" />
                  Pending Sales
                  <span className="text-slate-400 font-normal">({filteredApprovalSales.length})</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search customer…"
                      value={approvalSalesSearch}
                      onChange={(e) => setApprovalSalesSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 w-40"
                    />
                  </div>
                  {(["all", "B2B", "B2C"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setApprovalSalesType(t)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        approvalSalesType === t
                          ? "bg-blue-600 text-white"
                          : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                      }`}
                    >
                      {t === "all" ? "All" : t}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingSales ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading sales…
                </div>
              ) : filteredApprovalSales.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">No sales awaiting approval</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-slate-400 text-xs uppercase">
                        <th className="text-left px-4 py-3">Customer</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-right px-4 py-3">Amount</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-right px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApprovalSales.map((sale) => (
                        <tr
                          key={sale.id}
                          className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="text-white font-medium">{sale.customer_name}</p>
                            {sale.created_by_name && (
                              <p className="text-xs text-slate-400">by {sale.created_by_name}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                                sale.type === "B2B"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-sky-500/20 text-sky-300"
                              }`}
                            >
                              {sale.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-white font-medium">
                            {fmtCurrency(sale.total_amount)}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                            {fmtDate(sale.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              onClick={() => approveSale(sale)}
                              disabled={approvingSaleId === sale.id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                            >
                              {approvingSaleId === sale.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ AGENT TAB ════════════════ */}
        <TabsContent value="agent" className="mt-4 space-y-4">
          {/* Admin Picker */}
          <Card className="bg-slate-800 border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Sell from admin stock</label>
            <select
              value={selectedAdminId}
              onChange={(e) => setSelectedAdminId(e.target.value)}
              className="w-full sm:w-96 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              {admins.length === 0 && <option value="">No admins found</option>}
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.username}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-2">B2B/B2C sales use this admin&apos;s stock and serials.</p>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              onClick={() => {
                if (!selectedAdminId) return alert("Select an admin first")
                setShowSale("B2B")
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
              disabled={!selectedAdminId}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New B2B Sale
            </Button>
            <Button
              onClick={() => {
                if (!selectedAdminId) return alert("Select an admin first")
                setShowSale("B2C")
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white text-sm"
              disabled={!selectedAdminId}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New B2C Sale
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customer…"
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 w-44"
                />
              </div>
              {(["all", "B2B", "B2C"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSalesTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    salesTypeFilter === t
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                  }`}
                >
                  {t === "all" ? "All" : t}
                </button>
              ))}
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-3">
                <p className="text-xs text-slate-400">Total Sales</p>
                <p className="text-xl font-bold text-white">{sales.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-3">
                <p className="text-xs text-slate-400">Revenue</p>
                <p className="text-xl font-bold text-emerald-400">{fmtCurrency(totalSalesAmount)}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700 col-span-2 sm:col-span-1">
              <CardContent className="p-3">
                <p className="text-xs text-slate-400">Showing</p>
                <p className="text-xl font-bold text-slate-400">{filteredSales.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Sales Table */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Sales History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingSales ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading sales…
                </div>
              ) : filteredSales.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">No sales found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-slate-400 text-xs uppercase">
                        <th className="text-left px-4 py-3">Customer</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-right px-4 py-3">Amount</th>
                        <th className="text-left px-4 py-3">Payment</th>
                        <th className="text-left px-4 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.map((sale) => (
                        <tr
                          key={sale.id}
                          className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="text-white font-medium">{sale.customer_name}</p>
                            {sale.customer_phone && (
                              <p className="text-xs text-slate-400">{sale.customer_phone}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                                sale.type === "B2B"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-sky-500/20 text-sky-300"
                              }`}
                            >
                              {sale.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-white font-medium">
                            {fmtCurrency(sale.total_amount)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                                sale.payment_status === "completed"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {sale.payment_status === "completed" ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : null}
                              {sale.payment_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                            {fmtDate(sale.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ ADMIN TAB ════════════════ */}
        <TabsContent value="admin" className="mt-4 space-y-4">
          {/* Admin Picker */}
          <Card className="bg-slate-800 border-slate-700 p-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Manage admin</label>
            <select
              value={selectedAdminId}
              onChange={(e) => setSelectedAdminId(e.target.value)}
              className="w-full sm:w-96 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              {admins.length === 0 && <option value="">No admins found</option>}
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.username}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-2">Stock requests and agents are created for this admin.</p>
          </Card>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-green-400" />
                Admin Stock & Agents
                {selectedAdmin && (
                  <span className="text-sm font-normal text-slate-400">
                    — {selectedAdmin.name || selectedAdmin.username}
                  </span>
                )}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    if (!selectedAdminId) return alert("Select an admin first")
                    setShowStockRequest(true)
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm"
                  disabled={!selectedAdminId}
                >
                  <TrendingUp className="w-4 h-4 mr-1.5" />
                  Request Stock from Super Admin
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedAdminId) return alert("Select an admin first")
                    setShowCreateAgent(true)
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm"
                  disabled={!selectedAdminId}
                >
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Create Agent for Admin
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="bg-slate-800 border-slate-700 p-4">
                <p className="text-slate-400 text-sm mb-1">Stock lines</p>
                <p className="text-2xl font-bold text-green-400">{filteredInventory.length}</p>
              </Card>
              <Card className="bg-slate-800 border-slate-700 p-4">
                <p className="text-slate-400 text-sm mb-1">Agents under admin</p>
                <p className="text-2xl font-bold text-purple-400">{agentsForAdmin.length}</p>
              </Card>
              <Card className="bg-slate-800 border-slate-700 p-4">
                <p className="text-slate-400 text-sm mb-1">Total units</p>
                <p className="text-2xl font-bold text-cyan-400">{fmtQty(totalStockQty)}</p>
              </Card>
            </div>
          </div>

          {/* Stock Table */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold text-slate-400 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  Stock Inventory
                </CardTitle>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search admin stock..."
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 w-44 sm:w-56"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingInventory ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading inventory…
                </div>
              ) : !selectedAdminId ? (
                <p className="text-slate-400 text-sm text-center py-10">Select an admin to view stock</p>
              ) : filteredInventory.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">
                  {adminInventory.length === 0
                    ? "No stock allocated to this admin"
                    : "No matches for your search"}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-slate-400 text-xs uppercase">
                        <th className="text-left px-4 py-3">Product</th>
                        <th className="text-left px-4 py-3">Category</th>
                        <th className="text-right px-4 py-3">Qty</th>
                        <th className="text-right px-4 py-3">Unit Price</th>
                        <th className="text-right px-4 py-3">Value</th>
                        <th className="text-center px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((row) => {
                        const p = row.product
                        const pid = row.product_id || p?.id || row.id
                        const qty = Number(row.quantity)
                        const price = p?.unit_price ?? 0
                        return (
                          <tr
                            key={pid}
                            className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <p className="text-white font-medium">{p?.name ?? "—"}</p>
                              <p className="text-xs text-slate-400">{p?.model ?? ""}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs bg-slate-700 text-slate-400 rounded px-2 py-0.5">
                                {p?.category ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`font-mono font-medium ${
                                  qty <= 0
                                    ? "text-red-400"
                                    : qty < 5
                                    ? "text-amber-300"
                                    : "text-white"
                                }`}
                              >
                                {fmtQty(qty)}
                              </span>
                              {p?.unit && (
                                <span className="text-xs text-slate-400 ml-1">{p.unit}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-400">
                              {fmtCurrency(price)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-400">
                              {fmtCurrency(qty * price)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => p && setShowSerials(p)}
                                className="border-slate-600 text-slate-400 hover:bg-slate-700 text-xs px-2 py-1 h-auto"
                                disabled={!p}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                Serials
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Agents Under Admin */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                Agents under {selectedAdmin?.name || selectedAdmin?.username || "this Admin"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {loadingUsers ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              ) : agentsForAdmin.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  No agents under this admin.{" "}
                  <button
                    onClick={() => selectedAdminId && setShowCreateAgent(true)}
                    className="text-blue-400 hover:underline"
                  >
                    Create one?
                  </button>
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {agentsForAdmin.map((agent) => (
                    <div
                      key={agent.id}
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 flex items-center gap-2 shadow-sm"
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(agent.name || agent.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {agent.name || agent.username}
                        </p>
                        <p className="text-slate-400 text-xs truncate">@{agent.username}</p>
                      </div>
                      <span
                        className={`ml-auto text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                          agent.is_active !== false
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {agent.is_active !== false ? "active" : "pending"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ RETURNS TAB ════════════════ */}
        <TabsContent value="returns" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search returns…"
                value={returnSearch}
                onChange={(e) => setReturnSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 w-56"
              />
            </div>
            <span className="text-xs text-slate-400 ml-auto">
              {stockReturns.length} pending return(s)
            </span>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              {loadingReturns ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading returns…
                </div>
              ) : filteredReturns.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">No pending returns</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-slate-400 text-xs uppercase">
                        <th className="text-left px-4 py-3">Admin</th>
                        <th className="text-left px-4 py-3">Product</th>
                        <th className="text-right px-4 py-3">Qty</th>
                        <th className="text-left px-4 py-3">Reason</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-right px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReturns.map((ret) => (
                        <tr
                          key={ret.id}
                          className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-white">
                            {ret.admin?.name || ret.admin?.username || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-white font-medium">
                              {ret.product?.name || productsMap[ret.product_id]?.name || "—"}
                            </p>
                            <p className="text-xs text-slate-400">
                              {ret.product?.model || productsMap[ret.product_id]?.model || ""}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-white">
                            {fmtQty(ret.quantity)}
                          </td>
                          <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">
                            {ret.reason || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                            {fmtDate(ret.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              onClick={() => processReturn(ret)}
                              disabled={processingReturnId === ret.id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                            >
                              {processingReturnId === ret.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ SELLING PRICE TAB ════════════════ */}
        <TabsContent value="selling-price" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products…"
                value={priceSearch}
                onChange={(e) => setPriceSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 w-56"
              />
            </div>
            <span className="text-xs text-slate-400 ml-auto">
              {filteredPriceProducts.length} product(s)
            </span>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              {loadingProducts ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading products…
                </div>
              ) : filteredPriceProducts.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">No products found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-slate-400 text-xs uppercase">
                        <th className="text-left px-4 py-3">Product</th>
                        <th className="text-left px-4 py-3">Category</th>
                        <th className="text-right px-4 py-3">Cost</th>
                        <th className="text-right px-4 py-3">Selling Price</th>
                        <th className="text-right px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPriceProducts.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="text-white font-medium">{p.name}</p>
                            <p className="text-xs text-slate-400">{p.model}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-slate-700 text-slate-400 rounded px-2 py-0.5">
                              {p.category || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-400">
                            {fmtCurrency(p.unit_price)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-white">
                            {p.selling_price ? (
                              fmtCurrency(p.selling_price)
                            ) : (
                              <span className="text-amber-400 text-xs">Not set</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSellingPriceProduct(p)}
                              className="border-slate-600 text-slate-400 hover:bg-slate-700 text-xs"
                            >
                              <Tag className="w-3.5 h-3.5 mr-1" />
                              Set Price
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ USERS TAB ════════════════ */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setShowCreateUser(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              Create Admin / Account
            </Button>
            <div className="relative ml-auto">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search admins…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500 w-56"
              />
            </div>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                Admins
                <span className="text-slate-400 font-normal">({filteredUsers.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingUsers ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading users…
                </div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">No admins found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600 text-slate-400 text-xs uppercase">
                        <th className="text-left px-4 py-3">Name</th>
                        <th className="text-left px-4 py-3">Username</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-right px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => {
                        const active = u.is_active !== false
                        return (
                          <tr
                            key={u.id}
                            className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                          >
                            <td className="px-4 py-3 text-white font-medium">
                              {u.name || u.username}
                            </td>
                            <td className="px-4 py-3 text-slate-400">@{u.username}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                                  active
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-slate-700 text-slate-400"
                                }`}
                              >
                                {active ? "active" : "inactive"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleUserActive(u)}
                                disabled={togglingUserId === u.id}
                                className="border-slate-600 text-slate-400 hover:bg-slate-700 text-xs"
                              >
                                {togglingUserId === u.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : active ? (
                                  "Deactivate"
                                ) : (
                                  "Activate"
                                )}
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Modals ── */}
      {showCreateAgent && selectedAdminId && selectedAdmin && (
        <CreateAgentModal
          adminId={selectedAdminId}
          adminName={selectedAdmin.name || selectedAdmin.username}
          onClose={() => setShowCreateAgent(false)}
          onSuccess={loadUsers}
          fetch={apiFetch}
        />
      )}
      {showStockRequest && selectedAdminId && selectedAdmin && (
        <StockRequestModal
          adminId={selectedAdminId}
          adminName={selectedAdmin.name || selectedAdmin.username}
          onClose={() => setShowStockRequest(false)}
          onSuccess={() => loadStockRequests()}
          fetch={apiFetch}
        />
      )}
      {showSerials && selectedAdminId && (
        <SerialsViewModal
          adminId={selectedAdminId}
          product={showSerials}
          onClose={() => setShowSerials(null)}
          fetch={apiFetch}
        />
      )}
      {showSale && selectedAdminId && selectedAdmin && (
        <SimpleSaleModal
          adminId={selectedAdminId}
          adminName={selectedAdmin.name || selectedAdmin.username}
          saleType={showSale}
          adminInventory={adminInventory}
          onClose={() => setShowSale(null)}
          onSuccess={() => { loadSales(); loadInventory() }}
          fetch={apiFetch}
        />
      )}
      {productModal && (
        <ProductFormModal
          product={productModal.product}
          onClose={() => setProductModal(null)}
          onSuccess={loadProducts}
          fetch={apiFetch}
        />
      )}
      {approvalRequest && (
        <ApprovalModal
          request={approvalRequest}
          products={productsMap}
          onClose={() => setApprovalRequest(null)}
          onSuccess={() => { loadStockRequests(); loadInventory() }}
          fetch={apiFetch}
        />
      )}
      {showCreateUser && (
        <CreateUserModal
          onClose={() => setShowCreateUser(false)}
          onSuccess={loadUsers}
          fetch={apiFetch}
        />
      )}
      {sellingPriceProduct && (
        <SellingPriceModal
          product={sellingPriceProduct}
          onClose={() => setSellingPriceProduct(null)}
          onSuccess={loadProducts}
          fetch={apiFetch}
        />
      )}
    </div>
  )
}
