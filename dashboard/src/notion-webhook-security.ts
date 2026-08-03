import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidNotionWebhookSignature(
  rawBody: string,
  signatureHeader: string | string[] | undefined,
  verificationToken: string
): boolean {
  const secret = verificationToken.trim();
  if (!secret) {
    return false;
  }

  const signature = getHeaderValue(signatureHeader);
  if (!signature) {
    return isNotionVerificationPayload(rawBody, secret);
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")}`;
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(signature, "utf8");

  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function isNotionVerificationPayload(rawBody: string, verificationToken: string): boolean {
  try {
    const payload = JSON.parse(rawBody) as { verification_token?: unknown };
    return payload.verification_token === verificationToken;
  } catch {
    return false;
  }
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
