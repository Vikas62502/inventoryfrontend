const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3050/api"
console.log("Environment NEXT_PUBLIC_API_URL:", process.env.NEXT_PUBLIC_API_URL)
console.log("API_BASE_URL:", API_BASE_URL)

export interface ApiError {
  error: string
  status?: number
}

export class ApiClientError extends Error {
  status: number
  data?: ApiError

  constructor(message: string, status: number, data?: ApiError) {
    super(message)
    this.name = "ApiClientError"
    this.status = status
    this.data = data
  }
}

class ApiClient {
  private baseUrl: string
  private getToken: () => string | null

  constructor() {
    this.baseUrl = API_BASE_URL
    this.getToken = () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("auth_token")
      }
      return null
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken()
    const url = `${this.baseUrl}${endpoint}`

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    if (token) {
      const existingHeaders = options.headers as Record<string, string> | undefined
      if (!existingHeaders?.Authorization) {
        headers.Authorization = `Bearer ${token}`
      }
    }

    const config: RequestInit = {
      ...options,
      headers,
    }

    try {
      const response = await fetch(url, config)

      // Handle non-JSON responses (like file uploads)
      const contentType = response.headers.get("content-type")
      if (!contentType?.includes("application/json")) {
        if (!response.ok) {
          throw new ApiClientError(
            `HTTP error! status: ${response.status}`,
            response.status
          )
        }
        return response as unknown as T
      }

      let data
      try {
        const text = await response.text()
        data = text ? JSON.parse(text) : {}
      } catch (parseError) {
        // If JSON parsing fails, create a generic error
        throw new ApiClientError(
          `Invalid response from server (status: ${response.status})`,
          response.status
        )
      }

      if (!response.ok) {
        // Handle 401 Unauthorized - clear token and redirect to login
        if (response.status === 401) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("auth_token")
            localStorage.removeItem("auth_user")
            // Redirect to login will be handled by the app state
          }
        }

        // Ensure error message is always a string
        let errorMessage = `HTTP error! status: ${response.status}`
        if (data.error) {
          errorMessage = typeof data.error === 'string' 
            ? data.error 
            : (data.error.message || JSON.stringify(data.error))
        }

        throw new ApiClientError(
          errorMessage,
          response.status,
          data
        )
      }

      return data
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new ApiClientError(
          "Network error: Unable to connect to the server. Please check if the API server is running.",
          0
        )
      }

      throw new ApiClientError(
        error instanceof Error ? error.message : "Network error occurred",
        0
      )
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const queryString = params
      ? "?" + new URLSearchParams(params).toString()
      : ""
    return this.request<T>(`${endpoint}${queryString}`, { method: "GET" })
  }

  async post<T>(endpoint: string, data?: unknown, isFormData = false): Promise<T> {
    if (isFormData) {
      // Handle FormData separately to avoid Content-Type header issues
      const token = this.getToken()
      const url = `${this.baseUrl}${endpoint}`

      const headers: HeadersInit = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      // Don't set Content-Type for FormData - browser will set it with boundary

      const config: RequestInit = {
        method: "POST",
        headers,
        body: data as FormData,
      }

      try {
        const response = await fetch(url, config)
        const contentType = response.headers.get("content-type")

        if (!contentType?.includes("application/json")) {
          if (!response.ok) {
            throw new ApiClientError(
              `HTTP error! status: ${response.status}`,
              response.status
            )
          }
          return response as unknown as T
        }

        const responseData = await response.json()

        if (!response.ok) {
          if (response.status === 401) {
            if (typeof window !== "undefined") {
              localStorage.removeItem("auth_token")
              localStorage.removeItem("auth_user")
            }
          }
          // Ensure error message is always a string
          let errorMessage = `HTTP error! status: ${response.status}`
          if (responseData.error) {
            errorMessage = typeof responseData.error === 'string' 
              ? responseData.error 
              : (responseData.error.message || JSON.stringify(responseData.error))
          }
          throw new ApiClientError(
            errorMessage,
            response.status,
            responseData
          )
        }

        return responseData
      } catch (error) {
        if (error instanceof ApiClientError) {
          throw error
        }
        throw new ApiClientError(
          error instanceof Error ? error.message : "Network error occurred",
          0
        )
      }
    }

    // Regular JSON request
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: unknown, isFormData = false): Promise<T> {
    if (isFormData) {
      // Handle FormData separately to avoid Content-Type header issues
      const token = this.getToken()
      const url = `${this.baseUrl}${endpoint}`

      const headers: HeadersInit = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      // Don't set Content-Type for FormData - browser will set it with boundary

      const config: RequestInit = {
        method: "PUT",
        headers,
        body: data as FormData,
      }

      try {
        const response = await fetch(url, config)
        const contentType = response.headers.get("content-type")

        if (!contentType?.includes("application/json")) {
          if (!response.ok) {
            throw new ApiClientError(
              `HTTP error! status: ${response.status}`,
              response.status
            )
          }
          return response as unknown as T
        }

        const responseData = await response.json()

        if (!response.ok) {
          if (response.status === 401) {
            if (typeof window !== "undefined") {
              localStorage.removeItem("auth_token")
              localStorage.removeItem("auth_user")
            }
          }
          // Ensure error message is always a string
          let errorMessage = `HTTP error! status: ${response.status}`
          if (responseData.error) {
            errorMessage = typeof responseData.error === 'string' 
              ? responseData.error 
              : (responseData.error.message || JSON.stringify(responseData.error))
          }
          throw new ApiClientError(
            errorMessage,
            response.status,
            responseData
          )
        }

        return responseData
      } catch (error) {
        if (error instanceof ApiClientError) {
          throw error
        }
        throw new ApiClientError(
          error instanceof Error ? error.message : "Network error occurred",
          0
        )
      }
    }

    // Regular JSON request
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" })
  }
}

export const apiClient = new ApiClient()

