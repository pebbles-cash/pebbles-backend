import { APIGatewayProxyResult } from "aws-lambda";

/**
 * Format a successful API response
 * @param data - The data to return to the client
 * @param statusCode - HTTP status code (default: 200)
 */
export function success(
  data: any,
  statusCode: number = 200
): APIGatewayProxyResult {
  const corsOrigin = process.env.CORS_ORIGIN || "*";

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent",
    },
    body: JSON.stringify({
      success: true,
      data,
    }),
  };
}

/**
 * Format an error API response
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 500)
 * @param errors - Additional error details
 */
export function error(
  message: string,
  statusCode: number = 500,
  errors: any = null
): APIGatewayProxyResult {
  const corsOrigin = process.env.CORS_ORIGIN || "*";
  const body: {
    success: boolean;
    error: string;
    errors?: any;
  } = {
    success: false,
    error: message,
  };

  if (errors) {
    body.errors = errors;
  }

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent",
    },
    body: JSON.stringify(body),
  };
}
