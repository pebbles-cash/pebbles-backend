// Set environment variables for testing
process.env.MONGODB_URI = "mongodb://localhost:27017/test";
process.env.MONGODB_DATABASE = "payment_platform_test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.DYNAMIC_API_KEY = "test-dynamic-api-key";
process.env.DYNAMIC_API_URL = "http://localhost:3003/mock";
process.env.AUTH_REDIRECT_URL = "http://localhost:3000/auth/callback";
process.env.PAYMENT_BASE_URL = "http://localhost:3000";
