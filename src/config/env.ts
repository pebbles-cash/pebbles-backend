import * as dotenv from "dotenv";

// Load environment-specific .env file based on NODE_ENV
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : ".env";

console.log(`Loading environment from ${envFile}`);
dotenv.config({ path: envFile });

// Fallback to .env if specific environment file doesn't exist
if (!process.env.MONGODB_URI) {
  console.log("Falling back to default .env file");
  dotenv.config();
}

function getEnv(name: string, required: boolean = true): string | undefined {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Environment variable ${name} is missing.`);
  }
  return value;
}

// Deployment environment
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";
export const IS_STAGING = NODE_ENV === "staging";
export const IS_DEVELOPMENT = NODE_ENV === "development";

// MongoDB configuration
export const MONGODB_URI = getEnv("MONGODB_URI");
export const MONGODB_DATABASE = getEnv("MONGODB_DATABASE");

// Authentication
export const AUTH_REDIRECT_URL = getEnv("AUTH_REDIRECT_URL");
export const PAYMENT_BASE_URL = getEnv("PAYMENT_BASE_URL");

// JWT configuration
export const JWT_SECRET = getEnv("JWT_SECRET");

// Dynamic integration
export const DYNAMIC_API_URL = getEnv("DYNAMIC_API_URL");
export const DYNAMIC_API_KEY = getEnv("DYNAMIC_API_KEY");
export const DYNAMIC_ENVIRONMENT_ID = getEnv("DYNAMIC_ENVIRONMENT_ID");
export const DYNAMIC_WEBHOOK_SECRET = getEnv("DYNAMIC_WEBHOOK_SECRET");

// Meld integration
export const MELD_API_KEY = getEnv("MELD_API_KEY");
export const MELD_API_URL =
  getEnv("MELD_API_URL", false) || "https://api.meld.io";
export const MELD_WEBHOOK_SECRET = getEnv("MELD_WEBHOOK_SECRET");

// Firebase configuration
export const FIREBASE_PROJECT_ID = getEnv("FIREBASE_PROJECT_ID");
export const FIREBASE_PRIVATE_KEY = getEnv("FIREBASE_PRIVATE_KEY", false);
export const FIREBASE_CLIENT_EMAIL = getEnv("FIREBASE_CLIENT_EMAIL", false);
export const FIREBASE_SERVICE_ACCOUNT_JSON = getEnv(
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  false
);

export const SKIP_FCM_VALIDATION = process.env.SKIP_FCM_VALIDATION === "true";
export const FCM_VALIDATION_TIMEOUT = parseInt(
  process.env.FCM_VALIDATION_TIMEOUT || "5000"
);
export const ENABLE_FIREBASE_DEBUG =
  process.env.ENABLE_FIREBASE_DEBUG === "true";

// Log configuration (without sensitive values)
console.log(`Environment: ${NODE_ENV}`);
console.log(`Database: ${MONGODB_DATABASE}`);
console.log(`Payment Base URL: ${PAYMENT_BASE_URL}`);
console.log(`Meld API URL: ${MELD_API_URL}`);
console.log(`Meld API Key configured: ${MELD_API_KEY ? "Yes" : "No"}`);
console.log(
  `Meld Webhook Secret configured: ${MELD_WEBHOOK_SECRET ? "Yes" : "No"}`
);
