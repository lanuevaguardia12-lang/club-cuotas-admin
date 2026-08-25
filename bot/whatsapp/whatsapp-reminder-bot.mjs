import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import qrcode from "qrcode-terminal";
import whatsappWeb from "whatsapp-web.js";

const { Client, LocalAuth } = whatsappWeb;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadLocalEnv();

const appUrl = requiredEnv("CLUB_APP_URL").replace(/\/$/, "");
const runnerSecret = requiredEnv("WHATSAPP_BOT_RUNNER_SECRET");
const pollIntervalMs = readPositiveNumber("WHATSAPP_BOT_POLL_INTERVAL_MS", 10_000);
const batchLimit = readPositiveNumber("WHATSAPP_BOT_BATCH_LIMIT", 5);
const sendDelayMs = readPositiveNumber("WHATSAPP_BOT_SEND_DELAY_MS", 60_000);
const readyTimeoutMs = readPositiveNumber("WHATSAPP_BOT_READY_TIMEOUT_MS", 120_000);
const defaultCountryCode = process.env.WHATSAPP_BOT_DEFAULT_COUNTRY_CODE ?? "549";
const dryRun = parseBoolean(process.env.WHATSAPP_BOT_DRY_RUN);
const headless = parseBoolean(process.env.WHATSAPP_BOT_HEADLESS);
const browserExecutablePath = getBrowserExecutablePath();
const whatsappUserAgent =
  process.env.WHATSAPP_BOT_USER_AGENT?.trim() ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const statusFile = path.resolve(
  __dirname,
  process.env.WHATSAPP_BOT_STATUS_FILE ?? "./whatsapp-bot-status.json",
);
const clientId =
  process.env.WHATSAPP_BOT_CLIENT_ID?.trim() || "club-cuotas-reminders-v2";
const sessionPath = path.resolve(
  __dirname,
  process.env.WHATSAPP_SESSION_PATH ?? "./.wwebjs_auth",
);
const browserSessionPath = path.join(sessionPath, `session-${clientId}`);
let polling = false;
let ready = false;
let qrFallbackReported = false;
let shuttingDown = false;

cleanupStaleBrowserLocks(browserSessionPath);

const client = new Client({
  authStrategy: new LocalAuth({
    clientId,
    dataPath: sessionPath,
  }),
  puppeteer: {
    ...(browserExecutablePath ? { executablePath: browserExecutablePath } : {}),
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--start-maximized"],
    defaultViewport: null,
    headless,
  },
  userAgent: whatsappUserAgent,
});

const readyTimeout = setTimeout(() => {
  if (ready) {
    return;
  }

  writeStatus("startup-timeout", {
    message: `WhatsApp no llego a listo en ${readyTimeoutMs}ms.`,
  });
  errorLog(`WhatsApp no llego a listo en ${readyTimeoutMs}ms. Reinicia el bot.`);
  void shutdown("startup-timeout", 1);
}, readyTimeoutMs);
const startupInspector = setInterval(inspectStartupPage, 15_000);

writeStatus("starting", {
  appUrl,
  batchLimit,
  browser: browserExecutablePath || "puppeteer-default",
  dryRun,
  headless,
  pollIntervalMs,
  sendDelayMs,
});

log("Inicializando WhatsApp Web...");
log(
  `Config: dryRun=${dryRun} headless=${headless} browser=${browserExecutablePath || "puppeteer-default"} delay=${sendDelayMs}ms`,
);

client.on("loading_screen", (percent, message) => {
  writeStatus("loading", { message, percent });
  log(`WhatsApp cargando ${percent}% ${message ?? ""}`.trim());
});

client.on("qr", (qr) => {
  clearTimeout(readyTimeout);
  writeStatus("qr", {
    message: "WhatsApp necesita escanear QR.",
  });

  if (!headless) {
    log(
      "WhatsApp Web esta abierto. Escanea el QR desde esa ventana para iniciar sesion.",
    );
    return;
  }

  log("Escanea este QR con WhatsApp para iniciar sesion:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  writeStatus("authenticated", { sessionPath });
  log(`WhatsApp autenticado. La sesion queda guardada en: ${sessionPath}`);
});

client.on("ready", () => {
  ready = true;
  clearTimeout(readyTimeout);
  clearInterval(startupInspector);
  writeStatus("ready", { pollIntervalMs });
  log(`Bot de WhatsApp listo. Consultando trabajos cada ${pollIntervalMs} ms.`);
  pollQueue();
  setInterval(pollQueue, pollIntervalMs);
});

client.on("change_state", (state) => {
  writeStatus("state-change", { state });
  log(`Estado de WhatsApp: ${state}`);
});

client.on("auth_failure", (message) => {
  clearInterval(startupInspector);
  writeStatus("auth-failure", { message });
  errorLog(`Fallo la autenticacion de WhatsApp: ${message}`);
});

client.on("disconnected", (reason) => {
  clearInterval(startupInspector);
  writeStatus("disconnected", { reason });
  errorLog(`WhatsApp se desconecto: ${reason}`);
});

client.initialize().catch(async (error) => {
  writeStatus("startup-error", { message: getErrorMessage(error) });
  errorLog(`No pude inicializar WhatsApp Web: ${getErrorMessage(error)}`);
  await shutdown("startup-error", 1);
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (error) => {
  writeStatus("unhandled-rejection", { message: getErrorMessage(error) });
  errorLog(`Promesa rechazada sin manejar: ${getErrorMessage(error)}`);
  void shutdown("unhandled-rejection", 1);
});

process.on("uncaughtException", (error) => {
  writeStatus("uncaught-exception", { message: getErrorMessage(error) });
  errorLog(`Error no capturado: ${getErrorMessage(error)}`);
  void shutdown("uncaught-exception", 1);
});

async function pollQueue() {
  if (polling) {
    return;
  }

  polling = true;

  try {
    const jobs = await fetchJobs();

    if (jobs.length === 0) {
      writeStatus("idle", { jobs: 0 });
      log("Sin trabajos pendientes.");
      return;
    }

    writeStatus("processing", { jobs: jobs.length });
    log(`Trabajos encontrados: ${jobs.length}`);

    for (const job of jobs) {
      await processJob(job);
      await sleep(sendDelayMs);
    }
  } catch (error) {
    writeStatus("error", { message: getErrorMessage(error) });
    errorLog(`No se pudo consultar/procesar la cola: ${getErrorMessage(error)}`);
  } finally {
    polling = false;
  }
}

async function fetchJobs() {
  const url = new URL("/api/bot/whatsapp-reminders/jobs", appUrl);
  url.searchParams.set("limit", String(batchLimit));

  const response = await fetch(url, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    const message = await response.text();

    throw new Error(`La app respondio ${response.status}: ${message}`);
  }

  const data = await response.json();

  return Array.isArray(data.jobs) ? data.jobs : [];
}

async function processJob(job) {
  const phone = normalizePhone(job.phone);

  if (!phone) {
    await updateJob(job.id, "failed", "Telefono invalido.");
    return;
  }

  try {
    if (dryRun) {
      log(`[DRY_RUN] ${phone} ${job.playerName} ${job.message}`);
      return;
    } else {
      await client.sendMessage(`${phone}@c.us`, job.message);
    }

    await updateJob(job.id, "sent");
    writeStatus("sent", {
      phone,
      playerId: job.playerId,
      playerName: job.playerName,
      period: job.period,
    });
    log(`Enviado: ${job.period} ${job.playerName} ${phone}`);
  } catch (error) {
    const message = getErrorMessage(error);

    await updateJob(job.id, "failed", message);
    writeStatus("failed", {
      message,
      playerId: job.playerId,
      playerName: job.playerName,
      period: job.period,
    });
    errorLog(`Fallo: ${job.period} ${job.playerName} ${message}`);
  }
}

async function updateJob(reminderId, status, error) {
  const response = await fetch(new URL("/api/bot/whatsapp-reminders/jobs", appUrl), {
    body: JSON.stringify({ error, reminderId, status }),
    headers: {
      ...authHeaders(),
      "content-type": "application/json",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`No se pudo actualizar ${reminderId}: ${await response.text()}`);
  }
}

async function inspectStartupPage() {
  if (ready || !client.pupPage) {
    return;
  }

  try {
    const pageText = await client.pupPage.evaluate(
      () => document.body?.innerText?.slice(0, 1200) ?? "",
    );
    const normalizedText = pageText.replace(/\s+/g, " ").trim();

    if (
      normalizedText.includes("Escanea para iniciar sesión") ||
      normalizedText.includes("Escanea el código QR")
    ) {
      if (qrFallbackReported) {
        return;
      }

      qrFallbackReported = true;
      clearTimeout(readyTimeout);

      writeStatus("qr", {
        message: headless
          ? "La sesion de WhatsApp vencio. Reinicia el bot en modo visible para escanear QR."
          : "WhatsApp necesita escanear QR en la ventana abierta por el bot.",
      });
      log(
        headless
          ? "WhatsApp pide QR. Ejecuta el bot con WHATSAPP_BOT_HEADLESS=false para vincularlo."
          : "WhatsApp pide QR. Escanea la ventana abierta por el bot.",
      );

      if (headless) {
        void shutdown("qr-headless", 1);
      }
    }
  } catch (error) {
    errorLog(`No pude inspeccionar la pantalla inicial: ${getErrorMessage(error)}`);
  }
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith(defaultCountryCode) || digits.length > 11) {
    return digits;
  }

  return `${defaultCountryCode}${digits.replace(/^0+/, "")}`;
}

function authHeaders() {
  return {
    authorization: `Bearer ${runnerSecret}`,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearTimeout(readyTimeout);
  clearInterval(startupInspector);
  writeStatus("stopping", { reason });
  log(`Cerrando bot: ${reason}`);

  try {
    if (client.pupBrowser?.isConnected?.()) {
      await client.pupBrowser.close();
    }
  } catch (error) {
    errorLog(`No pude cerrar Chrome limpiamente: ${getErrorMessage(error)}`);
  }

  process.exit(exitCode);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }

  return value;
}

function readPositiveNumber(name, fallback) {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value) {
  return ["1", "true", "si", "sí", "yes"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function getBrowserExecutablePath() {
  if (parseBoolean(process.env.WHATSAPP_BOT_USE_PUPPETEER_BROWSER)) {
    return undefined;
  }

  const configuredPath = process.env.WHATSAPP_BOT_BROWSER_PATH?.trim();

  if (configuredPath) {
    return configuredPath;
  }

  if (process.platform !== "darwin") {
    return undefined;
  }

  return [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    path.join(
      process.env.HOME ?? "",
      "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ),
  ].find((candidate) => fs.existsSync(candidate));
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function cleanupStaleBrowserLocks(profilePath) {
  if (parseBoolean(process.env.WHATSAPP_BOT_SKIP_LOCK_CLEANUP)) {
    return;
  }

  for (const lockFile of [
    "SingletonLock",
    "SingletonSocket",
    "SingletonCookie",
    "DevToolsActivePort",
    "RunningChromeVersion",
  ]) {
    const target = path.join(profilePath, lockFile);

    if (!fs.existsSync(target)) {
      continue;
    }

    try {
      fs.rmSync(target, { force: true, recursive: true });
      log(`Lock viejo removido: ${target}`);
    } catch (error) {
      errorLog(`No pude remover lock viejo ${target}: ${getErrorMessage(error)}`);
    }
  }
}

function log(message) {
  console.log(`${new Date().toISOString()} ${message}`);
}

function errorLog(message) {
  console.error(`${new Date().toISOString()} ${message}`);
}

function writeStatus(status, extra = {}) {
  const payload = {
    ...extra,
    status,
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(statusFile, `${JSON.stringify(payload, null, 2)}\n`);
  } catch {
    // El status es diagnostico; el bot puede seguir aunque no pueda escribirlo.
  }
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Error desconocido.";
}
