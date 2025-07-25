/**
 * Endpoint validation utilities
 * Used to validate usernames and other identifiers against reserved endpoint names
 */

// Reserved endpoint names that cannot be used as usernames
const RESERVED_ENDPOINTS = [
  // Auth endpoints
  "auth",
  "login",
  "logout",
  "verify",
  "config",

  // User endpoints
  "users",
  "user",
  "me",
  "update",
  "new",
  "wallet",
  "lookup",
  "social-stats",
  "ip-config",

  // Payment endpoints
  "payments",
  "payment",
  "qr-code",
  "request",
  "process",
  "url",

  // Transaction endpoints
  "transactions",
  "transaction",
  "stats",
  "contacts",
  "filter",
  "hash",
  "status",
  "fix-pending",
  "cleanup-pending",
  "networks",

  // Subscription endpoints
  "subscriptions",
  "subscription",
  "subscribe",
  "manage",

  // Health endpoints
  "health",
  "db",

  // Notification endpoints
  "notifications",
  "notification",
  "preferences",
  "history",
  "read",
  "read-all",
  "clear",
  "unread-count",

  // Webhook endpoints
  "webhooks",
  "webhook",
  "meld",
  "dynamic",

  // Meld API endpoints
  "meld",
  "payment-methods",
  "fiat-currencies",
  "crypto-quote",
  "widget-session",
  "crypto-list",

  // Fiat interaction endpoints
  "fiat-interactions",
  "fiat-interaction",
  "customer",
  "session",
  "update-details",

  // Tips endpoints
  "tips",
  "tip",
  "configure",

  // Activity endpoints
  "activity",

  // Scheduled tasks
  "scheduled-tasks",
  "scheduled-task",

  // API prefix
  "api",

  // Common HTTP methods (lowercase)
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",

  // Common path segments
  "proxy",
  "stage",
  "dev",
  "staging",
  "prod",
  "test",
  "admin",
  "api",
  "v1",
  "v2",
  "beta",
  "alpha",
];

/**
 * Check if a username is a reserved endpoint name
 * @param username - The username to validate
 * @returns true if the username is valid (not reserved), false otherwise
 */
export function isValidUsername(username: string): boolean {
  if (!username) return false;

  const normalizedUsername = username.toLowerCase().trim();

  // Check if username is in the reserved list
  if (RESERVED_ENDPOINTS.includes(normalizedUsername)) {
    return false;
  }

  // Additional validation rules
  // Username should not start with common API prefixes
  if (
    normalizedUsername.startsWith("api") ||
    normalizedUsername.startsWith("v") ||
    normalizedUsername.startsWith("beta") ||
    normalizedUsername.startsWith("alpha")
  ) {
    return false;
  }

  // Username should not contain common path separators or special characters
  if (
    normalizedUsername.includes("/") ||
    normalizedUsername.includes("\\") ||
    normalizedUsername.includes("?") ||
    normalizedUsername.includes("#") ||
    normalizedUsername.includes("&") ||
    normalizedUsername.includes("=")
  ) {
    return false;
  }

  return true;
}

/**
 * Get a list of reserved endpoint names
 * @returns Array of reserved endpoint names
 */
export function getReservedEndpoints(): string[] {
  return [...RESERVED_ENDPOINTS];
}

/**
 * Check if a string is a reserved endpoint name
 * @param endpoint - The endpoint name to check
 * @returns true if the endpoint is reserved, false otherwise
 */
export function isReservedEndpoint(endpoint: string): boolean {
  if (!endpoint) return false;
  return RESERVED_ENDPOINTS.includes(endpoint.toLowerCase().trim());
}
