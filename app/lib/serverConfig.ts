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

export type ServerConfigDiagnostic = {
  errorCode?: string;
  loaded: boolean;
  region: string;
  secretName: string;
  source: "environment" | "secrets-manager" | "unavailable";
};

const productionSecretName = "stock-analyzer/production";
let productionConfigPromise: Promise<ServerConfig> | null = null;
let diagnostic: ServerConfigDiagnostic = {
  loaded: false,
  region: getAwsRegion(),
  secretName: productionSecretName,
  source: "unavailable",
};

export async function getServerConfig(): Promise<ServerConfig> {
  const localConfig = getEnvironmentConfig();

  if (hasCompleteConfig(localConfig)) {
    diagnostic = {
      loaded: true,
      region: getAwsRegion(),
      secretName: productionSecretName,
      source: "environment",
    };
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

export async function getServerConfigDiagnostic() {
  await getServerConfig();
  return diagnostic;
}

async function loadProductionSecret(): Promise<ServerConfig> {
  try {
    const region = getAwsRegion();
    const client = new SecretsManagerClient(
      region === "AWS runtime default" ? {} : { region },
    );
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: productionSecretName }),
    );

    if (!response.SecretString) {
      diagnostic = {
        errorCode: "SecretStringMissing",
        loaded: false,
        region,
        secretName: productionSecretName,
        source: "unavailable",
      };
      return {};
    }

    const config = sanitizeConfig(JSON.parse(response.SecretString) as unknown);
    diagnostic = {
      errorCode: hasCompleteConfig(config) ? undefined : "RequiredKeysMissing",
      loaded: hasCompleteConfig(config),
      region,
      secretName: productionSecretName,
      source: hasCompleteConfig(config) ? "secrets-manager" : "unavailable",
    };

    return config;
  } catch (error) {
    console.error("Unable to load Stock Analyzer production secret:", error);
    diagnostic = {
      errorCode: getErrorCode(error),
      loaded: false,
      region: getAwsRegion(),
      secretName: productionSecretName,
      source: "unavailable",
    };
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

function hasCompleteConfig(config: ServerConfig) {
  return Boolean(
    config.FINNHUB_API_KEY &&
      config.KITE_API_KEY &&
      config.KITE_API_SECRET,
  );
}

function getAwsRegion() {
  return (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "AWS runtime default"
  );
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "UnknownError";

  const value = error as { name?: unknown };
  return typeof value.name === "string" ? value.name : "UnknownError";
}
