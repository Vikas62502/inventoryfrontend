"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Plus,
  Package,
  Search,
  ShoppingCart,
  FileJson,
  Loader2,
  Eye,
  UserPlus,
  Download,
  Edit2,
  TrendingUp,
} from "lucide-react"
import SalesModal from "@/components/modals/sales-modal"
import TallyJsonImportModal from "@/components/modals/tally-json-import-modal"
import SaleEditModal from "@/components/modals/sale-edit-modal"
import SerialNumbersViewModal from "@/components/modals/serial-numbers-view-modal"
import CreateUserModal from "@/components/modals/create-user-modal"
import AdminStockRequestModal from "@/components/modals/admin-stock-request-modal"
import { adminInventoryApi, salesApi, productsApi, type AdminInventory, type Sale, type Product } from "@/lib/api"
import type { User } from "@/lib/auth"
import type { TallyImportPrefill } from "@/lib/tally-json-import"
import { formatDateISO, unitToFormSelectValue } from "@/lib/utils"
import { generateQuotationPDF } from "@/lib/quotation-generator"

interface SuperAdminOpsPanelsProps {
  admins: User[]
  allAgents: User[]
  onAgentsChanged?: () => void
  /** Separate Super-admin tabs: agent sales vs admin stock/ops */
  panel: "agent" | "admin"
}

export default function SuperAdminOpsPanels({
  admins,
  allAgents,
  onAgentsChanged,
  panel,
}: SuperAdminOpsPanelsProps) {
  const [selectedAdminId, setSelectedAdminId] = useState<string>("")
  const [adminInventory, setAdminInventory] = useState<AdminInventory[]>([])
  const [loadingInventory, setLoadingInventory] = useState(false)
  const [inventorySearchQuery, setInventorySearchQuery] = useState("")

  const [sales, setSales] = useState<Sale[]>([])
  const [loadingSales, setLoadingSales] = useState(true)
  const [salesSearchQuery, setSalesSearchQuery] = useState("")
  const [salesTypeFilter, setSalesTypeFilter] = useState<"all" | "B2B" | "B2C">("all")
  const [showSalesModal, setShowSalesModal] = useState(false)
  const [saleType, setSaleType] = useState<"b2b" | "b2c" | null>(null)
  const [salesPrefill, setSalesPrefill] = useState<TallyImportPrefill | null>(null)
  const [showTallyImportModal, setShowTallyImportModal] = useState(false)
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null)

  const [showSerialNumbersModal, setShowSerialNumbersModal] = useState(false)
  const [serialNumbersProduct, setSerialNumbersProduct] = useState<{ id: string; name: string } | null>(null)
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false)
  const [showStockRequestModal, setShowStockRequestModal] = useState(false)

  useEffect(() => {
    if (!selectedAdminId && admins.length > 0) {
      setSelectedAdminId(admins[0].id)
    }
  }, [admins, selectedAdminId])

  useEffect(() => {
    const loadInventory = async () => {
      if (!selectedAdminId) {
        setAdminInventory([])
        return
      }
      try {
        setLoadingInventory(true)
        const inventory = await adminInventoryApi.getByAdmin(selectedAdminId)
        setAdminInventory(inventory)
      } catch (err) {
        console.error("Failed to load admin inventory:", err)
        setAdminInventory([])
      } finally {
        setLoadingInventory(false)
      }
    }
    void loadInventory()
  }, [selectedAdminId])

  useEffect(() => {
    const loadSales = async () => {
      try {
        setLoadingSales(true)
        const data = await salesApi.getAll()
        setSales(data)
      } catch (err) {
        console.error("Failed to load sales:", err)
        setSales([])
      } finally {
        setLoadingSales(false)
      }
    }
    void loadSales()
  }, [])

  const availableStockForSales = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of adminInventory) {
      const productId = row.product_id || row.product?.id
      if (!productId) continue
      map[productId] = Number(row.quantity || 0)
    }
    return map
  }, [adminInventory])

  const filteredInventory = adminInventory.filter((row) => {
    const q = inventorySearchQuery.trim().toLowerCase()
    if (!q) return true
    const name = row.product?.name || ""
    const model = row.product?.model || ""
    const category = row.product?.category || ""
    return (
      name.toLowerCase().includes(q) ||
      model.toLowerCase().includes(q) ||
      category.toLowerCase().includes(q)
    )
  })

  const filteredSales = sales
    .filter((s) => salesTypeFilter === "all" || s.type === salesTypeFilter)
    .filter((s) => {
      const q = salesSearchQuery.trim().toLowerCase()
      if (!q) return true
      return (s.customer_name || "").toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const dateA = a.sale_date ? new Date(a.sale_date).getTime() : a.created_at ? new Date(a.created_at).getTime() : 0
      const dateB = b.sale_date ? new Date(b.sale_date).getTime() : b.created_at ? new Date(b.created_at).getTime() : 0
      return dateB - dateA
    })

  const agentsForAdmin = allAgents.filter((a) => a.created_by_id === selectedAdminId)

  const selectedAdmin = admins.find((a) => a.id === selectedAdminId)

  const refreshSalesAndStock = async () => {
    try {
      const [salesData, inventory] = await Promise.all([
        salesApi.getAll(),
        selectedAdminId ? adminInventoryApi.getByAdmin(selectedAdminId) : Promise.resolve([]),
      ])
      setSales(salesData)
      setAdminInventory(inventory)
    } catch (err) {
      console.error("Failed to refresh sales/stock:", err)
    }
  }

  const handleDownloadQuotation = async (sale: Sale) => {
    try {
      setDownloadingSaleId(sale.id)
      const fullSale = await salesApi.getById(sale.id)
      const allProducts = await productsApi.getAll()
      const productsMap: Record<string, Product> = {}
      allProducts.forEach((p) => {
        productsMap[p.id] = p
      })
      if (!fullSale.items || fullSale.items.length === 0) {
        throw new Error("Sale has no items")
      }
      generateQuotationPDF(fullSale as any, productsMap)
    } catch (err: any) {
      alert(err?.message || "Failed to generate quotation")
    } finally {
      setDownloadingSaleId(null)
    }
  }

  return (
    <div className="space-y-8">
      <Card className="bg-slate-800 border-slate-700 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {panel === "agent" ? "Sell from admin stock" : "Manage admin"}
        </label>
        <select
          value={selectedAdminId}
          onChange={(e) => setSelectedAdminId(e.target.value)}
          className="w-full sm:w-96 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          {admins.length === 0 && <option value="">No admins found</option>}
          {admins.map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.name || admin.username}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-2">
          {panel === "agent"
            ? "B2B/B2C sales use this admin’s stock and serials."
            : "Stock requests and agents are created for this admin."}
        </p>
      </Card>

      {panel === "agent" && (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-400" />
            Agent Sales (B2B / B2C)
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (!selectedAdminId) {
                  alert("Select an admin first")
                  return
                }
                setSaleType("b2b")
                setSalesPrefill(null)
                setShowSalesModal(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
              disabled={!selectedAdminId}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New B2B Sale
            </Button>
            <Button
              onClick={() => {
                if (!selectedAdminId) {
                  alert("Select an admin first")
                  return
                }
                setSaleType("b2c")
                setSalesPrefill(null)
                setShowSalesModal(true)
              }}
              className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs sm:text-sm"
              disabled={!selectedAdminId}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New B2C Sale
            </Button>
            <Button
              onClick={() => {
                if (!selectedAdminId) {
                  alert("Select an admin first")
                  return
                }
                setShowTallyImportModal(true)
              }}
              variant="outline"
              className="border-amber-600 text-amber-300 hover:bg-amber-950 text-xs sm:text-sm"
              disabled={!selectedAdminId}
            >
              <FileJson className="w-4 h-4 mr-1.5" />
              Import Tally JSON
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer name..."
              value={salesSearchQuery}
              onChange={(e) => setSalesSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "B2B", "B2C"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSalesTypeFilter(t)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  salesTypeFilter === t
                    ? t === "B2C"
                      ? "bg-cyan-600 text-white"
                      : "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {t === "all" ? "All" : t}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          {loadingSales ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No sales found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredSales.slice(0, 50).map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-700/30">
                      <td className="px-4 py-3 text-white text-sm">{sale.customer_name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            sale.type === "B2B"
                              ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                              : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                          }`}
                        >
                          {sale.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-emerald-400 text-sm font-bold">
                        ₹{(sale.total_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {sale.approval_status || "pending"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {formatDateISO(sale.sale_date || sale.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-600 text-slate-300 h-8 px-2"
                            onClick={() => setEditingSaleId(sale.id)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-600 text-slate-300 h-8 px-2"
                            disabled={downloadingSaleId === sale.id}
                            onClick={() => void handleDownloadQuotation(sale)}
                          >
                            {downloadingSaleId === sale.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {panel === "admin" && (
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
              onClick={() => setShowStockRequestModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm"
              disabled={!selectedAdminId}
            >
              <TrendingUp className="w-4 h-4 mr-1.5" />
              Request Stock from Super Admin
            </Button>
            <Button
              onClick={() => setShowCreateAgentModal(true)}
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
            <p className="text-2xl font-bold text-cyan-400">
              {Number(
                filteredInventory.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
              ).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </Card>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search admin stock..."
            value={inventorySearchQuery}
            onChange={(e) => setInventorySearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          {loadingInventory ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {selectedAdminId ? "No stock for this admin" : "Select an admin"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredInventory.map((row) => {
                    const product = row.product
                    const productId = row.product_id || product?.id
                    const unit = unitToFormSelectValue(product?.unit || "") || "units"
                    return (
                      <tr key={row.id} className="hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-white text-sm">
                          {product?.name || "Unknown"}
                          {product?.model && product.model !== product.name && (
                            <span className="block text-xs text-slate-400">{product.model}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-sm">{product?.category || "—"}</td>
                        <td className="px-4 py-3 text-emerald-400 text-sm font-semibold">
                          {Number(row.quantity || 0).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          {unit}
                        </td>
                        <td className="px-4 py-3">
                          {productId && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-600 text-slate-300 h-8"
                              onClick={() => {
                                setSerialNumbersProduct({
                                  id: productId,
                                  name: product?.name || "Product",
                                })
                                setShowSerialNumbersModal(true)
                              }}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Serials
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {agentsForAdmin.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-300">Agents under this admin</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {agentsForAdmin.map((agent) => (
                <Card key={agent.id} className="bg-slate-800/80 border-slate-700 p-3">
                  <p className="text-white text-sm font-medium">{agent.name || agent.username}</p>
                  <p className="text-xs text-slate-400">@{agent.username}</p>
                  <p className="text-xs mt-1">
                    {agent.is_active ? (
                      <span className="text-emerald-400">Active</span>
                    ) : (
                      <span className="text-amber-400">Pending approval</span>
                    )}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {panel === "agent" && showTallyImportModal && (
        <TallyJsonImportModal
          onClose={() => setShowTallyImportModal(false)}
          availableProductIds={new Set(Object.keys(availableStockForSales))}
          onContinue={(prefill, type) => {
            setShowTallyImportModal(false)
            setSalesPrefill(prefill)
            setSaleType(type)
            setShowSalesModal(true)
          }}
        />
      )}

      {panel === "agent" && showSalesModal && saleType && selectedAdminId && (
        <SalesModal
          saleType={saleType}
          prefill={salesPrefill}
          onClose={() => {
            setShowSalesModal(false)
            setSaleType(null)
            setSalesPrefill(null)
          }}
          onSave={async () => {
            await refreshSalesAndStock()
          }}
          availableStock={availableStockForSales}
          adminId={selectedAdminId}
        />
      )}

      {panel === "agent" && editingSaleId && (
        <SaleEditModal
          saleId={editingSaleId}
          onClose={() => setEditingSaleId(null)}
          onSuccess={async (updated) => {
            setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
            setEditingSaleId(null)
          }}
        />
      )}

      {panel === "admin" && showSerialNumbersModal && serialNumbersProduct && selectedAdminId && (
        <SerialNumbersViewModal
          productId={serialNumbersProduct.id}
          productName={serialNumbersProduct.name}
          adminId={selectedAdminId}
          onClose={() => {
            setShowSerialNumbersModal(false)
            setSerialNumbersProduct(null)
          }}
        />
      )}

      {panel === "admin" && showCreateAgentModal && selectedAdminId && (
        <CreateUserModal
          creatorRole="super-admin"
          targetRole="agent"
          createdById={selectedAdminId}
          onClose={() => setShowCreateAgentModal(false)}
          onSuccess={() => {
            setShowCreateAgentModal(false)
            onAgentsChanged?.()
          }}
        />
      )}

      {panel === "admin" && showStockRequestModal && selectedAdminId && (
        <AdminStockRequestModal
          requestType="super-admin"
          onBehalfOfAdminId={selectedAdminId}
          onBehalfOfAdminName={selectedAdmin?.name || selectedAdmin?.username}
          onClose={() => setShowStockRequestModal(false)}
          onSuccess={async () => {
            setShowStockRequestModal(false)
            await refreshSalesAndStock()
          }}
        />
      )}
    </div>
  )
}
