import "server-only";

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export type ServerConfig = {
  FINNHUB_API_KEY?: string;
  KITE_API_KEY?: string;
  KITE_API_SECRET?: string;
};

const productionSecretName = "stock-analyzer/production";
let productionConfigPromise: Promise<ServerConfig> | null = null;

export async function getServerConfig(): Promise<ServerConfig> {
  const localConfig = getEnvironmentConfig();

  if (!isAwsRuntime()) {
    return localConfig;
  }

  productionConfigPromise ??= loadProductionSecret();

  const productionConfig = await productionConfigPromise;

  return {
    FINNHUB_API_KEY:
      localConfig.FINNHUB_API_KEY ?? productionConfig.FINNHUB_API_KEY,
    KITE_API_KEY: localConfig.KITE_API_KEY ?? productionConfig.KITE_API_KEY,
    KITE_API_SECRET:
      localConfig.KITE_API_SECRET ?? productionConfig.KITE_API_SECRET,
  };
}

async function loadProductionSecret(): Promise<ServerConfig> {
  try {
    const client = new SecretsManagerClient({});
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: productionSecretName }),
    );

    if (!response.SecretString) return {};

    return sanitizeConfig(JSON.parse(response.SecretString) as unknown);
  } catch (error) {
    console.error("Unable to load Stock Analyzer production secret:", error);
    return {};
  }
}

function getEnvironmentConfig(): ServerConfig {
  return sanitizeConfig({
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
    KITE_API_KEY: process.env.KITE_API_KEY,
    KITE_API_SECRET: process.env.KITE_API_SECRET,
  });
}

function sanitizeConfig(value: unknown): ServerConfig {
  if (!value || typeof value !== "object") return {};

  const config = value as Record<string, unknown>;

  return {
    FINNHUB_API_KEY: getString(config.FINNHUB_API_KEY),
    KITE_API_KEY: getString(config.KITE_API_KEY),
    KITE_API_SECRET: getString(config.KITE_API_SECRET),
  };
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isAwsRuntime() {
  return Boolean(
    process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      process.env.AWS_EXECUTION_ENV,
  );
}
