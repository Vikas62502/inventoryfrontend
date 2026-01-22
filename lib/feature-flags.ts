/**
 * Feature Flags Configuration
 * 
 * Use these flags to enable/disable features based on backend readiness
 */

export const FEATURE_FLAGS = {
  /**
   * Product Manager Role Feature
   * 
   * ✅ ENABLED - Backend supports the "super-admin-manager" role
   * 
   * Backend Requirements (ALL COMPLETE):
   * - ✅ User role enum includes "super-admin-manager"
   * - ✅ POST /api/users accepts "super-admin-manager" role
   * - ✅ GET /api/users?role=super-admin-manager endpoint works
   * - ✅ Product endpoints (POST, PUT, DELETE) allow "super-admin-manager" role
   * 
   * @default true - ENABLED (Backend is ready)
   */
  ENABLE_PRODUCT_MANAGER_ROLE: true,

  /**
   * Other feature flags can be added here
   */
} as const

export type FeatureFlags = typeof FEATURE_FLAGS
