import { browser } from '$app/environment';
import { PUBLIC_APP_HOST } from '$env/static/public';

/**
 * Domain-aware authentication utilities
 */

export interface DomainInfo {
  isOrgSite: boolean;
  orgSiteName: string;
  currentDomain: string;
  isMainDomain: boolean;
}

/**
 * Get information about the current domain
 */
export function getDomainInfo(): DomainInfo {
  if (!browser) {
    return {
      isOrgSite: false,
      orgSiteName: '',
      currentDomain: '',
      isMainDomain: false
    };
  }

  const currentDomain = window.location.hostname;
  const origin = window.location.origin;

  console.log('Current domain analysis:', { currentDomain, origin });

  // Check if this is a subdomain (org site)
  const parts = currentDomain.split('.');
  const isSubdomain = parts.length > 2;

  // Check if it's the main app domain
  const isMainDomain =
    currentDomain === PUBLIC_APP_HOST ||
    currentDomain === `localhost` ||
    currentDomain.endsWith(`.${PUBLIC_APP_HOST}`);

  let isOrgSite = false;
  let orgSiteName = '';

  if (isSubdomain && !isMainDomain) {
    // This is likely an org subdomain
    isOrgSite = true;
    orgSiteName = parts[0]; // First part is the subdomain
  }

  return {
    isOrgSite,
    orgSiteName,
    currentDomain,
    isMainDomain
  };
}

/**
 * Determine if user should stay on current domain after authentication
 */
export function shouldStayOnCurrentDomain(isOrgSite: boolean, userRole: string): boolean {
  const domainInfo = getDomainInfo();

  console.log('Domain redirect decision:', {
    isOrgSite,
    userRole,
    currentDomain: domainInfo.currentDomain,
    isMainDomain: domainInfo.isMainDomain
  });

  // If user is on org domain, keep them there regardless of role
  if (domainInfo.isOrgSite) {
    return true;
  }

  // If user is on main domain and is a student, keep them on main domain
  if (domainInfo.isMainDomain && userRole === 'student') {
    return true;
  }

  // Otherwise, they can be redirected
  return false;
}

/**
 * Get the appropriate redirect URL based on domain and user role
 */
export function getAuthRedirectUrl(
  isOrgSite: boolean,
  userRole: string,
  orgSiteName: string = '',
  fallbackPath: string = '/lms'
): string {
  const domainInfo = getDomainInfo();

  if (shouldStayOnCurrentDomain(isOrgSite, userRole)) {
    // Keep user on current domain
    return fallbackPath;
  }

  // For students on main domain, keep them there
  if (domainInfo.isMainDomain && userRole === 'student') {
    return fallbackPath;
  }

  // For other cases, redirect to appropriate org page on main domain
  if (orgSiteName) {
    return `/org/${orgSiteName}`;
  }

  return fallbackPath;
}
