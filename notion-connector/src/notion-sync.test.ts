import assert from "node:assert/strict";
import test from "node:test";
import { handleNotionWebhook, type NotionSyncDependencies } from "./notion-sync.js";

function createDependencies(query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>): NotionSyncDependencies {
  return {
    eventPool: { query } as NotionSyncDependencies["eventPool"],
    configPool: { query } as NotionSyncDependencies["configPool"],
    timezone: "Europe/Lisbon",
    configEncryptionKey: "test-encryption-key",
    notionClientId: "client-id",
    notionClientSecret: "client-secret",
    notionRedirectUri: "http://localhost/callback",
    notionApiVersion: "2022-06-28",
    resolveCategoryLabel: () => "Outros"
  };
}

test("does not sync during Notion subscription verification", async () => {
  let queryCount = 0;
  const deps = createDependencies(async () => {
    queryCount += 1;
    return { rows: [] };
  });

  const result = await handleNotionWebhook(
    deps,
    JSON.stringify({ verification_token: "configured-token" }),
    {}
  );

  assert.equal(result.syncTriggered, false);
  assert.equal(queryCount, 0);
});

test("rejects an unscoped Notion event instead of syncing every user", async () => {
  const deps = createDependencies(async () => ({ rows: [] }));

  await assert.rejects(
    handleNotionWebhook(deps, JSON.stringify({ type: "page.updated" }), {}),
    /workspace_id ou integration_id/
  );
});

test("does not sync when the Notion workspace has no enabled connection", async () => {
  let queryValues: unknown[] | undefined;
  const deps = createDependencies(async (_text, values) => {
    queryValues = values;
    return { rows: [] };
  });

  const result = await handleNotionWebhook(
    deps,
    JSON.stringify({ workspace_id: "workspace-1", integration_id: "integration-1" }),
    {}
  );

  assert.equal(result.syncTriggered, false);
  assert.deepEqual(queryValues, ["workspace-1", "integration-1"]);
});
