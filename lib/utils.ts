import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format image URL from API response
 * Handles both relative paths (for local images) and API-uploaded images
 */
export function formatImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) {
    return '/placeholder.jpg'
  }

  // If it's already a full URL or starts with http/https, return as is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl
  }

  // If it starts with /, it's a local path
  if (imageUrl.startsWith('/')) {
    return imageUrl
  }

  // Otherwise, it's likely an API-uploaded image filename
  // Construct the full URL using the API base URL
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3050/api'
  const uploadsBaseUrl = apiBaseUrl.replace('/api', '/uploads')
  return `${uploadsBaseUrl}/${imageUrl}`
}

/**
 * Format date to ISO format (YYYY-MM-DD)
 * @param date - Date string, Date object, or null/undefined
 * @returns ISO formatted date string (YYYY-MM-DD) or "N/A" if invalid
 */
export function formatDateISO(date: string | Date | null | undefined): string {
  if (!date) return "N/A"
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    if (isNaN(dateObj.getTime())) return "N/A"
    
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    
    return `${year}-${month}-${day}`
  } catch {
    return "N/A"
  }
}

/**
 * Format datetime to ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
 * @param date - Date string, Date object, or null/undefined
 * @returns ISO formatted datetime string or "N/A" if invalid
 */
export function formatDateTimeISO(date: string | Date | null | undefined): string {
  if (!date) return "N/A"
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    if (isNaN(dateObj.getTime())) return "N/A"
    
    return dateObj.toISOString()
  } catch {
    return "N/A"
  }
}
