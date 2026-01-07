"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AlertCircle, Loader2, User, Lock, Sparkles, Eye, EyeOff } from "lucide-react"
import { authApi } from "@/lib/api"
import { authService } from "@/lib/auth"
import type { User as UserType } from "@/lib/auth"
import ForgotPasswordModal from "@/components/modals/forgot-password-modal"
import ResetPasswordModal from "@/components/modals/reset-password-modal"

interface LoginPageProps {
  onLogin: (user: UserType, token: string) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [logoTransform, setLogoTransform] = useState({ x: 0, y: 0 })
  const [cardTransform, setCardTransform] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3050/api"
    console.log("API URL:", apiUrl)
  }, [])

  // Cursor tracking effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e
      setMousePosition({ x: clientX, y: clientY })

      // Get center of viewport
      const centerX = window.innerWidth / 2
      const centerY = window.innerHeight / 2

      // Calculate distance from center
      const deltaX = (clientX - centerX) / window.innerWidth
      const deltaY = (clientY - centerY) / window.innerHeight

      // Apply subtle transform to logo (magnetic effect)
      setLogoTransform({
        x: deltaX * 10, // Max 10px movement
        y: deltaY * 10
      })

      // Apply subtle transform to card (tilt effect)
      setCardTransform({
        x: deltaX * 8, // Max 8px movement
        y: deltaY * 8
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      if (!username.trim() || !password.trim()) {
        setError("Please enter both username and password")
        setIsLoading(false)
        return
      }

      const response = await authApi.login({ username: username.trim(), password })

      // Store token and user data
      authService.setToken(response.token)
      authService.setUser(response.user)

      // Call onLogin callback with user and token
      onLogin(response.user, response.token)
    } catch (err: any) {
      console.error("Login error details:", {
        error: err,
        name: err?.name,
        message: err?.message,
        status: err?.status,
        data: err?.data,
        stack: err?.stack
      })

      let errorMessage = "Login failed. Please check your credentials."

      // Check if it's an ApiClientError by checking for status property
      if (err && typeof err.status === 'number') {
        // This is an ApiClientError
        // Ensure apiError is always a string
        const apiErrorRaw = err.data?.error || err.message || ""
        const apiError = typeof apiErrorRaw === 'string' ? apiErrorRaw : JSON.stringify(apiErrorRaw)
        const apiErrorLower = apiError.toLowerCase()
        
        if (err.status === 400) {
          // Validation errors - show detailed message
          const validationErrors = err.data?.errors || err.data?.error
          if (Array.isArray(validationErrors)) {
            errorMessage = validationErrors.join(", ")
          } else if (typeof validationErrors === 'object' && validationErrors !== null) {
            // Field-specific validation errors
            const fieldErrors = Object.entries(validationErrors)
              .map(([field, message]) => `${field}: ${message}`)
              .join(", ")
            errorMessage = fieldErrors || apiError || "Validation error. Please check your input."
          } else {
            errorMessage = apiError || "Validation error. Please check your input."
          }
        } else if (err.status === 401) {
          // Handle specific error messages
          if (apiErrorLower.includes("inactive") || apiErrorLower.includes("account is inactive")) {
            errorMessage = "Your account is inactive and needs approval. Please contact your administrator or account manager to activate your account."
          } else {
            errorMessage = apiError || "Invalid username or password."
          }
        } else if (err.status === 0 || err.message?.includes("Network error") || err.message?.includes("Failed to fetch")) {
          errorMessage = "Unable to connect to server. Please check if the API server is running at " + (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3050/api")
        } else {
          // Handle other error statuses
          if (apiErrorLower.includes("inactive") || apiErrorLower.includes("account is inactive")) {
            errorMessage = "Your account is inactive and needs approval. Please contact your administrator or account manager to activate your account."
          } else {
            errorMessage = apiError || err.message || `Server error (${err.status}). Please try again.`
          }
        }
      } else if (err instanceof Error) {
        // Standard Error object
        if (err.message.includes("fetch") || err.message.includes("Network") || err.message.includes("Failed to fetch")) {
          errorMessage = "Network error: Unable to connect to the server. Please check if the API server is running."
        } else {
          errorMessage = err.message || errorMessage
        }
      } else if (err?.data?.error) {
        const apiError = err.data.error
        if (apiError.toLowerCase().includes("inactive") || apiError.toLowerCase().includes("account is inactive")) {
          errorMessage = "Your account is inactive and needs approval. Please contact your administrator or account manager to activate your account."
        } else {
          errorMessage = apiError
        }
      } else if (err?.error) {
        const apiError = err.error
        if (apiError.toLowerCase().includes("inactive") || apiError.toLowerCase().includes("account is inactive")) {
          errorMessage = "Your account is inactive and needs approval. Please contact your administrator or account manager to activate your account."
        } else {
          errorMessage = apiError
        }
      } else if (err?.message) {
        const apiError = err.message
        if (apiError.toLowerCase().includes("inactive") || apiError.toLowerCase().includes("account is inactive")) {
          errorMessage = "Your account is inactive and needs approval. Please contact your administrator or account manager to activate your account."
        } else {
          errorMessage = apiError
        }
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-black to-slate-900 flex items-center justify-center p-3 sm:p-4 relative overflow-hidden">
      {/* Custom Cursor Effect - Hidden on mobile */}
      <div
        className="hidden md:block fixed pointer-events-none z-50 mix-blend-difference transition-all duration-300 ease-out"
        style={{
          left: `${mousePosition.x}px`,
          top: `${mousePosition.y}px`,
          transform: 'translate(-50%, -50%)'
        }}
      >
        <div className="w-6 h-6 rounded-full bg-blue-400 blur-md opacity-50"></div>
        <div className="absolute inset-0 w-3 h-3 rounded-full bg-cyan-400 blur-sm opacity-75"></div>
      </div>

      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradient Orbs - Follow cursor */}
        <div
          className="absolute w-96 h-96 bg-blue-500/10 rounded-full blur-3xl transition-all duration-1000 ease-out"
          style={{
            left: `${mousePosition.x - 192}px`,
            top: `${mousePosition.y - 192}px`,
            transform: 'translate(-50%, -50%)'
          }}
        ></div>
        <div
          className="absolute w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl transition-all duration-1500 ease-out delay-300"
          style={{
            left: `${mousePosition.x - 192}px`,
            top: `${mousePosition.y - 192}px`,
            transform: 'translate(-50%, -50%) scale(1.2)'
          }}
        ></div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>

        {/* Sparkle Effects */}
        <div className="absolute top-20 left-20 w-2 h-2 bg-blue-400 rounded-full animate-ping opacity-75"></div>
        <div className="absolute top-40 right-32 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping opacity-75 delay-500"></div>
        <div className="absolute bottom-32 left-40 w-2 h-2 bg-blue-400 rounded-full animate-ping opacity-75 delay-1000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo Section with Enhanced Design */}
        <div className="text-center mb-4 sm:mb-8 animate-fade-in">
          <div
            className="inline-flex items-center justify-center mb-3 sm:mb-6 relative md:transition-transform md:duration-300 md:ease-out"
            style={{
              transform: typeof window !== 'undefined' && window.innerWidth >= 768 ? `translate(${logoTransform.x}px, ${logoTransform.y}px)` : 'none'
            }}
          >
            {/* Logo Image */}
            <div className="relative group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl sm:rounded-2xl blur-xl animate-pulse group-hover:scale-110 transition-transform duration-300"></div>
              <div className="relative bg-white/5 backdrop-blur-sm p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-white/10 shadow-2xl group-hover:border-blue-500/50 transition-all duration-300 group-hover:shadow-blue-500/20">
                <img
                  src="https://res.cloudinary.com/du0cxgoic/image/upload/v1753789133/logo_Chairbord_Solar_1_1_avkjps.png"
                  alt="Chairbord Solar Logo"
                  className="h-12 sm:h-16 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            </div>
          </div>

          <p className="text-slate-400 text-xs sm:text-sm md:text-base flex items-center justify-center gap-1 sm:gap-2 px-2">
            <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" />
            <span className="hidden xs:inline">Solar Inventory Management System</span>
            <span className="xs:hidden">Solar Inventory</span>
            <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-cyan-400" />
          </p>
        </div>

        {/* Login Card with Enhanced Design */}
        <Card
          className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 shadow-2xl relative overflow-hidden animate-fade-in-up md:transition-transform md:duration-300 md:ease-out"
          style={{
            transform: typeof window !== 'undefined' && window.innerWidth >= 768 ? `translate(${cardTransform.x}px, ${cardTransform.y}px) rotateX(${cardTransform.y * 0.1}deg) rotateY(${cardTransform.x * 0.1}deg)` : 'none'
          }}
        >
          {/* Card Glow Effect - Follows cursor - Hidden on mobile */}
          <div
            className="hidden md:block absolute inset-0 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-blue-500/10 transition-opacity duration-500 pointer-events-none"
            style={{
              opacity: 0.5,
              background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.15), rgba(6, 182, 212, 0.1), transparent 40%)`
            }}
          ></div>

          {/* Cursor glow spot - Hidden on mobile */}
          <div
            className="hidden md:block absolute w-64 h-64 rounded-full blur-3xl pointer-events-none transition-all duration-700 ease-out opacity-30"
            style={{
              left: `${mousePosition.x - 128}px`,
              top: `${mousePosition.y - 128}px`,
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.4), rgba(6, 182, 212, 0.3), transparent 70%)'
            }}
          ></div>

          {/* Card Content */}
          <div className="relative p-5 sm:p-8 md:p-10">
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1 sm:mb-2">Welcome Back</h2>
              <p className="text-slate-400 text-xs sm:text-sm">Sign in to access your dashboard</p>
            </div>

            {error && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-900/20 border border-red-700/50 rounded-lg flex items-start gap-2 sm:gap-3 animate-shake">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-red-400 flex-1">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
              {/* Username Input with Icon */}
              <div className="space-y-1.5 sm:space-y-2 group/input">
                <label htmlFor="username" className="block text-xs sm:text-sm font-medium text-slate-300">
                  Username
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                    <User className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-focus-within:text-blue-400 transition-all duration-300 group-hover:scale-110" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    disabled={isLoading}
                    className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 text-sm sm:text-base bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:border-slate-600 hover:bg-slate-800/70"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {/* Password Input with Icon */}
              <div className="space-y-1.5 sm:space-y-2 group/input">
                <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-slate-300">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-focus-within:text-blue-400 transition-all duration-300 group-hover:scale-110" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isLoading}
                    className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 text-sm sm:text-base bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:border-slate-600 hover:bg-slate-800/70"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </button>
                </div>
              </div>

              {/* Forgot Password Link */}
              <div className="flex items-center justify-between pt-1">
                <div></div>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  disabled={isLoading}
                  className="text-xs sm:text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Login Button */}
              <Button
                type="submit"
                disabled={!username.trim() || !password.trim() || isLoading}
                className="w-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-600 hover:from-blue-700 hover:via-blue-600 hover:to-cyan-700 text-white font-semibold py-2.5 sm:py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 text-sm sm:text-base relative overflow-hidden group/btn"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                    <span className="text-sm sm:text-base">Logging in...</span>
                  </>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Sign In
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                )}
              </Button>
            </form>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center mt-4 sm:mt-6 animate-fade-in">
          <p className="text-[10px] xs:text-xs text-slate-500">
            © 2024 Chairbord Solar. All rights reserved.
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <ForgotPasswordModal
          onClose={() => {
            setShowForgotPassword(false)
            setResetToken(null)
          }}
          onSuccess={(token: string | null) => {
            if (token) {
              setResetToken(token)
              setShowForgotPassword(false)
              setShowResetPassword(true)
            } else {
              setShowForgotPassword(false)
            }
          }}
        />
      )}

      {/* Reset Password Modal */}
      {showResetPassword && (
        <ResetPasswordModal
          resetToken={resetToken || undefined}
          onClose={() => {
            setShowResetPassword(false)
            setResetToken(null)
          }}
          onSuccess={() => {
            setShowResetPassword(false)
            setResetToken(null)
          }}
        />
      )}

      {/* Custom CSS for animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }

        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }

        .delay-500 {
          animation-delay: 0.5s;
        }

        .delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
    </div>
  )
}
