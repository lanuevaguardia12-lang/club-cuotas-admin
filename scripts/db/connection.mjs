import nextEnv from "@next/env";
import postgres from "postgres";

export function connectDatabase({ migration = false } = {}) {
  nextEnv.loadEnvConfig(process.cwd());
  const key = migration ? "DIRECT_URL" : "DATABASE_URL";
  const value = process.env[key];
  if (!value) throw new Error(`Falta configurar ${key} en .env.local.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} no es una URL válida.`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.password) {
    throw new Error(`${key} debe contener una conexión PostgreSQL completa.`);
  }
  return postgres(value, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 10,
    ssl: "require",
    connection: { application_name: "club-cuotas-migration", statement_timeout: 60000 },
    onnotice: () => {},
  });
}

export function reportDatabaseError(error) {
  // Never print server messages, query parameters, connection strings or stack traces.
  const code =
    typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : "DATABASE_ERROR";
  console.error(
    `No se completó la operación (${code}). Los datos de conexión no se muestran.`,
  );
  process.exitCode = 1;
}
