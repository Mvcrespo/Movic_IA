import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { isValidNotionWebhookSignature } from "./notion-webhook-security.js";

const verificationToken = "unit-test-notion-verification-token";
const eventBody = JSON.stringify({
  workspace_id: "workspace-1",
  integration_id: "integration-1"
});

function sign(body: string): string {
  return `sha256=${createHmac("sha256", verificationToken).update(body, "utf8").digest("hex")}`;
}

test("accepts a valid Notion webhook signature", () => {
  assert.equal(
    isValidNotionWebhookSignature(eventBody, sign(eventBody), verificationToken),
    true
  );
});

test("rejects a modified Notion webhook body", () => {
  assert.equal(
    isValidNotionWebhookSignature(
      `${eventBody} `,
      sign(eventBody),
      verificationToken
    ),
    false
  );
});

test("accepts only the configured verification payload without a signature", () => {
  assert.equal(
    isValidNotionWebhookSignature(
      JSON.stringify({ verification_token: verificationToken }),
      undefined,
      verificationToken
    ),
    true
  );
  assert.equal(
    isValidNotionWebhookSignature(
      JSON.stringify({ verification_token: "wrong-token" }),
      undefined,
      verificationToken
    ),
    false
  );
});
