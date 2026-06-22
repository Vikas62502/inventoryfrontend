"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, CheckCircle, Clock, XCircle, ShoppingCart, AlertCircle, TrendingUp, Loader2, RotateCcw, UserPlus, Search, Package, Eye } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import AdminStockRequestModal from "@/components/modals/admin-stock-request-modal"
import StockConfirmationModal from "@/components/modals/stock-confirmation-modal"
import StockReturnModal from "@/components/modals/stock-return-modal"
import CreateUserModal from "@/components/modals/create-user-modal"
import SerialNumbersViewModal from "@/components/modals/serial-numbers-view-modal"
import { useStockRequestsState } from "@/hooks/use-stock-requests-state"
import { usersApi, stockReturnsApi, productsApi, adminInventoryApi } from "@/lib/api"
import type { AdminInventory } from "@/lib/api"
import { authService, type User } from "@/lib/auth"
import { formatDateISO, unitToFormSelectValue } from "@/lib/utils"
import type { StockRequest, StockReturn, Product } from "@/lib/api"

interface AdminDashboardProps {
  userName: string
}

export default function AdminDashboard({ userName }: AdminDashboardProps) {
  const requests = useStockRequestsState([])
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestModalType, setRequestModalType] = useState<"super-admin" | "admin-transfer" | null>(null)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [showStockReturnModal, setShowStockReturnModal] = useState(false)
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "dispatched" | "confirmed" | "rejected">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [myAgents, setMyAgents] = useState<User[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [agentsSearchQuery, setAgentsSearchQuery] = useState("")
  
  // Stock returns state
  const [stockReturns, setStockReturns] = useState<StockReturn[]>([])
  const [loadingReturns, setLoadingReturns] = useState(true)
  const [processingReturnIds, setProcessingReturnIds] = useState<Set<string>>(new Set())
  const [returnsSearchQuery, setReturnsSearchQuery] = useState("")
  const [returnsProducts, setReturnsProducts] = useState<Record<string, Product>>({})
  
  // Products state for stock requests
  const [requestProducts, setRequestProducts] = useState<Record<string, Product>>({})
  
  // Admin inventory state
  const [adminInventory, setAdminInventory] = useState<AdminInventory[]>([])
  const [loadingInventory, setLoadingInventory] = useState(true)
  const [inventorySearchQuery, setInventorySearchQuery] = useState("")
  const [showSerialNumbersModal, setShowSerialNumbersModal] = useState(false)
  const [serialNumbersProduct, setSerialNumbersProduct] = useState<{ id: string; name: string } | null>(null)
  
  // Tab state
  const [activeTab, setActiveTab] = useState<string>("overview")

  const getProductUnitLabel = (product?: Product): string => {
    const unit = unitToFormSelectValue(product?.unit || "")
    return unit || "units"
  }

  const currentUserId = authService.getUser()?.id
  const currentUser = authService.getUser()

  // Load agents created by this admin
  // Backend automatically filters - admins only receive agents they created
    const loadMyAgents = async () => {
      if (!currentUserId) return
      try {
        setLoadingAgents(true)
        // Backend filters agents - admins only see agents they created
        const myAgentsList = await usersApi.getAll("agent")
        setMyAgents(myAgentsList)
      } catch (err) {
        console.error("Failed to load agents:", err)
        // On error, set empty array to avoid showing all agents
        setMyAgents([])
      } finally {
        setLoadingAgents(false)
      }
    }

  useEffect(() => {
    loadMyAgents()
  }, [currentUserId])

  // Load products for stock requests
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const allProducts = await productsApi.getAll()
        const productsMap: Record<string, Product> = {}
        allProducts.forEach(p => {
          productsMap[p.id] = p
        })
        setRequestProducts(productsMap)
      } catch (err) {
        console.error("Failed to load products:", err)
      }
    }
    loadProducts()
  }, [])

  // Load admin inventory
  useEffect(() => {
    const loadAdminInventory = async () => {
      if (!currentUserId) return
      try {
        setLoadingInventory(true)
        const inventory = await adminInventoryApi.getByAdmin(currentUserId)
        setAdminInventory(inventory)
      } catch (err) {
        console.error("Failed to load admin inventory:", err)
        setAdminInventory([])
      } finally {
        setLoadingInventory(false)
      }
    }
    loadAdminInventory()
  }, [currentUserId])

  // Load stock returns from agents
  // Backend automatically filters - admins only receive returns from their agents
  useEffect(() => {
    const loadStockReturns = async () => {
      if (!currentUserId) return
      try {
        setLoadingReturns(true)
        // Backend filters returns - admins only see returns with admin_id = currentUserId
        const allReturns = await stockReturnsApi.getAll({ 
          status: "pending"
        })
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
    }
    loadStockReturns()
  }, [currentUserId])

  const handleProcessReturn = async (returnId: string) => {
    try {
      setProcessingReturnIds((prev) => new Set(prev).add(returnId))
      await stockReturnsApi.process(returnId)
      // Reload stock returns to update the list (backend automatically filters)
      const updatedReturns = await stockReturnsApi.getAll({ 
        status: "pending"
      })
      setStockReturns(updatedReturns)
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

  // Backend automatically filters stock requests based on role:
  // - Requests from agents created by this admin
  // - This admin's own requests to super-admin
  // - Admin-to-admin transfers (incoming and outgoing)
  // No additional client-side filtering needed for role-based access
  const allRequests = requests.requests
  
  // Sort by date (most recent first - descending order)
  const sortedRequests = [...allRequests].sort((a, b) => {
    const dateA = (a.requested_date || a.created_at) ? new Date(a.requested_date || a.created_at).getTime() : 0
    const dateB = (b.requested_date || b.created_at) ? new Date(b.requested_date || b.created_at).getTime() : 0
    return dateB - dateA // Descending order (newest first)
  })

  const filteredRequests = sortedRequests.filter((r) => {
    // Filter by status
    const statusMatch = statusFilter === "all" || r.status === statusFilter
    
    // Filter by user search (search in requested_by_name)
    const userMatch = !searchQuery.trim() || 
      (r.requested_by_name?.toLowerCase().includes(searchQuery.toLowerCase()) || false)
    
    return statusMatch && userMatch
  })

  // Filter and sort stock returns
  const filteredStockReturns = stockReturns.filter((ret) => {
    if (!returnsSearchQuery.trim()) return true
    const product = returnsProducts[ret.product_id] || ret.product
    const productName = product?.name || "Unknown"
    const adminName = ret.admin?.name || "Unknown"
    return (
      productName.toLowerCase().includes(returnsSearchQuery.toLowerCase()) ||
      adminName.toLowerCase().includes(returnsSearchQuery.toLowerCase()) ||
      ret.reason?.toLowerCase().includes(returnsSearchQuery.toLowerCase()) ||
      false
    )
  })

  // Sort stock returns by date (newest first - descending order)
  const sortedStockReturns = [...filteredStockReturns].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA // Descending order (newest first)
  })

  const handleCreateRequest = async () => {
    await requests.refetch()
    setShowRequestModal(false)
    setRequestModalType(null)
  }


  const handleConfirmReceipt = async () => {
    await requests.refetch()
    setShowConfirmationModal(false)
    setSelectedRequest(null)
  }

  const approved = allRequests.filter((r) => r.status === "dispatched" || r.status === "confirmed").length
  const pending = allRequests.filter((r) => r.status === "pending").length
  const rejected = allRequests.filter((r) => r.status === "rejected").length
  const totalInventoryUnits = adminInventory.reduce((sum, item) => sum + item.quantity, 0)
  const approvalRate = allRequests.length > 0 ? Math.round((approved / allRequests.length) * 100) : 0

  const inProgress = pending
  const completed = approved + rejected
  const requestsThisMonth = allRequests.filter(
    (r) => (r.requested_date || r.created_at) ? new Date(r.requested_date || r.created_at).getMonth() === new Date().getMonth() : false,
  ).length

  // Calculate admin's net stock: confirmed stock received - stock transferred to agents
  const confirmedStockReceived = allRequests
    .filter((r) => 
      r.requested_by_id === currentUserId && // Admin's own requests
      r.requested_from === "super-admin" && // From super-admin
      r.status === "confirmed" // Confirmed (received)
    )
    .reduce((sum, r) => {
      return sum + (r.items?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0)
    }, 0)

  // Agents no longer request stock, so no stock is transferred to agents
  const stockTransferredToAgents = 0

  const adminNetStock = confirmedStockReceived - stockTransferredToAgents

  if (requests.loading) {
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
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 px-2 sm:px-4 lg:px-6">
      {/* Header */}
      <div className="px-2 sm:px-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-slate-400">Welcome {userName}</p>
      </div>

      {/* Key Metrics - Clean and Responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-xs sm:text-sm mb-1">Pending</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-500">{pending}</p>
            </div>
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 opacity-50 flex-shrink-0" />
          </div>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-xs sm:text-sm mb-1">Approved</p>
              <p className="text-xl sm:text-2xl font-bold text-green-500">{approved}</p>
            </div>
            <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-500 opacity-50 flex-shrink-0" />
          </div>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-xs sm:text-sm mb-1">Rejected</p>
              <p className="text-xl sm:text-2xl font-bold text-red-500">{rejected}</p>
            </div>
            <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-500 opacity-50 flex-shrink-0" />
          </div>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-xs sm:text-sm mb-1">Total Stock Value</p>
              <p className="text-xl sm:text-2xl font-bold text-cyan-500">{totalInventoryUnits}</p>
            </div>
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-500 opacity-50 flex-shrink-0" />
          </div>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-xs sm:text-sm mb-1">Rate</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-500">{approvalRate}%</p>
            </div>
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 opacity-50 flex-shrink-0" />
          </div>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-xs sm:text-sm mb-1">Returns</p>
              <p className="text-xl sm:text-2xl font-bold text-orange-500">{sortedStockReturns.length}</p>
            </div>
            <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500 opacity-50 flex-shrink-0" />
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-800 border border-slate-700 p-1 w-full sm:w-auto">
          <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="stock-requests" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white">
            <TrendingUp className="w-4 h-4 mr-2" />
            Stock Requests
          </TabsTrigger>
          <TabsTrigger value="stock" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            <Package className="w-4 h-4 mr-2" />
            My Stock
          </TabsTrigger>
          <TabsTrigger value="returns" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
            <RotateCcw className="w-4 h-4 mr-2" />
            Returns
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <UserPlus className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
      {/* Overview Content - Clean Summary */}
      <div className="space-y-4 sm:space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <Package className="w-5 h-5 text-cyan-500 opacity-50" />
            </div>
            <p className="text-slate-400 text-sm mb-1">My Stock</p>
            <p className="text-2xl font-bold text-cyan-400">{adminNetStock}</p>
            <p className="text-xs text-slate-500 mt-1">{adminInventory.length} products in inventory</p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <UserPlus className="w-5 h-5 text-purple-500 opacity-50" />
            </div>
            <p className="text-slate-400 text-sm mb-1">My Agents</p>
            <p className="text-2xl font-bold text-purple-400">{myAgents.length}</p>
            <p className="text-xs text-slate-500 mt-1">{myAgents.filter(a => a.is_active).length} active agents</p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-blue-500 opacity-50" />
            </div>
            <p className="text-slate-400 text-sm mb-1">This Month</p>
            <p className="text-2xl font-bold text-blue-400">{requestsThisMonth}</p>
            <p className="text-xs text-slate-500 mt-1">New requests this month</p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <RotateCcw className="w-5 h-5 text-orange-500 opacity-50" />
            </div>
            <p className="text-slate-400 text-sm mb-1">Returns</p>
            <p className="text-2xl font-bold text-orange-400">{sortedStockReturns.length}</p>
            <p className="text-xs text-slate-500 mt-1">{sortedStockReturns.filter(r => r.status === "pending").length} pending</p>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Stock Requests */}
          <Card className="bg-slate-800 border-slate-700 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                Recent Requests
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab("stock-requests")}
                className="text-xs text-slate-400 hover:text-white h-auto py-1"
              >
                View All →
              </Button>
            </div>
            <div className="space-y-2">
              {allRequests.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 py-2 px-3 bg-slate-700/50 rounded hover:bg-slate-700 transition"
                >
                  <div className="flex-1 min-w-0 w-full sm:w-auto">
                    <p className="text-sm text-white font-medium truncate">
                      {request.primary_product_name || request.items?.[0]?.product?.name || "Multiple Products"}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <p className="text-xs text-slate-400">{formatDateISO(request.requested_date || request.created_at)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                        request.status === "pending" ? "bg-amber-500/20 text-amber-400" :
                        request.status === "dispatched" ? "bg-green-500/20 text-green-400" :
                        request.status === "confirmed" ? "bg-cyan-500/20 text-cyan-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        {request.status}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-cyan-400 whitespace-nowrap">
                    {request.items?.reduce((sum, item) => sum + item.quantity, 0) || 0} units
                  </span>
                </div>
              ))}
              {allRequests.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-6">No requests yet</p>
              )}
            </div>
          </Card>

          {/* Recent Agents */}
          <Card className="bg-slate-800 border-slate-700 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
                My Agents
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab("users")}
                className="text-xs text-slate-400 hover:text-white h-auto py-1"
              >
                View All →
              </Button>
            </div>
            <div className="space-y-2">
              {myAgents.slice(0, 5).map((agent) => (
                <div
                  key={agent.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 py-2 px-3 bg-slate-700/50 rounded hover:bg-slate-700 transition"
                >
                  <div className="flex-1 min-w-0 w-full sm:w-auto">
                    <p className="text-sm text-white font-medium">{agent.name}</p>
                    <p className="text-xs text-slate-400">{agent.username}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                    agent.is_active ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"
                  }`}>
                    {agent.is_active ? "Active" : "Pending"}
                  </span>
                </div>
              ))}
              {myAgents.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-6">No agents created yet</p>
              )}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-slate-800 border-slate-700 p-4 sm:p-5">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button
              onClick={() => {
                setRequestModalType("super-admin")
                setShowRequestModal(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm w-full"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Request Stock
            </Button>
            <Button
              onClick={() => {
                setRequestModalType("admin-transfer")
                setShowRequestModal(true)
              }}
              variant="outline"
              className="border-blue-600 text-blue-400 hover:bg-blue-950 text-sm w-full"
              size="sm"
            >
            <Plus className="w-4 h-4 mr-2" />
              Transfer Stock
            </Button>
            <Button
              onClick={() => setShowStockReturnModal(true)}
              variant="outline"
              className="border-orange-600 text-orange-400 hover:bg-orange-950 text-sm w-full"
              size="sm"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Return Stock
            </Button>
            <Button
              onClick={() => setShowCreateUserModal(true)}
              variant="outline"
              className="border-purple-600 text-purple-400 hover:bg-purple-950 text-sm w-full"
              size="sm"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Agent
            </Button>
          </div>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="stock-requests" className="mt-4">
      {/* Stock Requests Content */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <h2 className="text-lg sm:text-xl font-bold text-white">Stock Requests</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              onClick={() => {
                setRequestModalType("super-admin")
                setShowRequestModal(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-base w-full sm:w-auto"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="whitespace-nowrap">Request from Super Admin</span>
            </Button>
            <Button
              onClick={() => setShowStockReturnModal(true)}
              variant="outline"
              className="border-amber-600 text-amber-400 hover:bg-amber-950 hover:text-amber-400 hover:brightness-110 text-sm sm:text-base w-full sm:w-auto"
              size="sm"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              <span className="whitespace-nowrap">Return Stock</span>
            </Button>
            <Button
              onClick={() => setShowCreateUserModal(true)}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-300 hover:brightness-110 text-sm sm:text-base w-full sm:w-auto"
              size="sm"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              <span className="whitespace-nowrap">Create Agent</span>
          </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search by User */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by user name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          {/* Status Filters  */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter("all")}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              statusFilter === "all" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            All Requests
          </button>
          <button
            onClick={() => setStatusFilter("pending")}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              statusFilter === "pending" ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Pending
          </button>
          <button
              onClick={() => setStatusFilter("dispatched")}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                statusFilter === "dispatched" ? "bg-green-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Dispatched
            </button>
            <button
              onClick={() => setStatusFilter("confirmed")}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                statusFilter === "confirmed" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Confirmed
          </button>
          <button
            onClick={() => setStatusFilter("rejected")}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              statusFilter === "rejected" ? "bg-red-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Rejected
          </button>
          </div>
        </div>

        {/* Requests Table - Mobile Card View / Desktop Table View */}
        <div className="block lg:hidden space-y-3">
          {filteredRequests.length > 0 ? (
            filteredRequests.map((request) => {
              const isMyRequest = request.requested_by_id === currentUserId && request.requested_from === "super-admin"
              
              return (
                <Card key={request.id} className="bg-slate-800 border-slate-700 p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">
                          {request.primary_product_name || request.items?.[0]?.product?.name || "Multiple Products"}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {request.requested_by_name || "Unknown"}
                        </p>
                      </div>
                      {request.status === "pending" && (
                        <span className="px-2 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full whitespace-nowrap">
                          Pending
                        </span>
                      )}
                      {request.status === "dispatched" && (
                        <span className="px-2 py-1 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/50 rounded-full whitespace-nowrap">
                          Dispatched
                        </span>
                      )}
                      {request.status === "confirmed" && (
                        <span className="px-2 py-1 text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-full whitespace-nowrap">
                          Confirmed
                        </span>
                      )}
                      {request.status === "rejected" && (
                        <span className="px-2 py-1 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/50 rounded-full whitespace-nowrap">
                          Rejected
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-slate-400 text-xs">Quantity</p>
                        <p className="text-white font-bold text-cyan-400">
                          {request.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">Current Stock</p>
                        <p className="text-slate-300 font-semibold">
                          {(() => {
                            const firstItem = request.items?.[0]
                            if (!firstItem) return "N/A"
                            const product = firstItem.product || requestProducts[firstItem.product_id]
                            if (!product) return "N/A"
                            const stock = product.total_stock ?? product.central_stock ?? product.quantity ?? 0
                            return stock
                          })()}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-slate-400 text-xs">Date</p>
                        <p className="text-slate-300">
                          {formatDateISO(request.requested_date || request.created_at)}
                        </p>
                      </div>
        </div>

                    <div className="pt-2 border-t border-slate-700">
                      {isMyRequest && request.status === "dispatched" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request)
                            setShowConfirmationModal(true)
                          }}
                          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white text-xs"
                        >
                          Confirm Receipt
                        </Button>
                      )}
                      {request.status === "rejected" && request.rejection_reason && (
                        <div className="flex items-start gap-2 p-2 bg-red-900/20 rounded">
                          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-red-300">{request.rejection_reason}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })
          ) : (
            <Card className="bg-slate-800 border-slate-700 p-8 text-center">
              <p className="text-slate-400">No requests found</p>
            </Card>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Product</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Quantity</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Requested By</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Date</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Status</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredRequests.length > 0 ? (
                  filteredRequests.map((request) => {
                    const isMyRequest = request.requested_by_id === currentUserId && request.requested_from === "super-admin"
                    
                    return (
                    <tr key={request.id} className="hover:bg-slate-700/30 transition">
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-white font-medium text-sm">
                          {request.primary_product_name || request.items?.[0]?.product?.name || "Multiple Products"}
                        </td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-white font-bold text-cyan-400 text-sm">
                          {request.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}
                        </td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-300 text-sm">
                          {request.requested_by_name || "Unknown"}
                        </td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-400 text-sm">
                          {formatDateISO(request.requested_date || request.created_at)}
                      </td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4">
                        {request.status === "pending" && (
                          <span className="px-3 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full">
                            Pending
                          </span>
                        )}
                          {request.status === "dispatched" && (
                          <span className="px-3 py-1 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/50 rounded-full">
                              Dispatched
                            </span>
                          )}
                          {request.status === "confirmed" && (
                            <span className="px-3 py-1 text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-full">
                              Confirmed
                          </span>
                        )}
                        {request.status === "rejected" && (
                          <span className="px-3 py-1 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/50 rounded-full">
                            Rejected
                          </span>
                        )}
                      </td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4">
                          <div className="flex flex-col sm:flex-row gap-2">
                            {/* Show Confirm Receipt button for my requests to super-admin that are dispatched */}
                            {isMyRequest && request.status === "dispatched" && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedRequest(request)
                                  setShowConfirmationModal(true)
                                }}
                                className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs"
                              >
                                Confirm Receipt
                              </Button>
                            )}
                            {request.status === "rejected" && request.rejection_reason && (
                              <div className="flex items-start gap-2 max-w-xs">
                            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <span className="text-xs text-red-300">{request.rejection_reason}</span>
                              </div>
                            )}
                          </div>
                      </td>
                    </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      No requests found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Request Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-slate-800 border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Recent Requests</h3>
            <div className="space-y-2">
              {allRequests.slice(0, 3).map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-b-0"
                >
                  <div>
                    <p className="text-sm text-white font-medium">
                      {request.primary_product_name || request.items?.[0]?.product?.name || "Multiple Products"}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateISO(request.requested_date || request.created_at)}</p>
                  </div>
                  <span className="text-sm font-bold text-cyan-400">
                    {request.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}
                  </span>
                </div>
              ))}
              {allRequests.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-4">No requests yet</p>
              )}
            </div>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Request Status Distribution</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">Pending</span>
                  <span className="text-xs font-bold text-amber-400">{pending}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full"
                    style={{ width: `${allRequests.length > 0 ? (pending / allRequests.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">Approved</span>
                  <span className="text-xs font-bold text-green-400">{approved}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${allRequests.length > 0 ? (approved / allRequests.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">Rejected</span>
                  <span className="text-xs font-bold text-red-400">{rejected}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{ width: `${allRequests.length > 0 ? (rejected / allRequests.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          {/* My Stock Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-green-500" />
                My Stock Inventory
              </h2>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by product name or model..."
                value={inventorySearchQuery}
                onChange={(e) => setInventorySearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
              />
            </div>

            {loadingInventory ? (
              <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-500 mx-auto mb-4" />
                <p className="text-slate-400">Loading inventory...</p>
              </Card>
            ) : (
              <>
                {/* Filtered inventory */}
                {(() => {
                  const filtered = adminInventory.filter((item) => {
                    if (!inventorySearchQuery) return true
                    const product = item.product || requestProducts[item.product_id]
                    if (!product) return false
                    const searchLower = inventorySearchQuery.toLowerCase()
                    return (
                      product.name.toLowerCase().includes(searchLower) ||
                      (product.model && product.model.toLowerCase().includes(searchLower)) ||
                      (product.category && product.category.toLowerCase().includes(searchLower))
                    )
                  })

                  return filtered.length > 0 ? (
                    <>
                      {/* Mobile Card View */}
                      <div className="block lg:hidden space-y-3">
                        {filtered.map((item) => {
                          const product = item.product || requestProducts[item.product_id]
                          const productName = product?.name || "Unknown Product"
                          const productModel = product?.model || ""
                          const productCategory = product?.category || ""
                          const productUnit = getProductUnitLabel(product)

                          return (
                            <Card
                              key={item.id}
                              className="bg-slate-800 border-slate-700 p-4"
                            >
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold text-sm">
                                      {productName}
                                    </p>
                                    {productModel && (
                                      <p className="text-xs text-slate-400 mt-1">
                                        {productModel}
                                      </p>
                                    )}
                                    {productCategory && (
                                      <p className="text-xs text-slate-500 mt-1">
                                        {productCategory}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-2xl font-bold text-green-400">
                                      {item.quantity}
                                    </p>
                                    <p className="text-xs text-slate-400">{productUnit}</p>
                                  </div>
                                </div>
                                <div className="pt-2 border-t border-slate-700 flex items-center justify-between">
                                  <p className="text-xs text-slate-400">
                                    Last updated: {formatDateISO(item.updated_at)}
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSerialNumbersProduct({ id: item.product_id, name: productName })
                                      setShowSerialNumbersModal(true)
                                    }}
                                    className="border-cyan-600 text-cyan-400 hover:bg-cyan-950 text-xs"
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    View Serials
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
                                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                  Product
                                </th>
                                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                  Model
                                </th>
                                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                  Category
                                </th>
                                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                  Quantity
                                </th>
                                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                  Last Updated
                                </th>
                                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                              {filtered.map((item) => {
                                const product = item.product || requestProducts[item.product_id]
                                const productName = product?.name || "Unknown Product"
                                const productModel = product?.model || ""
                                const productCategory = product?.category || ""
                                const productUnit = getProductUnitLabel(product)

                                return (
                                  <tr
                                    key={item.id}
                                    className="hover:bg-slate-700/30 transition"
                                  >
                                    <td className="px-6 py-4 text-white font-medium">
                                      {productName}
                                    </td>
                                    <td className="px-6 py-4 text-slate-300">
                                      {productModel || "N/A"}
                                    </td>
                                    <td className="px-6 py-4 text-slate-400">
                                      {productCategory || "N/A"}
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="text-green-400 font-bold text-lg">
                                        {item.quantity}
                                      </span>
                                      <span className="text-slate-400 text-sm ml-1">{productUnit}</span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 text-sm">
                                      {formatDateISO(item.updated_at)}
                                    </td>
                                    <td className="px-6 py-4">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSerialNumbersProduct({ id: item.product_id, name: productName })
                                          setShowSerialNumbersModal(true)
                                        }}
                                        className="border-cyan-600 text-cyan-400 hover:bg-cyan-950 text-xs"
                                      >
                                        <Eye className="w-3 h-3 mr-1" />
                                        View Serials
                                      </Button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Summary Card */}
                      <Card className="bg-green-950/30 border-green-700 border p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-slate-400 text-sm mb-1">Total Stock Value</p>
                            <p className="text-2xl font-bold text-green-400">
                              {filtered.reduce((sum, item) => sum + item.quantity, 0)}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {filtered.length} {filtered.length === 1 ? "product" : "products"}
                            </p>
                          </div>
                          <Package className="w-8 h-8 text-green-500 opacity-50 flex-shrink-0" />
                        </div>
                      </Card>
                    </>
                  ) : (
                    <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                      <Package className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                      <p className="text-slate-400 text-lg font-semibold mb-2">
                        {inventorySearchQuery
                          ? "No products found"
                          : "No stock available"}
                      </p>
                      <p className="text-slate-500 text-sm">
                        {inventorySearchQuery
                          ? "Try adjusting your search query"
                          : "Your inventory will appear here once you receive stock"}
                      </p>
                    </Card>
                  )
                })()}
              </>
            )}
      </div>
        </TabsContent>

        <TabsContent value="returns" className="mt-4">
      {/* Stock Returns Section */}
      {sortedStockReturns.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-orange-500" />
              Stock Returns from Agents
            </h2>
          </div>

          {/* Search for Stock Returns */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by product name, agent name, or reason..."
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
              const agentName = ret.admin?.name || "Unknown Agent"
              return (
                <Card key={ret.id} className="bg-slate-800 border-slate-700 p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{productName} {productModel && `- ${productModel}`}</p>
                        <p className="text-xs text-slate-400 mt-1">From: {agentName}</p>
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
                        className="w-full bg-green-600 hover:bg-green-700 text-white text-xs"
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
                    const agentName = ret.admin?.name || "Unknown Agent"
                    return (
                      <tr key={ret.id} className="hover:bg-slate-700/30 transition">
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-white font-medium text-sm">
                          {productName} {productModel && `- ${productModel}`}
                        </td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-white font-bold text-cyan-400 text-sm">{ret.quantity}</td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-300 text-sm">{agentName}</td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-400 text-sm max-w-xs truncate">{ret.reason || "N/A"}</td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-400 text-sm">
                          {formatDateISO(ret.created_at)}
                        </td>
                        <td className="px-4 xl:px-6 py-3 xl:py-4">
                          <Button
                            size="sm"
                            onClick={() => handleProcessReturn(ret.id)}
                            disabled={processingReturnIds.has(ret.id)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs"
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
          <p className="text-slate-400 text-lg font-semibold mb-2">No Stock Returns</p>
          <p className="text-slate-500 text-sm">There are no pending stock returns from agents at the moment.</p>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-500" />
                User Management
              </h2>
              <Button
                onClick={() => setShowCreateUserModal(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Create Agent
              </Button>
            </div>

            <Card className="bg-slate-800 border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Create New Agent User</h3>
              <p className="text-slate-400 mb-4">
                Create a new agent user. The agent will need approval from the super-admin before they can login.
              </p>
              <Button
                onClick={() => setShowCreateUserModal(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Create Agent
              </Button>
            </Card>

            {/* Agents List Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-purple-500" />
                  My Agents ({myAgents.length})
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
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {loadingAgents ? (
                <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-4" />
                  <p className="text-slate-400">Loading agents...</p>
                </Card>
              ) : (
                <>
                  {(() => {
                    const filteredAgents = myAgents.filter((agent) => {
                      if (!agentsSearchQuery) return true
                      const searchLower = agentsSearchQuery.toLowerCase()
                      return (
                        agent.name.toLowerCase().includes(searchLower) ||
                        agent.username.toLowerCase().includes(searchLower)
                      )
                    })

                    return filteredAgents.length > 0 ? (
                      <>
                        {/* Mobile Card View */}
                        <div className="block lg:hidden space-y-3">
                          {filteredAgents.map((agent) => (
                            <Card key={agent.id} className="bg-slate-800 border-slate-700 p-4">
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold text-sm">{agent.name}</p>
                                    <p className="text-xs text-slate-400 mt-1">{agent.username}</p>
                                  </div>
                                  <span
                                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                      agent.is_active
                                        ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                        : "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                    }`}
                                  >
                                    {agent.is_active ? "Active" : "Pending"}
                                  </span>
                                </div>
                                <div className="pt-2 border-t border-slate-700">
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <p className="text-slate-400">Role</p>
                                      <p className="text-slate-300 font-medium">{agent.role}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400">Created</p>
                                      <p className="text-slate-300">
                                        {formatDateISO(agent.created_at)}
                                      </p>
                                    </div>
                                  </div>
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
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-700">
                                {filteredAgents.map((agent) => (
                                  <tr
                                    key={agent.id}
                                    className="hover:bg-slate-700/30 transition"
                                  >
                                    <td className="px-6 py-4 text-white font-medium">
                                      {agent.name}
                                    </td>
                                    <td className="px-6 py-4 text-slate-300">{agent.username}</td>
                                    <td className="px-6 py-4 text-slate-400 capitalize">
                                      {agent.role}
                                    </td>
                                    <td className="px-6 py-4">
                                      <span
                                        className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                          agent.is_active
                                            ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                            : "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                        }`}
                                      >
                                        {agent.is_active ? "Active" : "Pending Approval"}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 text-sm">
                                      {formatDateISO(agent.created_at)}
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
                        <UserPlus className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                        <p className="text-slate-400 text-lg font-semibold mb-2">
                          {agentsSearchQuery ? "No agents found" : "No agents created yet"}
                        </p>
                        <p className="text-slate-500 text-sm">
                          {agentsSearchQuery
                            ? "Try adjusting your search query"
                            : "Create your first agent using the button above"}
                        </p>
                      </Card>
                    )
                  })()}
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {showRequestModal && requestModalType && (
        <AdminStockRequestModal
          requestType={requestModalType}
          onClose={() => {
            setShowRequestModal(false)
            setRequestModalType(null)
          }}
          onSuccess={handleCreateRequest}
        />
      )}


      {showConfirmationModal && selectedRequest && (
        <StockConfirmationModal
          request={selectedRequest}
          onConfirm={handleConfirmReceipt}
          onClose={() => {
            setShowConfirmationModal(false)
            setSelectedRequest(null)
          }}
        />
      )}
      {showStockReturnModal && (
        <StockReturnModal
          userRole="admin"
          onClose={() => setShowStockReturnModal(false)}
          onSuccess={async () => {
            setShowStockReturnModal(false)
          }}
        />
      )}
      {showCreateUserModal && (
        <CreateUserModal
          creatorRole="admin"
          onClose={() => setShowCreateUserModal(false)}
          onSuccess={async () => {
            setShowCreateUserModal(false)
            // Reload agents list after creating a new agent
            await loadMyAgents()
          }}
        />
      )}
      {showSerialNumbersModal && serialNumbersProduct && (
        <SerialNumbersViewModal
          productId={serialNumbersProduct.id}
          productName={serialNumbersProduct.name}
          adminId={currentUserId ?? undefined}
          onClose={() => {
            setShowSerialNumbersModal(false)
            setSerialNumbersProduct(null)
          }}
        />
      )}
    </div>
  )
}
