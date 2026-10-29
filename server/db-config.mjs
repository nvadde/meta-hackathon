/** Oracle connection settings, read from .env. Secrets stay on the server. */
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Relative wallet paths resolve against the project root so the same env
 * names work locally (absolute Windows path) and on Vercel (bundled
 * relative wallet dir).
 */
export function resolveWalletPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

export const REQUIRED_DB_ENV_KEYS = [
  "DB_USER",
  "DB_PSW",
  "WALLET_LOC",
  "CONFIG_DIR",
  "DSN_ADB",
  "WALLET_PSW",
];

export function missingDbEnvKeys(env) {
  return REQUIRED_DB_ENV_KEYS.filter((key) => !env[key] || !String(env[key]).trim());
}

export function buildDbConfig(env) {
  const missing = missingDbEnvKeys(env);
  if (missing.length > 0) {
    throw new Error(`Missing required .env keys: ${missing.join(", ")}`);
  }
  const config = {
    user: env.DB_USER,
    password: env.DB_PSW,
    connectString: env.DSN_ADB,
    configDir: resolveWalletPath(env.CONFIG_DIR),
    walletLocation: resolveWalletPath(env.WALLET_LOC),
    walletPassword: env.WALLET_PSW,
  };
  config.publicSummary = () => ({
    user: config.user,
    dsn: config.connectString,
    walletConfigured: Boolean(config.walletLocation && config.walletPassword),
    configDir: config.configDir,
  });
  return config;
}
