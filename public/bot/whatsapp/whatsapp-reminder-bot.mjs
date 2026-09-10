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
const sendDelayMs = readPositiveNumber("WHATSAPP_BOT_SEND_DELAY_MS", 90_000);
const defaultCountryCode = process.env.WHATSAPP_BOT_DEFAULT_COUNTRY_CODE ?? "549";
const dryRun = parseBoolean(process.env.WHATSAPP_BOT_DRY_RUN);
const headless = parseBoolean(process.env.WHATSAPP_BOT_HEADLESS);
const readyTimeoutMs = readPositiveNumber(
  "WHATSAPP_BOT_READY_TIMEOUT_MS",
  headless ? 120_000 : 3_600_000,
);
const sendReadyTimeoutMs = readPositiveNumber(
  "WHATSAPP_BOT_SEND_READY_TIMEOUT_MS",
  headless ? 120_000 : 3_600_000,
);
const sendReadyCheckIntervalMs = readPositiveNumber(
  "WHATSAPP_BOT_SEND_READY_CHECK_INTERVAL_MS",
  5_000,
);
const startupStableDelayMs = readPositiveNumber(
  "WHATSAPP_BOT_STARTUP_STABLE_DELAY_MS",
  15_000,
);
const protocolTimeoutMs = readPositiveNumber(
  "WHATSAPP_BOT_PROTOCOL_TIMEOUT_MS",
  3_600_000,
);
const browserExecutablePath = getBrowserExecutablePath();
const whatsappUserAgent =
  process.env.WHATSAPP_BOT_USER_AGENT?.trim() || getDefaultUserAgent();
const statusFile = path.resolve(
  __dirname,
  process.env.WHATSAPP_BOT_STATUS_FILE ?? "./whatsapp-bot-status.json",
);
const clientId = process.env.WHATSAPP_BOT_CLIENT_ID?.trim() || "club-cuotas-reminders-v2";
const sessionPath = path.resolve(
  __dirname,
  process.env.WHATSAPP_SESSION_PATH ?? "./.wwebjs_auth",
);
const browserSessionPath = path.join(sessionPath, `session-${clientId}`);
let polling = false;
let ready = false;
let qrFallbackReported = false;
let shuttingDown = false;
let queuePollInterval = null;

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
    protocolTimeout: protocolTimeoutMs,
  },
  userAgent: whatsappUserAgent,
});

const readyTimeout = setTimeout(() => {
  if (ready) {
    return;
  }

  if (!headless) {
    writeStatus("startup-waiting", {
      message: `WhatsApp todavia no llego a listo despues de ${readyTimeoutMs}ms. Dejo Chrome abierto y sigo esperando.`,
    });
    errorLog(
      `WhatsApp no llego a listo en ${readyTimeoutMs}ms. Dejo Chrome abierto y sigo esperando.`,
    );
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
  protocolTimeoutMs,
  sendDelayMs,
  sendReadyTimeoutMs,
  startupStableDelayMs,
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
  log(
    `Bot de WhatsApp listo. Espero ${startupStableDelayMs} ms y consulto trabajos cada ${pollIntervalMs} ms.`,
  );
  setTimeout(() => {
    if (shuttingDown) {
      return;
    }

    pollQueue();
    queuePollInterval = setInterval(pollQueue, pollIntervalMs);
  }, startupStableDelayMs);
});

client.on("change_state", (state) => {
  writeStatus("state-change", { state });
  log(`Estado de WhatsApp: ${state}`);
});

client.on("auth_failure", (message) => {
  ready = false;
  clearInterval(startupInspector);
  writeStatus("auth-failure", { message });
  errorLog(`Fallo la autenticacion de WhatsApp: ${message}`);
});

client.on("disconnected", (reason) => {
  ready = false;
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

  const locked = await markJobProcessing(job);

  if (!locked) {
    log(`Omitido: ${job.period} ${job.playerName} ya no estaba pendiente.`);
    return;
  }

  try {
    await waitForWhatsAppSendReady(job);

    if (dryRun) {
      log(`[DRY_RUN] ${phone} ${job.playerName} ${job.message}`);
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

    if (isRecoverableWhatsAppBrowserError(error)) {
      const retryMessage =
        "WhatsApp Web se recargo o todavia no termino de cargar el chat. Se reintenta en la proxima consulta.";

      await updateJob(job.id, "queued", retryMessage);
      writeStatus("send-waiting", {
        message: retryMessage,
        playerId: job.playerId,
        playerName: job.playerName,
        period: job.period,
      });
      throw new Error(`${retryMessage} Detalle: ${message}`);
    }

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

async function markJobProcessing(job) {
  const result = await updateJob(job.id, "processing", undefined, {
    allowConflict: true,
  });

  return !result.conflict;
}

async function updateJob(reminderId, status, error, options = {}) {
  const response = await fetch(new URL("/api/bot/whatsapp-reminders/jobs", appUrl), {
    body: JSON.stringify({ error, reminderId, status }),
    headers: {
      ...authHeaders(),
      "content-type": "application/json",
    },
    method: "PATCH",
  });

  if (response.status === 409 && options.allowConflict) {
    return { conflict: true };
  }

  if (!response.ok) {
    throw new Error(`No se pudo actualizar ${reminderId}: ${await response.text()}`);
  }

  const data = await response.json().catch(() => ({}));

  return { conflict: false, data };
}

async function waitForWhatsAppSendReady(job) {
  const startedAt = Date.now();
  let lastError = "";
  let lastState = "";

  while (Date.now() - startedAt <= sendReadyTimeoutMs) {
    if (shuttingDown) {
      throw new Error("El bot se esta cerrando.");
    }

    if (!ready) {
      lastState = "not-ready";
    } else {
      try {
        if (client.pupPage?.isClosed?.()) {
          throw new Error("La ventana de WhatsApp esta cerrada.");
        }

        const state = await client.getState();
        lastState = state || "unknown";

        if (state === "CONNECTED") {
          return;
        }
      } catch (error) {
        lastError = getErrorMessage(error);
      }
    }

    writeStatus("send-waiting", {
      error: lastError || undefined,
      message: `Esperando que WhatsApp Web este listo para abrir el chat de ${job.playerName}.`,
      playerId: job.playerId,
      playerName: job.playerName,
      period: job.period,
      state: lastState,
    });
    await sleep(sendReadyCheckIntervalMs);
  }

  throw new Error(
    lastError
      ? `WhatsApp Web no estuvo listo para enviar. Ultimo error: ${lastError}`
      : "WhatsApp Web no estuvo listo para enviar.",
  );
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
  clearInterval(queuePollInterval);
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

function isRecoverableWhatsAppBrowserError(error) {
  const message = getErrorMessage(error).toLowerCase();

  return [
    "cannot find context",
    "detached frame",
    "execution context was destroyed",
    "la ventana de whatsapp esta cerrada",
    "navigating frame was detached",
    "protocol error",
    "session closed",
    "target closed",
    "whatsapp web no estuvo listo",
  ].some((fragment) => message.includes(fragment));
}

function getBrowserExecutablePath() {
  if (parseBoolean(process.env.WHATSAPP_BOT_USE_PUPPETEER_BROWSER)) {
    return undefined;
  }

  const configuredPath = process.env.WHATSAPP_BOT_BROWSER_PATH?.trim();

  if (configuredPath) {
    return configuredPath;
  }

  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(
        process.env.HOME ?? "",
        "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ),
    ].find((candidate) => fs.existsSync(candidate));
  }

  if (process.platform === "win32") {
    return [
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")
        : "",
      process.env.PROGRAMFILES
        ? path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe")
        : "",
      process.env["PROGRAMFILES(X86)"]
        ? path.join(
            process.env["PROGRAMFILES(X86)"],
            "Google/Chrome/Application/chrome.exe",
          )
        : "",
    ].find((candidate) => candidate && fs.existsSync(candidate));
  }

  return undefined;
}

function getDefaultUserAgent() {
  if (process.platform === "win32") {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  }

  return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
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
    dryRun,
    headless,
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
