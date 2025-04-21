// Set environment variables for testing
process.env.MONGODB_URI =
  "mongodb+srv://thryec:Pebbles123!@testing.ejtmum1.mongodb.net/?retryWrites=true&w=majority&appName=testing";
process.env.MONGODB_DATABASE = "pebbles-dev-testing";
process.env.JWT_SECRET = "pebbles-cash";

process.env.DYNAMIC_ENVIRONMENT_ID = "2c2013e0-9bbe-479c-8f0a-beaee6da6efc";
process.env.DYNAMIC_API_KEY =
  "dyn_AkjV6otAQf53ZvmHdJdyZZcoDshSgXF0HIQZNV2QtlFWSZ5VLH2e0pnA";
process.env.DYNAMIC_API_URL = "https://api.dynamic.xyz/v1";

process.env.AUTH_REDIRECT_URL = "http://localhost:3000/auth/callback";
process.env.PAYMENT_BASE_URL = "http://localhost:3000";
