import * as dotenv from "dotenv";
dotenv.config();

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is missing.`);
  }
  return value;
}

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

// AI Assistant (optional, depending on which LLM you use)
export const LLM_PROVIDER = getEnv("LLM_PROVIDER"); // Should be 'openai' or 'anthropic'

// OpenAI
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // optional
export const OPENAI_MODEL = process.env.OPENAI_MODEL; // optional

// Anthropic
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // optional
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL; // optional
