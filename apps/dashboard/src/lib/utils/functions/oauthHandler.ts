import { browser } from '$app/environment';

/**
 * OAuth state management for cross-domain authentication
 */

export interface OAuthState {
  origin: string;
  path: string;
  timestamp: number;
  redirect?: string;
}

/**
 * Create OAuth state with current domain information
 */
export function createOAuthState(redirectPath?: string): string {
  if (!browser) return '';

  const state: OAuthState = {
    origin: window.location.origin,
    path: redirectPath || window.location.pathname,
    timestamp: Date.now(),
    redirect: redirectPath
  };

  return btoa(JSON.stringify(state));
}

/**
 * Parse OAuth state from URL parameters
 */
export function parseOAuthState(stateParam?: string): OAuthState | null {
  if (!stateParam) return null;

  try {
    const decoded = atob(stateParam);
    return JSON.parse(decoded) as OAuthState;
  } catch (error) {
    console.error('Failed to parse OAuth state:', error);
    return null;
  }
}

/**
 * Check if OAuth callback is on the correct domain
 */
export function isValidOAuthDomain(expectedOrigin: string): boolean {
  if (!browser) return false;

  const currentOrigin = window.location.origin;
  console.log('OAuth domain validation:', { currentOrigin, expectedOrigin });

  return currentOrigin === expectedOrigin;
}

/**
 * Handle OAuth callback and redirect if needed
 */
export function handleOAuthCallback(): boolean {
  if (!browser) return false;

  const urlParams = new URLSearchParams(window.location.search);
  const state = urlParams.get('state');
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  // If there's no code or state, this isn't an OAuth callback
  if (!code || !state) return false;

  console.log('OAuth callback detected:', { code: !!code, state: !!state, error });

  // Parse the state to get original domain
  const oauthState = parseOAuthState(state);
  if (!oauthState) {
    console.error('Invalid OAuth state');
    return false;
  }

  // Check if we're on the correct domain
  if (!isValidOAuthDomain(oauthState.origin)) {
    console.warn('OAuth callback on wrong domain, redirecting...');
    // Redirect to the correct domain with all parameters
    const targetUrl = `${oauthState.origin}${window.location.pathname}${window.location.search}`;
    window.location.href = targetUrl;
    return true; // Indicate that a redirect is happening
  }

  // We're on the correct domain, proceed with normal flow
  console.log('OAuth callback on correct domain, proceeding...');
  return false;
}

/**
 * Get the appropriate redirect URL after OAuth
 */
export function getOAuthRedirectUrl(
  oauthState: OAuthState | null,
  fallbackPath: string = '/'
): string {
  if (!oauthState) return fallbackPath;

  // Use the original path from the OAuth state
  return oauthState.redirect || oauthState.path || fallbackPath;
}
