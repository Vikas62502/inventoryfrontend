export interface User {
  id: string
  username: string
  name: string
  role: "super-admin" | "super-admin-manager" | "admin" | "agent" | "account"  // Note: "super-admin-manager" requires backend support
  is_active?: boolean
  created_at?: string
  updated_at?: string
  created_by_id?: string  // ID of the admin who created this agent
  admin_id?: string  // For agents: the admin ID they belong to
}

export interface LoginResponse {
  message: string
  token: string
  user: User
}

export interface LoginCredentials {
  username: string
  password: string
}

const AUTH_TOKEN_KEY = "auth_token"
const AUTH_USER_KEY = "auth_user"

export const authService = {
  /**
   * Store authentication token
   */
  setToken(token: string): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
    }
  },

  /**
   * Get authentication token
   */
  getToken(): string | null {
    if (typeof window !== "undefined") {
      return localStorage.getItem(AUTH_TOKEN_KEY)
    }
    return null
  },

  /**
   * Store user data
   */
  setUser(user: User): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    }
  },

  /**
   * Get stored user data
   */
  getUser(): User | null {
    if (typeof window !== "undefined") {
      const userStr = localStorage.getItem(AUTH_USER_KEY)
      if (userStr) {
        try {
          return JSON.parse(userStr) as User
        } catch {
          return null
        }
      }
    }
    return null
  },

  /**
   * Clear authentication data
   */
  clearAuth(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_USER_KEY)
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null
  },
}

