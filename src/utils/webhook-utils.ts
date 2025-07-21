import crypto from "crypto";

/**
 * TypeScript equivalent of the Java WebhookUtil.getSignature method
 *
 * @param timestamp - The timestamp from the webhook headers
 * @param url - The webhook URL path
 * @param body - The webhook payload body
 * @param secret - The webhook secret
 * @returns Base64 URL-safe encoded signature
 */
export function getMeldSignature(
  timestamp: string,
  url: string,
  body: string,
  secret: string
): string {
  // Create data string using dot concatenation: timestamp.url.body
  const data = [timestamp, url, body].join(".");

  // Create HMAC-SHA256 hash
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data, "utf8");
  const bytes = hmac.digest();

  // Convert to Base64 URL-safe encoding (same as Java's Base64.getUrlEncoder())
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Verify Meld webhook signature using the same algorithm as the Java implementation
 *
 * @param timestamp - The timestamp from the webhook headers
 * @param url - The webhook URL path
 * @param body - The webhook payload body
 * @param signature - The received signature
 * @param secret - The webhook secret
 * @returns true if signature is valid, false otherwise
 */
export function verifyMeldSignatureJavaStyle(
  timestamp: string,
  url: string,
  body: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expectedSignature = getMeldSignature(timestamp, url, body, secret);

    // Use timing-safe comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSignature, "ascii");
    const receivedBuffer = Buffer.from(signature, "ascii");

    return (
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  } catch (err) {
    console.error("Error verifying Meld signature:", err);
    return false;
  }
}
