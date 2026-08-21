/**
 * OAuth Token Manager for Egyptian Tax Authority (ETA) E-Receipt API
 *
 * Handles OAuth 2.0 authentication flow including:
 * - Access token acquisition
 * - Token refresh
 * - Token validation
 * - Automatic token management
 */

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
}

export interface ETAApiConfig {
  clientId: string;
  clientSecret: string;
  environment: 'TEST' | 'PRODUCTION';
}

export interface TokenValidationResult {
  isValid: boolean;
  token: string | null;
  expiresIn: number | null; // seconds until expiration
  isExpired: boolean;
  willExpireSoon: boolean; // within 5 minutes
  message: string;
}

/**
 * ETA OAuth API Endpoints
 */
const ETA_OAUTH_ENDPOINTS = {
  TEST: {
    token: 'https://idp.eta.gov.eg/connect/token', // Test environment OAuth endpoint
    api: 'https://api.eta.gov.eg/api/v1', // Test API base URL
  },
  PRODUCTION: {
    token: 'https://idp.eta.gov.eg/connect/token', // Production OAuth endpoint
    api: 'https://api.eta.gov.eg/api/v1', // Production API base URL
  },
};

/**
 * Get the OAuth token endpoint URL for the given environment
 */
export function getOAuthEndpoint(environment: 'TEST' | 'PRODUCTION'): string {
  return ETA_OAUTH_ENDPOINTS[environment].token;
}

/**
 * Get the API base URL for the given environment
 */
export function getApiBaseUrl(environment: 'TEST' | 'PRODUCTION'): string {
  return ETA_OAUTH_ENDPOINTS[environment].api;
}

/**
 * Request a new OAuth access token from the ETA OAuth server
 *
 * Uses the client_credentials grant type to obtain an access token
 *
 * @param config - ETA API configuration (client ID, secret, environment)
 * @returns OAuth token response
 */
export async function requestAccessToken(
  config: ETAApiConfig
): Promise<OAuthTokenResponse> {
  const tokenEndpoint = getOAuthEndpoint(config.environment);

  console.log(`[OAuth Manager] Requesting access token from ${tokenEndpoint}`);

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'eta-api', // The required scope for ETA API access
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OAuth token request failed with status ${response.status}: ${errorText}`
      );
    }

    const tokenData: OAuthTokenResponse = await response.json();

    console.log('[OAuth Manager] Access token obtained successfully');
    console.log(`[OAuth Manager] Token type: ${tokenData.token_type}`);
    console.log(`[OAuth Manager] Expires in: ${tokenData.expires_in} seconds`);

    return tokenData;
  } catch (error) {
    console.error('[OAuth Manager] Failed to request access token:', error);
    throw new Error(
      `Failed to obtain OAuth access token: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Validate if a token is still valid and not about to expire
 *
 * @param token - The access token to validate
 * @param expiresAt - The token expiration timestamp
 * @param bufferSeconds - Buffer time in seconds before actual expiration (default: 300 = 5 minutes)
 * @returns Token validation result
 */
export function validateToken(
  token: string | null | undefined,
  expiresAt: Date | null | undefined,
  bufferSeconds: number = 300
): TokenValidationResult {
  // Check if token exists
  if (!token) {
    return {
      isValid: false,
      token: null,
      expiresIn: null,
      isExpired: true,
      willExpireSoon: true,
      message: 'No access token available',
    };
  }

  // Check if expiration time is set
  if (!expiresAt) {
    return {
      isValid: false,
      token: token,
      expiresIn: null,
      isExpired: false,
      willExpireSoon: false,
      message: 'Token exists but expiration time is unknown',
    };
  }

  const now = new Date();
  const expiresAtDate = new Date(expiresAt);
  const timeUntilExpiration = expiresAtDate.getTime() - now.getTime();
  const secondsUntilExpiration = Math.floor(timeUntilExpiration / 1000);

  // Check if token is expired
  if (secondsUntilExpiration <= 0) {
    return {
      isValid: false,
      token: token,
      expiresIn: 0,
      isExpired: true,
      willExpireSoon: true,
      message: 'Access token has expired',
    };
  }

  // Check if token will expire soon (within buffer time)
  const willExpireSoon = secondsUntilExpiration <= bufferSeconds;

  return {
    isValid: true,
    token: token,
    expiresIn: secondsUntilExpiration,
    isExpired: false,
    willExpireSoon,
    message: willExpireSoon
      ? `Token valid but will expire in ${Math.floor(secondsUntilExpiration / 60)} minutes`
      : `Token valid for ${Math.floor(secondsUntilExpiration / 60)} minutes`,
  };
}

/**
 * Format token expiration time for display
 *
 * @param expiresIn - Seconds until expiration
 * @returns Human-readable time string
 */
export function formatTokenExpiration(expiresIn: number | null): string {
  if (!expiresIn || expiresIn <= 0) {
    return 'Expired';
  }

  const minutes = Math.floor(expiresIn / 60);
  const seconds = expiresIn % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Get authorization header value for API requests
 *
 * @param token - The access token
 * @returns Authorization header value
 */
export function getAuthHeader(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Create HTTP headers for ETA API requests
 *
 * @param token - The OAuth access token
 * @param additionalHeaders - Any additional headers to include
 * @returns Headers object
 */
export function createApiHeaders(
  token: string,
  additionalHeaders?: Record<string, string>
): HeadersInit {
  return {
    'Authorization': getAuthHeader(token),
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...additionalHeaders,
  };
}

/**
 * Make an authenticated request to the ETA API
 *
 * @param endpoint - API endpoint (relative to base URL)
 * @param token - OAuth access token
 * @param environment - TEST or PRODUCTION
 * @param options - Fetch options
 * @returns Response from the ETA API
 */
export async function makeAuthenticatedRequest(
  endpoint: string,
  token: string,
  environment: 'TEST' | 'PRODUCTION',
  options?: RequestInit
): Promise<Response> {
  const baseUrl = getApiBaseUrl(environment);
  const url = `${baseUrl}${endpoint}`;

  const headers = createApiHeaders(token, options?.headers as Record<string, string>);

  console.log(`[OAuth Manager] Making authenticated request to ${url}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized (token might be expired)
  if (response.status === 401) {
    console.warn('[OAuth Manager] Received 401 Unauthorized - token may be expired');
  }

  return response;
}

/**
 * Parse error response from ETA API
 *
 * @param response - Fetch response object
 * @returns Parsed error message
 */
export async function parseEtaError(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const errorData = await response.json();
      return errorData.message || errorData.error || errorData.detail || 'Unknown error';
    }
    return await response.text();
  } catch {
    return `HTTP ${response.status} error`;
  }
}

/**
 * OAuth Token Manager Class
 *
 * Provides a high-level interface for managing OAuth tokens in the application
 */
export class OAuthTokenManager {
  private config: ETAApiConfig;

  constructor(config: ETAApiConfig) {
    this.config = config;
  }

  /**
   * Get a valid access token
   * This method should be called before making any API request
   *
   * @param currentToken - Current cached token (if any)
   * @param tokenExpiresAt - Token expiration time (if any)
   * @returns Valid access token
   */
  async getValidToken(
    currentToken: string | null,
    tokenExpiresAt: Date | null
  ): Promise<{ token: string; expiresAt: Date; wasRefreshed: boolean }> {
    // Validate current token
    const validation = validateToken(currentToken, tokenExpiresAt);

    if (validation.isValid && !validation.willExpireSoon) {
      console.log(`[OAuth Manager] Using existing token (valid for ${validation.expiresIn}s)`);
      return {
        token: currentToken!,
        expiresAt: tokenExpiresAt!,
        wasRefreshed: false,
      };
    }

    // Token is expired or will expire soon, get a new one
    console.log('[OAuth Manager] Token expired or expiring soon, requesting new token...');
    const tokenData = await requestAccessToken(this.config);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    console.log('[OAuth Manager] New token obtained, expires at:', expiresAt.toISOString());

    return {
      token: tokenData.access_token,
      expiresAt,
      wasRefreshed: true,
    };
  }

  /**
   * Test if the current credentials are valid
   *
   * @returns True if credentials are valid
   */
  async testCredentials(): Promise<{ success: boolean; message: string }> {
    try {
      const tokenData = await requestAccessToken(this.config);
      return {
        success: true,
        message: 'Credentials are valid. Successfully obtained access token.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Invalid credentials: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ETAApiConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
