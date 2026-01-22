"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import LoginPage from "@/components/auth/login-page"
import SuperAdminDashboard from "@/components/dashboards/super-admin-dashboard"
import SuperAdminManagerDashboard from "@/components/dashboards/super-admin-manager-dashboard"
import AdminDashboard from "@/components/dashboards/admin-dashboard"
import AgentDashboard from "@/components/dashboards/agent-dashboard"
import AccountDashboard from "@/components/dashboards/account-dashboard"
import { authService } from "@/lib/auth"
import { authApi } from "@/lib/api"
import { FEATURE_FLAGS } from "@/lib/feature-flags"
import type { User } from "@/lib/auth"

export default function Home() {
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const token = authService.getToken()
        const storedUser = authService.getUser()
        
        if (token && storedUser) {
          // Verify token is still valid by fetching current user
          try {
            const currentUser = await authApi.getCurrentUser()
            setLoggedInUser(currentUser)
            authService.setUser(currentUser) // Update stored user data
          } catch (error) {
            // Token is invalid, clear auth
            authService.clearAuth()
            setLoggedInUser(null)
          }
        } else {
          setLoggedInUser(null)
        }
      } catch (error) {
        authService.clearAuth()
        setLoggedInUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const handleLogout = () => {
    authService.clearAuth()
    setLoggedInUser(null)
  }

  const handleLogin = (user: User, token: string) => {
    setLoggedInUser(user)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!loggedInUser) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between min-h-[56px] sm:min-h-[64px] px-2 sm:px-4 md:px-6 max-w-7xl mx-auto py-1.5 sm:py-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Logo */}
            <div className="relative flex-shrink-0">
              <img 
                src="https://res.cloudinary.com/du0cxgoic/image/upload/v1753789133/logo_Chairbord_Solar_1_1_avkjps.png" 
                alt="Chairbord Solar Logo" 
                className="h-8 w-auto sm:h-10 md:h-12 object-contain"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 flex-shrink-0">
            {/* User info - Hidden on very small screens to save space */}
            <div className="text-right hidden sm:block min-w-0">
              <p className="text-[10px] sm:text-xs md:text-sm font-medium text-white truncate max-w-[50px] sm:max-w-[100px] md:max-w-[140px] lg:max-w-none">{loggedInUser.name}</p>
              <p className="text-[9px] sm:text-[10px] md:text-xs text-slate-400 capitalize hidden md:block">{loggedInUser.role.replace("-", " ")}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-slate-300 hover:brightness-110 bg-transparent text-[10px] sm:text-xs md:text-sm h-7 sm:h-8 md:h-9 px-2 sm:px-3 md:px-4 whitespace-nowrap flex-shrink-0"
            >
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="w-full overflow-x-hidden">
        {loggedInUser.role === "super-admin" && <SuperAdminDashboard userName={loggedInUser.name} />}
        {FEATURE_FLAGS.ENABLE_PRODUCT_MANAGER_ROLE && loggedInUser.role === "super-admin-manager" && <SuperAdminManagerDashboard userName={loggedInUser.name} />}
        {loggedInUser.role === "admin" && <AdminDashboard userName={loggedInUser.name} />}
        {loggedInUser.role === "account" && <AccountDashboard userName={loggedInUser.name} />}
        {loggedInUser.role === "agent" && <AgentDashboard userName={loggedInUser.name} />}
      </main>
    </div>
  )
}
