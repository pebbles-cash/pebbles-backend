import { NODE_ENV, IS_PRODUCTION, IS_DEVELOPMENT } from "../config/env";

// Define log levels
type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

// Set minimum log level based on environment
const getMinLogLevel = (): LogLevel => {
  if (IS_DEVELOPMENT) return "DEBUG";
  if (IS_PRODUCTION) return "WARN";
  return "INFO"; // Default for staging
};

// Log level numeric values for comparison
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Minimum level that will be logged
const MIN_LOG_LEVEL = getMinLogLevel();

/**
 * Determines if a message at the given level should be logged
 */
const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[MIN_LOG_LEVEL];
};

/**
 * Formats a log message with context information
 */
const formatLogMessage = (
  level: LogLevel,
  message: string,
  context?: Record<string, any>
): string => {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level}] [${NODE_ENV}]${contextStr} ${message}`;
};

/**
 * Sanitizes sensitive data from logs
 */
const sanitizeData = (data: any): any => {
  if (!data) return data;

  // If it's not an object, return as is
  if (typeof data !== "object") return data;

  // Clone the object to avoid mutating the original
  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  // Sensitive field patterns
  const sensitiveFields = [
    "password",
    "secret",
    "token",
    "key",
    "auth",
    "credential",
    "jwt",
    "apiKey",
    "api_key",
    "dynamicApiKey",
    "openaiApiKey",
    "anthropicApiKey",
  ];

  // Replace sensitive data with placeholder
  for (const key in sanitized) {
    if (
      sensitiveFields.some((field) =>
        key.toLowerCase().includes(field.toLowerCase())
      )
    ) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
};

/**
 * Logger service with environment-specific behavior
 */
export const logger = {
  debug: (message: string, context?: Record<string, any>): void => {
    if (!shouldLog("DEBUG")) return;

    // Only sanitize in non-development environments
    const sanitizedContext = IS_DEVELOPMENT ? context : sanitizeData(context);
    console.debug(formatLogMessage("DEBUG", message, sanitizedContext));
  },

  info: (message: string, context?: Record<string, any>): void => {
    if (!shouldLog("INFO")) return;

    const sanitizedContext = IS_DEVELOPMENT ? context : sanitizeData(context);
    console.info(formatLogMessage("INFO", message, sanitizedContext));
  },

  warn: (message: string, context?: Record<string, any>): void => {
    if (!shouldLog("WARN")) return;

    const sanitizedContext = sanitizeData(context);
    console.warn(formatLogMessage("WARN", message, sanitizedContext));
  },

  error: (
    message: string,
    error?: Error,
    context?: Record<string, any>
  ): void => {
    if (!shouldLog("ERROR")) return;

    const sanitizedContext = sanitizeData(context);
    const errorDetails = error
      ? {
          message: error.message,
          name: error.name,
          stack: IS_PRODUCTION ? undefined : error.stack,
        }
      : undefined;

    const errorContext = errorDetails
      ? { ...sanitizedContext, error: errorDetails }
      : sanitizedContext;
    console.error(formatLogMessage("ERROR", message, errorContext));
  },

  /**
   * Log Lambda function invocation
   */
  logLambdaInvocation: (handlerName: string, event: any): void => {
    if (!shouldLog("INFO")) return;

    // Create a sanitized version of the event
    const sanitizedEvent = IS_PRODUCTION
      ? {
          httpMethod: event.httpMethod,
          path: event.path,
          hasBody: !!event.body,
          queryParameters: event.queryStringParameters
            ? Object.keys(event.queryStringParameters)
            : [],
        }
      : sanitizeData(event);

    logger.info(`Lambda invocation: ${handlerName}`, {
      event: sanitizedEvent,
      requestId: event.requestContext?.requestId,
    });
  },

  /**
   * Log Lambda function response
   */
  logLambdaResponse: (
    handlerName: string,
    response: any,
    durationMs: number
  ): void => {
    if (!shouldLog("INFO")) return;

    // Simplify response for logs
    const logResponse = {
      statusCode: response.statusCode,
      hasBody: !!response.body,
      bodyLength: response.body ? response.body.length : 0,
      durationMs,
    };

    logger.info(`Lambda response: ${handlerName}`, logResponse);
  },
};

/**
 * Higher-order function to wrap Lambda handlers with logging
 */
export const withLogging = <T extends (...args: any[]) => Promise<any>>(
  handler: T,
  handlerName: string
): T => {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    logger.logLambdaInvocation(handlerName, args[0]);

    try {
      const result = await handler(...args);
      const duration = Date.now() - startTime;
      logger.logLambdaResponse(handlerName, result, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Lambda error: ${handlerName}`, error as Error, {
        durationMs: duration,
      });
      throw error;
    }
  }) as T;
};

export default logger;
