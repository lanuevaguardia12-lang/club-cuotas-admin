import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json(
      { message: "Solo un administrador puede instalar el bot de Windows." },
      { status: 403 },
    );
  }

  const runnerSecret =
    process.env.WHATSAPP_BOT_RUNNER_SECRET?.trim() ||
    process.env.WHATSAPP_BOT_WEBHOOK_SECRET?.trim() ||
    "";

  if (!runnerSecret) {
    return NextResponse.json(
      {
        message:
          "Falta configurar WHATSAPP_BOT_RUNNER_SECRET en Vercel antes de descargar el instalador.",
      },
      { status: 500 },
    );
  }

  const appUrl = getAppUrl(request);
  const cmd = buildWindowsInstallerCommand({
    appUrl,
    runnerSecret,
  });

  return new NextResponse(cmd, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="instalar-bot-whatsapp-windows.cmd"',
      "content-type": "application/octet-stream; charset=utf-8",
    },
  });
}

function getAppUrl(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
  }

  return new URL(request.url).origin.replace(/\/$/, "");
}

function buildWindowsInstallerCommand({
  appUrl,
  runnerSecret,
}: {
  appUrl: string;
  runnerSecret: string;
}) {
  const appUrlBase64 = Buffer.from(appUrl, "utf8").toString("base64");
  const runnerSecretBase64 = Buffer.from(runnerSecret, "utf8").toString("base64");

  return [
    "@echo off",
    "setlocal",
    "title Instalar Bot WhatsApp LNG",
    `set "APP_URL_B64=${appUrlBase64}"`,
    `set "RUNNER_SECRET_B64=${runnerSecretBase64}"`,
    'set "INSTALLER=%TEMP%\\instalar-bot-whatsapp-lng.ps1"',
    "echo.",
    "echo Descargando instalador de Windows...",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $u = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%APP_URL_B64%')); Invoke-WebRequest -UseBasicParsing -Uri ($u.TrimEnd('/') + '/bot/whatsapp/install-windows.ps1') -OutFile $env:INSTALLER"`,
    "if errorlevel 1 (",
    "  echo.",
    "  echo No pude descargar el instalador. Revisa internet y volve a intentar.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo.",
    "echo Instalando bot local...",
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%" -AppUrlBase64 "%APP_URL_B64%" -RunnerSecretBase64 "%RUNNER_SECRET_B64%"',
    "if errorlevel 1 (",
    "  echo.",
    "  echo La instalacion no termino correctamente.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo.",
    "echo Instalacion completa. Volve a la app y toca Abrir WhatsApp y correr bot.",
    "pause",
    "",
  ].join("\r\n");
}
