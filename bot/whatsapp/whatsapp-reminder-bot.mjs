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
const sendDelayMs = readPositiveNumber("WHATSAPP_BOT_SEND_DELAY_MS", 4_000);
const defaultCountryCode = process.env.WHATSAPP_BOT_DEFAULT_COUNTRY_CODE ?? "549";
const dryRun = parseBoolean(process.env.WHATSAPP_BOT_DRY_RUN);
const headless = parseBoolean(process.env.WHATSAPP_BOT_HEADLESS);
const sessionPath = path.resolve(
  __dirname,
  process.env.WHATSAPP_SESSION_PATH ?? "./.wwebjs_auth",
);
let polling = false;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "club-cuotas-reminders",
    dataPath: sessionPath,
  }),
  puppeteer: {
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
    headless,
  },
});

client.on("qr", (qr) => {
  if (!headless) {
    console.log(
      "WhatsApp Web esta abierto. Escanea el QR desde esa ventana para iniciar sesion.",
    );
    return;
  }

  console.log("Escanea este QR con WhatsApp para iniciar sesion:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado. La sesion queda guardada en:", sessionPath);
});

client.on("ready", () => {
  console.log("Bot de WhatsApp listo. Consultando trabajos cada", pollIntervalMs, "ms.");
  pollQueue();
  setInterval(pollQueue, pollIntervalMs);
});

client.on("auth_failure", (message) => {
  console.error("Fallo la autenticacion de WhatsApp:", message);
});

client.on("disconnected", (reason) => {
  console.error("WhatsApp se desconecto:", reason);
});

client.initialize();

async function pollQueue() {
  if (polling) {
    return;
  }

  polling = true;

  try {
    const jobs = await fetchJobs();

    if (jobs.length === 0) {
      console.log("Sin trabajos pendientes.");
      return;
    }

    console.log(`Trabajos encontrados: ${jobs.length}`);

    for (const job of jobs) {
      await processJob(job);
      await sleep(sendDelayMs);
    }
  } catch (error) {
    console.error("No se pudo consultar/procesar la cola:", error);
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
      console.log("[DRY_RUN]", phone, job.playerName, job.message);
    } else {
      await client.sendMessage(`${phone}@c.us`, job.message);
    }

    await updateJob(job.id, "sent");
    console.log("Enviado:", job.period, job.playerName, phone);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";

    await updateJob(job.id, "failed", message);
    console.error("Fallo:", job.period, job.playerName, message);
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
