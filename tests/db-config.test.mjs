import assert from "node:assert/strict";
import test from "node:test";

import { buildDbConfig, missingDbEnvKeys } from "../server/db-config.mjs";

const fullEnv = {
  DB_USER: "HACK",
  DB_PSW: "secret-user-password",
  WALLET_LOC: "F:\\wallet",
  CONFIG_DIR: "F:\\wallet",
  DSN_ADB: "mydb_high",
  WALLET_PSW: "secret-wallet-password",
};

test("buildDbConfig maps .env wallet settings without exposing passwords in the summary", () => {
  const config = buildDbConfig(fullEnv);
  assert.equal(config.user, "HACK");
  assert.equal(config.connectString, "mydb_high");
  assert.equal(config.configDir, "F:\\wallet");
  assert.equal(config.walletLocation, "F:\\wallet");
  assert.equal(config.password, "secret-user-password");
  assert.equal(config.walletPassword, "secret-wallet-password");

  const summary = config.publicSummary();
  assert.equal(summary.user, "HACK");
  assert.equal(summary.dsn, "mydb_high");
  assert.equal(summary.walletConfigured, true);
  assert.ok(!JSON.stringify(summary).includes("secret"));
});

test("missingDbEnvKeys reports what is absent so the API can fail honestly", () => {
  assert.deepEqual(missingDbEnvKeys(fullEnv), []);
  assert.deepEqual(missingDbEnvKeys({ DB_USER: "HACK" }), [
    "DB_PSW",
    "WALLET_LOC",
    "CONFIG_DIR",
    "DSN_ADB",
    "WALLET_PSW",
  ]);
  assert.throws(() => buildDbConfig({ DB_USER: "HACK" }), /Missing required \.env keys/);
});
