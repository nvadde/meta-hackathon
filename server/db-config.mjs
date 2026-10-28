/** Oracle connection settings, read from .env. Secrets stay on the server. */

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
    configDir: env.CONFIG_DIR,
    walletLocation: env.WALLET_LOC,
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
