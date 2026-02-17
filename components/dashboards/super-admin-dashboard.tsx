"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Edit2, Trash2, Package, Search, TrendingUp, AlertCircle, Loader2, UserPlus, Users, CheckCircle, XCircle, RotateCcw, DollarSign, Eye } from "lucide-react"
import ProductModal from "@/components/modals/product-modal"
import EnhancedRequestApprovalModal from "@/components/modals/enhanced-request-approval-modal"
import CreateUserModal from "@/components/modals/create-user-modal"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useInventoryState } from "@/hooks/use-inventory-state"
import { useStockRequestsState } from "@/hooks/use-stock-requests-state"
import { productsApi, stockRequestsApi, categoriesApi, usersApi, stockReturnsApi } from "@/lib/api"
import { authService, type User } from "@/lib/auth"
import { formatDateISO } from "@/lib/utils"
import { FEATURE_FLAGS } from "@/lib/feature-flags"
import type { Product } from "@/lib/api"
import type { StockRequest, StockReturn } from "@/lib/api"

interface SuperAdminDashboardProps {
  userName: string
}

export default function SuperAdminDashboard({ userName }: SuperAdminDashboardProps) {
  const inventory = useInventoryState([])
  const requestsState = useStockRequestsState([])
  // Explicitly type requests to ensure correct type inference
  const requests = {
    ...requestsState,
    requests: requestsState.requests as StockRequest[]
  }
  
  const [showProductModal, setShowProductModal] = useState(false)
  const [openSerialNumbersOnMount, setOpenSerialNumbersOnMount] = useState(false)
  const [recentlyCreatedSerials, setRecentlyCreatedSerials] = useState<Record<string, string[]>>({})
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [createUserTargetRole, setCreateUserTargetRole] = useState<"admin" | "super-admin-manager">("admin")
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [requestsSearchQuery, setRequestsSearchQuery] = useState("")
  const [referenceUnitsByName, setReferenceUnitsByName] = useState<Record<string, string>>({})
  
  // Agent approval state
  const [pendingAgents, setPendingAgents] = useState<User[]>([])
  const [allAgents, setAllAgents] = useState<User[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [processingAgentIds, setProcessingAgentIds] = useState<Set<string>>(new Set())
  const [agentsSearchQuery, setAgentsSearchQuery] = useState("")
  
  // Admin list state
  const [admins, setAdmins] = useState<User[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)
  const [adminsSearchQuery, setAdminsSearchQuery] = useState("")
  const [processingAdminIds, setProcessingAdminIds] = useState<Set<string>>(new Set())
  
  // Product Manager list state
  const [productManagers, setProductManagers] = useState<User[]>([])
  const [loadingProductManagers, setLoadingProductManagers] = useState(true)
  const [productManagersSearchQuery, setProductManagersSearchQuery] = useState("")
  const [processingManagerIds, setProcessingManagerIds] = useState<Set<string>>(new Set())
  
  // Stock returns state
  const [stockReturns, setStockReturns] = useState<StockReturn[]>([])
  const [loadingReturns, setLoadingReturns] = useState(true)
  const [processingReturnIds, setProcessingReturnIds] = useState<Set<string>>(new Set())
  const [returnsSearchQuery, setReturnsSearchQuery] = useState("")
  const [returnsProducts, setReturnsProducts] = useState<Record<string, Product>>({})
  
  // Tab state
  const [activeTab, setActiveTab] = useState<string>("overview")

  // Helper function to format product names from request items
  const formatProductNames = (request: StockRequest): string => {
    // Prioritize primary_product_name from the request
    if (request.primary_product_name) {
      return request.primary_product_name
    }
    
    // Fallback to extracting from items
    if (!request.items || request.items.length === 0) {
      return "No Products"
    }
    const productNames = request.items
      .map(item => item.product?.name)
      .filter((name): name is string => !!name)
    
    if (productNames.length === 0) {
      return "Unknown Products"
    }
    
    // Remove duplicates and join with commas
    const uniqueNames = [...new Set(productNames)]
    return uniqueNames.join(", ")
  }

  // Load categories from API and also extract unique categories from products
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await categoriesApi.getAll()
        const apiCategories = cats.map(c => c.label)
        
        // Also get unique categories from existing products
        const productCategories = Array.from(
          new Set(inventory.products.map(p => p.category).filter(Boolean))
        )
        
        // Combine and deduplicate
        const allCategories = Array.from(new Set([...apiCategories, ...productCategories]))
        setCategories(allCategories.sort())
      } catch (err) {
        console.error("Failed to load categories:", err)
        // Fallback: extract categories from products only
        const productCategories = Array.from(
          new Set(inventory.products.map(p => p.category).filter(Boolean))
        )
        setCategories(productCategories.sort())
      }
    }
    loadCategories()
  }, [inventory.products])

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

  // Load pending agents (agents created by admins that need approval)
  // Backend filters: super-admin receives all agents, we filter for inactive ones client-side
  const loadPendingAgents = useCallback(async () => {
    try {
      setLoadingAgents(true)
      // Backend returns all agents for super-admin
      const agents = await usersApi.getAll("agent")
      setAllAgents(agents)
      // Filter for inactive agents (those needing approval) created by admins
      // Only show agents that are not active and were created by admins
      const pending = agents.filter(agent => 
        (agent.is_active === false || agent.is_active === undefined || agent.is_active === null) &&
        // Check if agent was created by an admin (not super-admin or account)
        (agent.created_by_id || agent.admin_id) // Has a creator/admin relationship
      )
      setPendingAgents(pending)
    } catch (err) {
      console.error("Failed to load pending agents:", err)
      setPendingAgents([])
      setAllAgents([])
    } finally {
      setLoadingAgents(false)
    }
  }, [])

  useEffect(() => {
    loadPendingAgents()
  }, [loadPendingAgents])

  // Load all stock returns
  const loadStockReturns = useCallback(async () => {
    try {
      setLoadingReturns(true)
      // Fetch ALL pending stock returns (from all admins and agents)
      const allReturns = await stockReturnsApi.getAll({ status: "pending" })
      setStockReturns(allReturns)
      
      // Fetch all products to populate product info
      const allProducts = await productsApi.getAll()
      const productsMap: Record<string, Product> = {}
      allProducts.forEach(p => {
        productsMap[p.id] = p
      })
      setReturnsProducts(productsMap)
    } catch (err) {
      console.error("Failed to load stock returns:", err)
      setStockReturns([])
    } finally {
      setLoadingReturns(false)
    }
  }, [])

  useEffect(() => {
    loadStockReturns()
  }, [loadStockReturns])

  // Load all admins
  useEffect(() => {
    const loadAdmins = async () => {
      try {
        setLoadingAdmins(true)
        const allAdmins = await usersApi.getAll("admin")
        setAdmins(allAdmins)
      } catch (err) {
        console.error("Failed to load admins:", err)
        setAdmins([])
      } finally {
        setLoadingAdmins(false)
      }
    }
    loadAdmins()
  }, [])

  // Load all product managers (only if feature is enabled)
  useEffect(() => {
    if (!FEATURE_FLAGS.ENABLE_PRODUCT_MANAGER_ROLE) {
      setLoadingProductManagers(false)
      return
    }
    
    const loadProductManagers = async () => {
      try {
        setLoadingProductManagers(true)
        const allManagers = await usersApi.getAll("super-admin-manager")
        setProductManagers(allManagers)
      } catch (err) {
        console.error("Failed to load product managers:", err)
        setProductManagers([])
      } finally {
        setLoadingProductManagers(false)
      }
    }
    loadProductManagers()
  }, [])

  const handleProcessReturn = async (returnId: string) => {
    try {
      setProcessingReturnIds((prev) => new Set(prev).add(returnId))
      await stockReturnsApi.process(returnId)
      // Reload stock returns to update the list
      await loadStockReturns()
    } catch (err: any) {
      console.error("Failed to process stock return:", err)
      const errorMsg = err?.message || err?.data?.error || "Failed to process stock return. Please try again."
      alert(errorMsg)
    } finally {
      setProcessingReturnIds((prev) => {
        const next = new Set(prev)
        next.delete(returnId)
        return next
      })
    }
  }

  const handleApproveAgent = async (agentId: string) => {
    try {
      setProcessingAgentIds((prev) => new Set(prev).add(agentId))
      await usersApi.update(agentId, { is_active: true })
      // Reload pending agents to update the list
      await loadPendingAgents()
    } catch (err: any) {
      console.error("Failed to approve agent:", err)
      const errorMsg = err?.message || err?.data?.error || "Failed to approve agent. Please try again."
      alert(errorMsg)
    } finally {
      setProcessingAgentIds((prev) => {
        const next = new Set(prev)
        next.delete(agentId)
        return next
      })
    }
  }

  const handleRejectAgent = async (agentId: string) => {
    try {
      setProcessingAgentIds((prev) => new Set(prev).add(agentId))
      // Keep is_active as false (rejected)
      await usersApi.update(agentId, { is_active: false })
      // Reload pending agents to update the list
      await loadPendingAgents()
    } catch (err: any) {
      console.error("Failed to reject agent:", err)
      const errorMsg = err?.message || err?.data?.error || "Failed to reject agent. Please try again."
      alert(errorMsg)
    } finally {
      setProcessingAgentIds((prev) => {
        const next = new Set(prev)
        next.delete(agentId)
        return next
      })
    }
  }

  // Handle block/unblock admin
  const handleToggleAdminStatus = async (adminId: string, currentStatus: boolean) => {
    try {
      setProcessingAdminIds((prev) => new Set(prev).add(adminId))
      const newStatus = !currentStatus
      await usersApi.update(adminId, { is_active: newStatus })
      // Reload admins list to update the UI
      const allAdmins = await usersApi.getAll("admin")
      setAdmins(allAdmins)
    } catch (err: any) {
      console.error("Failed to update admin status:", err)
      const errorMsg = err?.message || err?.data?.error || "Failed to update admin status. Please try again."
      alert(errorMsg)
    } finally {
      setProcessingAdminIds((prev) => {
        const next = new Set(prev)
        next.delete(adminId)
        return next
      })
    }
  }

  // Handle block/unblock product manager
  const handleToggleManagerStatus = async (managerId: string, currentStatus: boolean) => {
    if (!FEATURE_FLAGS.ENABLE_PRODUCT_MANAGER_ROLE) return
    
    try {
      setProcessingManagerIds((prev) => new Set(prev).add(managerId))
      const newStatus = !currentStatus
      await usersApi.update(managerId, { is_active: newStatus })
      // Reload managers list to update the UI
      const allManagers = await usersApi.getAll("super-admin-manager")
      setProductManagers(allManagers)
    } catch (err: any) {
      console.error("Failed to update manager status:", err)
      const errorMsg = err?.message || err?.data?.error || "Failed to update manager status. Please try again."
      alert(errorMsg)
    } finally {
      setProcessingManagerIds((prev) => {
        const next = new Set(prev)
        next.delete(managerId)
        return next
      })
    }
  }

  const filteredProducts = inventory.products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.model.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter ? p.category === categoryFilter : true
    return matchesSearch && matchesCategory
  })

  const handleAddProduct = async (product: Product | Omit<Product, "id">) => {
    try {
      await inventory.addProduct(product as any)
      await inventory.refetch()
      // Store serial numbers for products we just created (for View All fallback when backend has not synced yet)
      if ("id" in product && product.id && (product as Product).serial_numbers?.length) {
        setRecentlyCreatedSerials((prev) => ({ ...prev, [product.id]: (product as Product).serial_numbers! }))
      }
      setShowProductModal(false)
      setEditingProduct(null)
    } catch (err) {
      console.error("Failed to save product:", err)
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return
    
    setIsDeleting(id)
    try {
      await inventory.deleteProduct(id)
      await inventory.refetch()
    } catch (err) {
      console.error("Failed to delete product:", err)
      alert("Failed to delete product. Please try again.")
    } finally {
      setIsDeleting(null)
    }
  }

  const handleApproveRequest = async () => {
    // The modal handles the approval itself, we just need to refetch and close
    await requestsState.refetch()
    setShowApprovalModal(false)
    setSelectedRequest(null)
  }

  const handleRejectRequest = async () => {
    // The modal handles the rejection itself, we just need to refetch and close
    await requestsState.refetch()
    setShowApprovalModal(false)
    setSelectedRequest(null)
  }

  // Backend automatically filters - super-admin receives requests from admins only
  // Sort requests by date (most recent first)
  const sortedAdminRequests = [...requests.requests].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA // Descending order (newest first)
  })
  
  // Filter requests by user search (backend already filtered by role)
  const filteredAdminRequests = sortedAdminRequests.filter((r) => {
    if (!requestsSearchQuery.trim()) return true
    return r.requested_by_name?.toLowerCase().includes(requestsSearchQuery.toLowerCase()) || false
  })
  
  const pendingRequests = filteredAdminRequests.filter((r) => r.status === "pending").length
  const dispatchedRequests = filteredAdminRequests.filter((r) => r.status === "dispatched").length
  const confirmedRequests = filteredAdminRequests.filter((r) => r.status === "confirmed").length
  const rejectedRequests = filteredAdminRequests.filter((r) => r.status === "rejected").length
  
  const totalProducts = inventory.products.length
  // Price calculation removed - not shown to super-admin
  // const totalValue = inventory.products.reduce((sum, p) => sum + (p.quantity || 0) * (p.price || 0), 0)
  const lowStockProducts = inventory.products.filter((p) => (p.quantity || 0) < 50).length

  // Filter pending agents by search
  const filteredPendingAgents = pendingAgents.filter((agent) => {
    if (!agentsSearchQuery.trim()) return true
    return (
      agent.name?.toLowerCase().includes(agentsSearchQuery.toLowerCase()) ||
      agent.username?.toLowerCase().includes(agentsSearchQuery.toLowerCase()) ||
      false
    )
  })

  // Filter stock returns by search
  const filteredStockReturns = stockReturns.filter((ret) => {
    if (!returnsSearchQuery.trim()) return true
    const product = returnsProducts[ret.product_id]
    const productName = product?.name || "Unknown"
    const adminName = ret.admin?.name || "Unknown"
    return (
      productName.toLowerCase().includes(returnsSearchQuery.toLowerCase()) ||
      adminName.toLowerCase().includes(returnsSearchQuery.toLowerCase()) ||
      ret.reason?.toLowerCase().includes(returnsSearchQuery.toLowerCase()) ||
      false
    )
  })

  // Sort stock returns by date (newest first)
  const sortedStockReturns = [...filteredStockReturns].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA // Descending order (newest first)
  })

  if (inventory.loading || requestsState.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 sm:space-y-6 px-2 sm:px-4 lg:px-6 py-2 sm:py-4 md:py-6">
      {/* Header */}
      <div className="w-full">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-1">Super Admin Dashboard</h1>
        <p className="text-xs sm:text-sm text-slate-400">Welcome {userName}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2">Total Products</p>
          <p className="text-2xl sm:text-3xl font-bold text-white">{totalProducts}</p>
        </Card>
        <Card className="bg-amber-950/30 border-amber-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2">Pending Requests</p>
          <p className="text-2xl sm:text-3xl font-bold text-amber-500">{pendingRequests}</p>
        </Card>
        <Card className="bg-cyan-950/30 border-cyan-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2">Total Stock</p>
          <p className="text-2xl sm:text-3xl font-bold text-cyan-400">
            {inventory.products.reduce((sum, p) => sum + (p.quantity || 0), 0)}
          </p>
        </Card>
        <Card className="bg-red-950/30 border-red-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            Low Stock
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-red-400">{lowStockProducts}</p>
        </Card>
        <Card className="bg-purple-950/30 border-purple-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2 flex items-center gap-1">
            <Users className="w-4 h-4" />
            Pending Agents
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-purple-400">{filteredPendingAgents.length}</p>
        </Card>
        <Card className="bg-orange-950/30 border-orange-700 border p-4 sm:p-6">
          <p className="text-slate-400 text-sm mb-2 flex items-center gap-1">
            <RotateCcw className="w-4 h-4" />
            Return Approvals
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-orange-400">{sortedStockReturns.length}</p>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="w-full mb-6 sm:mb-8 bg-slate-900 rounded-lg p-1">
          <TabsList className="bg-slate-900 border-0 p-0 w-full grid grid-cols-2 md:grid-cols-6 gap-2">
            <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="stock-requests" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Stock Requests</span>
            </TabsTrigger>
            <TabsTrigger value="agent-approvals" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Agent Approvals</span>
            </TabsTrigger>
            <TabsTrigger value="returns" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Return Approvals</span>
            </TabsTrigger>
            <TabsTrigger value="selling-price" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Set Selling Price</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-300 bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs px-3 py-2 rounded-md transition-all flex items-center justify-center">
              <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              <span>Users</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="mt-[60px] md:mt-0 space-y-6">
      {/* Users Section - First */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
            Users
          </h2>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="bg-slate-800 border-slate-700 p-4">
            <p className="text-slate-400 text-sm mb-2">Total Admins</p>
            <p className="text-2xl font-bold text-purple-400">{admins.length}</p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-4">
            <p className="text-slate-400 text-sm mb-2">Total Agents</p>
            <p className="text-2xl font-bold text-cyan-400">{allAgents.length}</p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-4">
            <p className="text-slate-400 text-sm mb-2">Pending Approvals</p>
            <p className="text-2xl font-bold text-amber-400">{filteredPendingAgents.length}</p>
          </Card>
        </div>
      </div>

      {/* Products Catalog Section - Second */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            Products Catalog
          </h2>
            <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => {
                setEditingProduct(null)
                setOpenSerialNumbersOnMount(false)
                setShowProductModal(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white hover:text-slate-100 text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2"
            >
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Add Product
            </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
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
                className="w-full sm:w-auto px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {categories.map((cat, index) => (
                  <option key={`${cat}-${index}`} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Products List */}
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <Card key={product.id} className="bg-slate-800 border-slate-700 p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 w-full sm:w-auto">
                        <h3 className="font-semibold text-white mb-2 sm:mb-1 truncate text-sm sm:text-base">{product.name}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                          <div className="min-w-0">
                            <p className="text-slate-400 text-xs mb-0.5">Model</p>
                            <p className="text-white truncate">{product.model}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-slate-400 text-xs mb-0.5">Category</p>
                            <p className="text-white truncate">{product.category}</p>
                          </div>
                          <div className="min-w-0 col-span-2 sm:col-span-1">
                            <p className="text-slate-400 text-xs mb-0.5">Quantity</p>
                            <p className={`font-semibold text-sm sm:text-base ${(product.quantity || 0) < 50 ? "text-red-400" : "text-cyan-400"}`}>
                              {product.quantity || 0}
                              {referenceUnitsByName[product.name] ? ` ${referenceUnitsByName[product.name]}` : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto sm:ml-4 flex-shrink-0 justify-end sm:justify-start">
                        <Button
                          onClick={() => {
                            setEditingProduct(product as Product)
                            setOpenSerialNumbersOnMount(false)
                            setShowProductModal(true)
                          }}
                          size="sm"
                          variant="outline"
                          className="border-slate-600 text-slate-300 flex-1 sm:flex-none"
                        >
                          <Edit2 className="w-4 h-4 sm:mr-0" />
                          <span className="ml-1 sm:hidden">Edit</span>
                        </Button>
                        <Button
                          onClick={() => handleDeleteProduct(product.id)}
                          size="sm"
                          variant="outline"
                          disabled={isDeleting === product.id}
                          className="border-red-600 text-red-400 hover:bg-red-950 flex-1 sm:flex-none"
                        >
                          {isDeleting === product.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 sm:mr-0" />
                              <span className="ml-1 sm:hidden">Delete</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 text-center">
                  <p className="text-slate-400 text-sm sm:text-base">No products found</p>
                </Card>
              )}
            </div>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="stock-requests" className="mt-[60px] md:mt-0 space-y-6">
          {/* Stock Requests List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                Stock Requests
              </h2>
            </div>

            {/* Search by User */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by admin name..."
                value={requestsSearchQuery}
                onChange={(e) => setRequestsSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-3">
          {filteredAdminRequests.map((request) => (
            <Card
              key={request.id}
              className={`border-l-4 p-3 ${
                request.status === "pending"
                  ? "bg-amber-950/30 border-l-amber-500 border border-slate-700"
                  : request.status === "dispatched"
                    ? "bg-green-950/30 border-l-green-500 border border-slate-700"
                    : request.status === "confirmed"
                      ? "bg-cyan-950/30 border-l-cyan-500 border border-slate-700"
                      : "bg-red-950/30 border-l-red-500 border border-slate-700"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-white text-sm">
                    {formatProductNames(request)}
                  </p>
                  <p className="text-xs text-slate-400">From: {request.requested_by_name || "Admin"}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                  request.status === "pending" ? "bg-amber-500 text-amber-950" :
                  request.status === "dispatched" ? "bg-green-500 text-green-950" :
                  request.status === "confirmed" ? "bg-cyan-500 text-cyan-950" :
                  "bg-red-500 text-red-950"
                }`}>
                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                </span>
              </div>
              <p className="text-white font-bold text-xs mb-2">
                Qty: {request.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}
              </p>
              {request.status === "pending" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedRequest(request)
                    setShowApprovalModal(true)
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white hover:text-slate-100 text-xs mt-2"
                >
                  Review & Dispatch
                </Button>
              )}
              {request.status === "rejected" && request.rejection_reason && (
                <p className="text-xs text-red-300 mt-1">Reason: {request.rejection_reason}</p>
              )}
            </Card>
            ))}
            {filteredAdminRequests.length === 0 && (
              <Card className="bg-slate-800 border-slate-700 p-4 text-center">
                <p className="text-slate-400">No stock requests found</p>
              </Card>
            )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="agent-approvals" className="mt-[60px] md:mt-0 space-y-6">
          {/* Pending Agent Approvals Section */}
          {filteredPendingAgents.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  Pending Agent Approvals
                </h2>
              </div>

              {/* Search for Agents */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search agents by name or username..."
                  value={agentsSearchQuery}
                  onChange={(e) => setAgentsSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Mobile Card View */}
              <div className="block lg:hidden space-y-3">
                {filteredPendingAgents.map((agent) => (
                  <Card key={agent.id} className="bg-slate-800 border-slate-700 p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm">{agent.name}</p>
                          <p className="text-xs text-slate-400 mt-1">{agent.username}</p>
                        </div>
                        <span className="px-2 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full whitespace-nowrap">
                          Pending
                        </span>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">Created Date</p>
                        <p className="text-slate-300 text-sm">
                          {formatDateISO(agent.created_at)}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-700 flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveAgent(agent.id)}
                          disabled={processingAgentIds.has(agent.id)}
                          className="w-full bg-green-600 hover:bg-green-700 text-white hover:text-slate-100 text-xs"
                        >
                          {processingAgentIds.has(agent.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleRejectAgent(agent.id)}
                          disabled={processingAgentIds.has(agent.id)}
                          variant="outline"
                          className="w-full border-red-600 text-red-400 hover:bg-red-950 text-xs"
                        >
                          {processingAgentIds.has(agent.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-700/50 border-b border-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Name</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Username</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Created Date</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {filteredPendingAgents.map((agent) => (
                        <tr key={agent.id} className="hover:bg-slate-700/30 transition">
                          <td className="px-6 py-4 text-white font-medium">{agent.name}</td>
                          <td className="px-6 py-4 text-slate-300">{agent.username}</td>
                          <td className="px-6 py-4 text-slate-400">
                            {formatDateISO(agent.created_at)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full">
                              Pending Approval
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApproveAgent(agent.id)}
                                disabled={processingAgentIds.has(agent.id)}
                                className="bg-green-600 hover:bg-green-700 text-white hover:text-slate-100 text-xs"
                              >
                                {processingAgentIds.has(agent.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleRejectAgent(agent.id)}
                                disabled={processingAgentIds.has(agent.id)}
                                variant="outline"
                                className="border-red-600 text-red-400 hover:bg-red-950 text-xs"
                              >
                                {processingAgentIds.has(agent.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Reject
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <Card className="bg-slate-800 border-slate-700 p-6 text-center">
              <Users className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400 text-lg font-semibold mb-2">No Pending Agent Approvals</p>
              <p className="text-slate-500 text-sm">All agents have been approved or there are no pending agent creation requests.</p>
            </Card>
          )}

          {/* All Agents by Admin Section */}
          {allAgents.length > 0 && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-cyan-500" />
                  All Agents by Admin ({allAgents.length})
                </h2>
              </div>

              {/* Group agents by admin */}
              {(() => {
                // Group agents by created_by_id
                const agentsByAdmin = new Map<string, User[]>()
                allAgents.forEach(agent => {
                  const adminId = agent.created_by_id || agent.admin_id || "unassigned"
                  if (!agentsByAdmin.has(adminId)) {
                    agentsByAdmin.set(adminId, [])
                  }
                  agentsByAdmin.get(adminId)!.push(agent)
                })

                // Get admin names and usernames
                const adminNameMap = new Map<string, string>()
                const adminUsernameMap = new Map<string, string>()
                admins.forEach(admin => {
                  adminNameMap.set(admin.id, admin.name)
                  adminUsernameMap.set(admin.id, admin.username)
                })
                adminNameMap.set("unassigned", "Unassigned Agents")
                adminUsernameMap.set("unassigned", "unassigned")

                return Array.from(agentsByAdmin.entries()).map(([adminId, adminAgents]) => {
                  const adminName = adminNameMap.get(adminId) || "Unknown Admin"
                  const adminUsername = adminUsernameMap.get(adminId) || "unknown"
                  const filteredAdminAgents = adminAgents.filter(agent => {
                    if (!agentsSearchQuery.trim()) return true
                    return (
                      agent.name?.toLowerCase().includes(agentsSearchQuery.toLowerCase()) ||
                      agent.username?.toLowerCase().includes(agentsSearchQuery.toLowerCase()) ||
                      false
                    )
                  })

                  if (filteredAdminAgents.length === 0) return null

                  return (
                    <Card key={adminId} className="bg-slate-800 border-slate-700 p-4 sm:p-6">
                      <div className="mb-4 pb-4 border-b border-slate-700">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-cyan-400" />
                          {adminName} ({adminUsername})
                          <span className="text-sm text-slate-400 font-normal">
                            ({filteredAdminAgents.length} {filteredAdminAgents.length === 1 ? 'agent' : 'agents'})
                          </span>
                        </h3>
                      </div>

                      {/* Mobile Card View */}
                      <div className="block lg:hidden space-y-3">
                        {filteredAdminAgents.map((agent) => (
                          <Card key={agent.id} className="bg-slate-700/50 border-slate-600 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold text-sm">{agent.name}</p>
                                <p className="text-xs text-slate-400 mt-1">{agent.username}</p>
                                <p className="text-xs text-cyan-400 mt-1 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  Admin: {adminUsername}
                                </p>
                              </div>
                              <span
                                className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  agent.is_active
                                    ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                    : "bg-red-500/20 text-red-400 border border-red-500/50"
                                }`}
                              >
                                {agent.is_active ? "Active" : "Inactive"}
                              </span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-600">
                              <p className="text-slate-400 text-xs">Created: {formatDateISO(agent.created_at)}</p>
                            </div>
                          </Card>
                        ))}
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-700/50 border-b border-slate-700">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300">Name</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300">Username</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300">Admin</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300">Status</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300">Created Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700">
                            {filteredAdminAgents.map((agent) => (
                              <tr key={agent.id} className="hover:bg-slate-700/30 transition">
                                <td className="px-4 py-3 text-white font-medium text-sm">{agent.name}</td>
                                <td className="px-4 py-3 text-slate-300 text-sm">{agent.username}</td>
                                <td className="px-4 py-3 text-cyan-400 text-sm font-medium">{adminUsername}</td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                      agent.is_active
                                        ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                        : "bg-red-500/20 text-red-400 border border-red-500/50"
                                    }`}
                                  >
                                    {agent.is_active ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-400 text-sm">
                                  {formatDateISO(agent.created_at)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )
                })
              })()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="returns" className="mt-[60px] md:mt-0">
          {/* Stock Returns Section */}
          {sortedStockReturns.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-orange-500" />
                  Stock Return Approvals
                </h2>
              </div>

              {/* Search for Stock Returns */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product name, returned by, or reason..."
                  value={returnsSearchQuery}
                  onChange={(e) => setReturnsSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Mobile Card View */}
              <div className="block lg:hidden space-y-3">
                {sortedStockReturns.map((ret) => {
                  const product = returnsProducts[ret.product_id] || ret.product
                  const productName = product?.name || "Unknown Product"
                  const productModel = product?.model || ""
                  const adminName = ret.admin?.name || "Unknown Admin"
                  return (
                    <Card key={ret.id} className="bg-slate-800 border-slate-700 p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm">{productName} {productModel && `- ${productModel}`}</p>
                            <p className="text-xs text-slate-400 mt-1">From: {adminName}</p>
                          </div>
                          <span className="px-2 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full whitespace-nowrap">
                            Pending
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-slate-400 text-xs">Quantity</p>
                            <p className="text-white font-bold text-cyan-400">{ret.quantity}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-xs">Date</p>
                            <p className="text-slate-300 text-sm">
                              {formatDateISO(ret.created_at)}
                            </p>
                          </div>
                        </div>
                        {ret.reason && (
                          <div>
                            <p className="text-slate-400 text-xs">Reason</p>
                            <p className="text-slate-300 text-sm">{ret.reason}</p>
                          </div>
                        )}
                        <div className="pt-2 border-t border-slate-700">
                          <Button
                            size="sm"
                            onClick={() => handleProcessReturn(ret.id)}
                            disabled={processingReturnIds.has(ret.id)}
                            className="w-full bg-green-600 hover:bg-green-700 text-white hover:text-slate-100 text-xs"
                          >
                            {processingReturnIds.has(ret.id) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve Return
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-700/50 border-b border-slate-700">
                      <tr>
                        <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Product</th>
                        <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Quantity</th>
                        <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Returned By</th>
                        <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Reason</th>
                        <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Date</th>
                        <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {sortedStockReturns.map((ret) => {
                        const product = returnsProducts[ret.product_id] || ret.product
                        const productName = product?.name || "Unknown Product"
                        const productModel = product?.model || ""
                        const adminName = ret.admin?.name || "Unknown Admin"
                        return (
                          <tr key={ret.id} className="hover:bg-slate-700/30 transition">
                            <td className="px-4 xl:px-6 py-3 xl:py-4 text-white font-medium text-sm">
                              {productName} {productModel && `- ${productModel}`}
                            </td>
                            <td className="px-4 xl:px-6 py-3 xl:py-4 text-white font-bold text-cyan-400 text-sm">{ret.quantity}</td>
                            <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-300 text-sm">{adminName}</td>
                            <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-400 text-sm max-w-xs truncate">{ret.reason || "N/A"}</td>
                            <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-400 text-sm">
                              {formatDateISO(ret.created_at)}
                            </td>
                            <td className="px-4 xl:px-6 py-3 xl:py-4">
                              <Button
                                size="sm"
                                onClick={() => handleProcessReturn(ret.id)}
                                disabled={processingReturnIds.has(ret.id)}
                                className="bg-green-600 hover:bg-green-700 text-white hover:text-slate-100 text-xs"
                              >
                                {processingReturnIds.has(ret.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Approve
                                  </>
                                )}
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <Card className="bg-slate-800 border-slate-700 p-6 text-center">
              <RotateCcw className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400 text-lg font-semibold mb-2">No Pending Return Approvals</p>
              <p className="text-slate-500 text-sm">There are no pending stock returns awaiting approval at the moment.</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="selling-price" className="mt-[60px] md:mt-0 space-y-6 overflow-x-hidden">
          <div className="space-y-4 min-w-0">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              Set Selling Price
            </h2>
            <p className="text-slate-400 text-sm">
              Set the selling price for each product. By default, the max cost price from registered stock is used. You can override with a custom price per product.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 min-w-0">
              <div className="flex-1 min-w-0 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full min-w-0 pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={categoryFilter || ""}
                onChange={(e) => setCategoryFilter(e.target.value || null)}
                className="w-full sm:w-auto min-w-0 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {categories.map((cat, index) => (
                  <option key={`sp-${cat}-${index}`} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-3 max-h-[600px] overflow-y-auto overflow-x-hidden pr-1">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <Card key={product.id} className="bg-slate-800 border-slate-700 p-3 sm:p-4 overflow-hidden">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <h3 className="font-semibold text-white mb-1 text-sm sm:text-base line-clamp-2 break-words">{product.name}</h3>
                        <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
                          <span className="text-slate-400">Category: <span className="text-white">{product.category}</span></span>
                          <span className="text-slate-400">Stock: <span className="text-cyan-400 font-medium">{product.quantity || 0}</span></span>
                          <span className="text-slate-400">Selling Price: <span className="text-emerald-400 font-medium">₹{((product as Product).selling_price ?? (product as Product).unit_price ?? (product as Product).price ?? 0).toLocaleString()}</span></span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
                        <Button
                          type="button"
                          onClick={() => {
                            setEditingProduct(product as Product)
                            setOpenSerialNumbersOnMount(true)
                            setShowProductModal(true)
                          }}
                          size="sm"
                          variant="outline"
                          className="border-slate-600 text-slate-300 shrink-0"
                          title="View serial numbers for this product"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => {
                            setEditingProduct(product as Product)
                            setOpenSerialNumbersOnMount(false)
                            setShowProductModal(true)
                          }}
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 whitespace-nowrap"
                        >
                          <DollarSign className="w-4 h-4 mr-1 shrink-0" />
                          Set Price
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 text-center">
                  <p className="text-slate-400 text-sm sm:text-base">No products found</p>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-[60px] md:mt-0">
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-500" />
                User Management
              </h2>
            </div>

            {/* Create User Cards */}
            <div className={`grid grid-cols-1 ${FEATURE_FLAGS.ENABLE_PRODUCT_MANAGER_ROLE ? 'md:grid-cols-2' : ''} gap-4`}>
              {FEATURE_FLAGS.ENABLE_PRODUCT_MANAGER_ROLE && (
                <Card className="bg-slate-800 border-slate-700 p-6">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-500" />
                    Product Manager
                  </h3>
                  <p className="text-slate-400 mb-4 text-sm">
                    Create a product manager who can add, edit, and manage all products in the system.
                  </p>
                  <Button
                    onClick={() => {
                      setCreateUserTargetRole("super-admin-manager")
                      setShowCreateUserModal(true)
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Product Manager
                  </Button>
                </Card>
              )}

              <Card className="bg-slate-800 border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  Admin User
                </h3>
                <p className="text-slate-400 mb-4 text-sm">
                  Create an admin user who can manage agents and stock requests.
                </p>
                <Button
                  onClick={() => {
                    setCreateUserTargetRole("admin")
                    setShowCreateUserModal(true)
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white w-full"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create Admin
                </Button>
              </Card>
            </div>

            {/* Admins List Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  All Admins ({admins.length})
                </h2>
              </div>

              {/* Search for Admins */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search admins by name or username..."
                  value={adminsSearchQuery}
                  onChange={(e) => setAdminsSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {loadingAdmins ? (
                <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-4" />
                  <p className="text-slate-400">Loading admins...</p>
                </Card>
              ) : (
                <>
                  {(() => {
                    const filteredAdmins = admins.filter((admin) => {
                      if (!adminsSearchQuery) return true
                      const searchLower = adminsSearchQuery.toLowerCase()
                      return (
                        admin.name.toLowerCase().includes(searchLower) ||
                        admin.username.toLowerCase().includes(searchLower)
                      )
                    })

                    return filteredAdmins.length > 0 ? (
                      <>
                        {/* Mobile Card View */}
                        <div className="block lg:hidden space-y-3">
                          {filteredAdmins.map((admin) => (
                            <Card key={admin.id} className="bg-slate-800 border-slate-700 p-4">
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold text-sm">{admin.name}</p>
                                    <p className="text-xs text-slate-400">{admin.username}</p>
                                  </div>
                                  <span
                                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                      admin.is_active
                                        ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                        : "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                    }`}
                                  >
                                    {admin.is_active ? "Active" : "Inactive"}
                                  </span>
                                </div>
                                <div className="pt-2 border-t border-slate-700">
                                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                    <div>
                                      <p className="text-slate-400">Role</p>
                                      <p className="text-slate-300 font-medium capitalize">{admin.role}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400">Created</p>
                                      <p className="text-slate-300">
                                        {formatDateISO(admin.created_at)}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleToggleAdminStatus(admin.id, admin.is_active || false)}
                                    disabled={processingAdminIds.has(admin.id)}
                                    className={`w-full text-xs ${
                                      admin.is_active
                                        ? "bg-red-600 hover:bg-red-700 text-white"
                                        : "bg-green-600 hover:bg-green-700 text-white"
                                    }`}
                                  >
                                    {processingAdminIds.has(admin.id) ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    ) : admin.is_active ? (
                                      <>
                                        <XCircle className="w-3 h-3 mr-1" />
                                        Block Admin
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Unblock Admin
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-700/50 border-b border-slate-700">
                                <tr>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Name
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Username
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Role
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Status
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Created Date
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-700">
                                {filteredAdmins.map((admin) => (
                                  <tr
                                    key={admin.id}
                                    className="hover:bg-slate-700/30 transition"
                                  >
                                    <td className="px-6 py-4 text-white font-medium">
                                      {admin.name}
                                    </td>
                                    <td className="px-6 py-4 text-slate-300">{admin.username}</td>
                                    <td className="px-6 py-4 text-slate-400 capitalize">
                                      {admin.role}
                                    </td>
                                    <td className="px-6 py-4">
                                      <span
                                        className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                          admin.is_active
                                            ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                            : "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                        }`}
                                      >
                                        {admin.is_active ? "Active" : "Blocked"}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 text-sm">
                                      {formatDateISO(admin.created_at)}
                                    </td>
                                    <td className="px-6 py-4">
                                      <Button
                                        size="sm"
                                        onClick={() => handleToggleAdminStatus(admin.id, admin.is_active || false)}
                                        disabled={processingAdminIds.has(admin.id)}
                                        className={`text-xs ${
                                          admin.is_active
                                            ? "bg-red-600 hover:bg-red-700 text-white"
                                            : "bg-green-600 hover:bg-green-700 text-white"
                                        }`}
                                      >
                                        {processingAdminIds.has(admin.id) ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : admin.is_active ? (
                                          <>
                                            <XCircle className="w-3 h-3 mr-1" />
                                            Block
                                          </>
                                        ) : (
                                          <>
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Unblock
                                          </>
                                        )}
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : (
                      <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                        <Users className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                        <p className="text-slate-400 text-lg font-semibold mb-2">
                          {adminsSearchQuery ? "No admins found" : "No admins created yet"}
                        </p>
                        <p className="text-slate-500 text-sm">
                          {adminsSearchQuery
                            ? "Try adjusting your search query"
                            : "Create your first admin using the button above"}
                        </p>
                      </Card>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Product Managers List Section */}
            {FEATURE_FLAGS.ENABLE_PRODUCT_MANAGER_ROLE && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-500" />
                  Product Managers ({productManagers.length})
                </h2>
              </div>

              {/* Search for Product Managers */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search product managers by name or username..."
                  value={productManagersSearchQuery}
                  onChange={(e) => setProductManagersSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {loadingProductManagers ? (
                <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
                  <p className="text-slate-400">Loading product managers...</p>
                </Card>
              ) : (
                <>
                  {(() => {
                    const filteredManagers = productManagers.filter((manager) => {
                      if (!productManagersSearchQuery) return true
                      const searchLower = productManagersSearchQuery.toLowerCase()
                      return (
                        manager.name.toLowerCase().includes(searchLower) ||
                        manager.username.toLowerCase().includes(searchLower)
                      )
                    })

                    return filteredManagers.length > 0 ? (
                      <>
                        {/* Mobile Card View */}
                        <div className="block lg:hidden space-y-3">
                          {filteredManagers.map((manager) => (
                            <Card key={manager.id} className="bg-slate-800 border-slate-700 p-4">
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold text-sm">{manager.name}</p>
                                    <p className="text-xs text-slate-400">{manager.username}</p>
                                  </div>
                                  <span
                                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                      manager.is_active
                                        ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                        : "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                    }`}
                                  >
                                    {manager.is_active ? "Active" : "Blocked"}
                                  </span>
                                </div>
                                <div className="pt-2 border-t border-slate-700">
                                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                    <div>
                                      <p className="text-slate-400">Role</p>
                                      <p className="text-slate-300 font-medium">Product Manager</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400">Created</p>
                                      <p className="text-slate-300">
                                        {formatDateISO(manager.created_at)}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleToggleManagerStatus(manager.id, manager.is_active || false)}
                                    disabled={processingManagerIds.has(manager.id)}
                                    className={`w-full text-xs ${
                                      manager.is_active
                                        ? "bg-red-600 hover:bg-red-700 text-white"
                                        : "bg-green-600 hover:bg-green-700 text-white"
                                    }`}
                                  >
                                    {processingManagerIds.has(manager.id) ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    ) : manager.is_active ? (
                                      <>
                                        <XCircle className="w-3 h-3 mr-1" />
                                        Block Manager
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Unblock Manager
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-700/50 border-b border-slate-700">
                                <tr>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Name
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Username
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Role
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Status
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Created Date
                                  </th>
                                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-700">
                                {filteredManagers.map((manager) => (
                                  <tr
                                    key={manager.id}
                                    className="hover:bg-slate-700/30 transition"
                                  >
                                    <td className="px-6 py-4 text-white font-medium">
                                      {manager.name}
                                    </td>
                                    <td className="px-6 py-4 text-slate-300">{manager.username}</td>
                                    <td className="px-6 py-4 text-slate-400">
                                      Product Manager
                                    </td>
                                    <td className="px-6 py-4">
                                      <span
                                        className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                          manager.is_active
                                            ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                            : "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                        }`}
                                      >
                                        {manager.is_active ? "Active" : "Blocked"}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 text-sm">
                                      {formatDateISO(manager.created_at)}
                                    </td>
                                    <td className="px-6 py-4">
                                      <Button
                                        size="sm"
                                        onClick={() => handleToggleManagerStatus(manager.id, manager.is_active || false)}
                                        disabled={processingManagerIds.has(manager.id)}
                                        className={`text-xs ${
                                          manager.is_active
                                            ? "bg-red-600 hover:bg-red-700 text-white"
                                            : "bg-green-600 hover:bg-green-700 text-white"
                                        }`}
                                      >
                                        {processingManagerIds.has(manager.id) ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : manager.is_active ? (
                                          <>
                                            <XCircle className="w-3 h-3 mr-1" />
                                            Block
                                          </>
                                        ) : (
                                          <>
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Unblock
                                          </>
                                        )}
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : (
                      <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                        <Package className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                        <p className="text-slate-400 text-lg font-semibold mb-2">
                          {productManagersSearchQuery ? "No product managers found" : "No product managers created yet"}
                        </p>
                        <p className="text-slate-500 text-sm">
                          {productManagersSearchQuery
                            ? "Try adjusting your search query"
                            : "Create your first product manager using the button above"}
                        </p>
                      </Card>
                    )
                  })()}
                </>
              )}
            </div>
            )}
          </div>
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
            setOpenSerialNumbersOnMount(false)
          }}
          onSave={handleAddProduct}
          openSerialNumbersOnMount={openSerialNumbersOnMount}
        />
      )}

      {showApprovalModal && selectedRequest && (
        <EnhancedRequestApprovalModal
          request={selectedRequest}
          onApprove={handleApproveRequest}
          onReject={handleRejectRequest}
          onClose={() => {
            setShowApprovalModal(false)
            setSelectedRequest(null)
          }}
        />
      )}
      {showCreateUserModal && (
        <CreateUserModal
          creatorRole="super-admin"
          targetRole={createUserTargetRole}
          onClose={() => setShowCreateUserModal(false)}
          onSuccess={async () => {
            setShowCreateUserModal(false)
            // Reload appropriate list based on target role
            try {
              if (createUserTargetRole === "admin") {
                const allAdmins = await usersApi.getAll("admin")
                setAdmins(allAdmins)
              } else if (createUserTargetRole === "super-admin-manager" && FEATURE_FLAGS.ENABLE_PRODUCT_MANAGER_ROLE) {
                const allManagers = await usersApi.getAll("super-admin-manager")
                setProductManagers(allManagers)
              }
            } catch (err) {
              console.error("Failed to reload users:", err)
            }
          }}
        />
      )}
    </div>
  )
}
