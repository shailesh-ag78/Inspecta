/**
 * Company ID management utility
 * Stores and retrieves the current company ID from localStorage
 */

const COMPANY_ID_KEY = 'inspecta_company_id';
const DEFAULT_COMPANY_ID = 2;

export function getCompanyId(): number {
  if (typeof window === 'undefined') {
    // Server-side rendering
    return DEFAULT_COMPANY_ID;
  }

  try {
    const stored = localStorage.getItem(COMPANY_ID_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_COMPANY_ID;
  } catch (error) {
    console.warn('Failed to get company ID from localStorage:', error);
    return DEFAULT_COMPANY_ID;
  }
}

export function setCompanyId(companyId: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(COMPANY_ID_KEY, String(companyId));
  } catch (error) {
    console.warn('Failed to set company ID in localStorage:', error);
  }
}
