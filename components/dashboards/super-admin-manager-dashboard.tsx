"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Edit2, Trash2, Package, Search, Loader2, Download } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import ProductModal from "@/components/modals/product-modal"
import AccountDashboard from "@/components/dashboards/account-dashboard"
import { productsApi, categoriesApi } from "@/lib/api"
import type { Product } from "@/lib/api"

interface SuperAdminManagerDashboardProps {
  userName: string
}

export default function SuperAdminManagerDashboard({ userName }: SuperAdminManagerDashboardProps) {
  const [activeTab, setActiveTab] = useState<string>("products")
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [recentlyCreatedSerials, setRecentlyCreatedSerials] = useState<Record<string, string[]>>({})
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [referenceUnitsByName, setReferenceUnitsByName] = useState<Record<string, string>>({})

  // Load products
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await productsApi.getAll()
      setProducts(data)
    } catch (err: any) {
      console.error("Failed to load products:", err)
      setError(err.message || "Failed to load products")
    } finally {
      setLoading(false)
    }
  }, [])

  // Load products on mount
  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await categoriesApi.getAll()
        setCategories(cats.map(c => c.label))
      } catch (err) {
        console.error("Failed to load categories:", err)
      }
    }
    loadCategories()
  }, [])

  // Load product units from reference catalog (for displaying KGS/NOS/etc in UI)
  useEffect(() => {
    const loadReferenceUnits = async () => {
      try {
        const res = await fetch("/PRODUCT_CATALOG_REFERENCE.json")
        const data = await res.json()
        const map: Record<string, string> = {}
        if (Array.isArray(data)) {
          data.forEach((item: any) => {
            if (item?.name && item?.unit) map[String(item.name)] = String(item.unit)
          })
        }
        setReferenceUnitsByName(map)
      } catch (err) {
        console.warn("Failed to load PRODUCT_CATALOG_REFERENCE.json for unit display:", err)
      }
    }
    loadReferenceUnits()
  }, [])

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      searchTerm === "" ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !categoryFilter || p.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleAddProduct = async (product: Product | Omit<Product, "id">) => {
    try {
      setError(null)
      if ("id" in product) {
        await productsApi.update(product.id, product)
        if ((product as Product).serial_numbers?.length) {
          setRecentlyCreatedSerials((prev) => ({ ...prev, [product.id]: (product as Product).serial_numbers! }))
        }
      } else {
        await productsApi.create(product)
      }
      setShowProductModal(false)
      setEditingProduct(null)
      // Reload products to get updated data
      await loadProducts()
    } catch (err: any) {
      console.error("Failed to save product:", err)
      const errorMessage = err?.message || err?.data?.error || "Failed to save product. Please try again."
      setError(errorMessage)
      throw err // Re-throw so modal can handle it
    }
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product)
    setShowProductModal(true)
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) {
      return
    }

    try {
      setIsDeleting(id)
      setError(null)
      await productsApi.delete(id)
      // Reload products to reflect deletion
      await loadProducts()
    } catch (err: any) {
      console.error("Failed to delete product:", err)
      const errorMessage = err?.message || err?.data?.error || "Failed to delete product. Please try again."
      setError(errorMessage)
      alert(errorMessage)
    } finally {
      setIsDeleting(null)
    }
  }

  // Use quantity or central_stock (API might return either)
  const getProductStock = (p: Product) => p.quantity ?? p.central_stock ?? p.total_stock ?? 0
  const getProductUnit = (p: Product) => referenceUnitsByName[p.name] || ""
  const totalStock = products.reduce((sum, p) => sum + getProductStock(p), 0)
  const lowStockCount = products.filter(p => getProductStock(p) < 10).length

  const handleDownloadStock = () => {
    const rows = filteredProducts.map((p) => ({
      product: p.name || "",
      category: p.category || "",
      model: p.model || "",
      wattage: p.wattage || "",
      stock: getProductStock(p),
      unit: getProductUnit(p) || "",
    }))

    const headers = ["Product", "Category", "Model", "Wattage", "Stock", "Unit"]
    const escapeCsv = (value: string | number) => {
      const str = String(value ?? "")
      if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
        return `"${str.replace(/"/g, "\"\"")}"`
      }
      return str
    }

    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [r.product, r.category, r.model, r.wattage, r.stock, r.unit].map(escapeCsv).join(",")
      ),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const date = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `stock-report-${date}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Product Management</h1>
        <p className="text-slate-400">Welcome {userName}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-900 border border-slate-700 p-1 grid grid-cols-1 sm:grid-cols-2 gap-1 h-auto w-full">
          <TabsTrigger value="products" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300">
            Product Management
          </TabsTrigger>
          <TabsTrigger value="accounts" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-slate-300">
            Approvals & Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6 mt-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-blue-950 to-slate-900 border-blue-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm mb-1">Total Products</p>
                  <p className="text-3xl font-bold text-white">{products.length}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500 opacity-50" />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-cyan-950 to-slate-900 border-cyan-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm mb-1">Total Stock</p>
                  <p className="text-3xl font-bold text-cyan-400">{totalStock}</p>
                </div>
                <Package className="w-8 h-8 text-cyan-500 opacity-50" />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-red-950 to-slate-900 border-red-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm mb-1">Low Stock Items</p>
                  <p className="text-3xl font-bold text-red-400">{lowStockCount}</p>
                </div>
                <Package className="w-8 h-8 text-red-500 opacity-50" />
              </div>
            </Card>
          </div>

          {/* Products Catalog */}
          <Card className="bg-slate-800 border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-500" />
            Products Catalog
          </h2>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleDownloadStock}
              variant="outline"
              className="border-cyan-600 text-cyan-400 hover:bg-cyan-950"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Stock
            </Button>
            <Button
              onClick={() => {
                setEditingProduct(null)
                setShowProductModal(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={categoryFilter || ""}
            onChange={(e) => setCategoryFilter(e.target.value || null)}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Products Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400 text-lg font-semibold mb-2">Error loading products</p>
            <p className="text-slate-500 text-sm mb-4">{error}</p>
            <Button onClick={loadProducts} className="bg-blue-600 hover:bg-blue-700 text-white">
              Retry
            </Button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 text-lg font-semibold mb-2">No products found</p>
            <p className="text-slate-500 text-sm">
              {searchTerm || categoryFilter
                ? "Try adjusting your search filters"
                : "Start by adding your first product"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Product</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Category</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Model</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Wattage</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Stock</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-700/30 transition">
                      <td className="px-4 py-3 text-white font-medium">{product.name}</td>
                      <td className="px-4 py-3 text-slate-300">{product.category}</td>
                      <td className="px-4 py-3 text-slate-400">{product.model}</td>
                      <td className="px-4 py-3 text-slate-400">{product.wattage || "N/A"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-bold ${
                            getProductStock(product) < 10 ? "text-red-400" : "text-cyan-400"
                          }`}
                        >
                          {getProductStock(product)}{getProductUnit(product) ? ` ${getProductUnit(product)}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditProduct(product)}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteProduct(product.id)}
                            disabled={isDeleting === product.id}
                            className="border-red-600 text-red-400 hover:bg-red-950"
                          >
                            {isDeleting === product.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="bg-slate-700/50 border-slate-600 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold truncate">{product.name}</h3>
                      <p className="text-slate-400 text-sm">{product.category}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-bold ${
                        getProductStock(product) < 10
                          ? "bg-red-500/20 text-red-400"
                          : "bg-cyan-500/20 text-cyan-400"
                      }`}
                    >
                      {getProductStock(product)}{getProductUnit(product) ? ` ${getProductUnit(product)}` : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <p className="text-slate-400">Model</p>
                      <p className="text-white">{product.model}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Wattage</p>
                      <p className="text-white">{product.wattage || "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditProduct(product)}
                      className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      <Edit2 className="w-3 h-3 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteProduct(product.id)}
                      disabled={isDeleting === product.id}
                      className="flex-1 border-red-600 text-red-400 hover:bg-red-950"
                    >
                      {isDeleting === product.id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="w-3 h-3 mr-2" />
                      )}
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <AccountDashboard userName={userName} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {showProductModal && (
        <ProductModal
          product={
            editingProduct
              ? {
                  ...editingProduct,
                  serial_numbers: editingProduct.serial_numbers ?? recentlyCreatedSerials[editingProduct.id],
                }
              : undefined
          }
          onClose={() => {
            setShowProductModal(false)
            setEditingProduct(null)
          }}
          onSave={handleAddProduct}
        />
      )}
    </div>
  )
}
