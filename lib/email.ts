import "server-only";

import tls from "node:tls";

interface SendPlainEmailInput {
  cc?: string[];
  subject: string;
  text: string;
  to: string;
}

export async function sendPlainEmail({
  cc = [],
  subject,
  text,
  to,
}: SendPlainEmailInput) {
  const user = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const fromName = process.env.EMAIL_FROM_NAME ?? "La Nueva Guardia";

  if (!user) {
    throw new Error("Falta configurar GMAIL_USER para enviar correos.");
  }

  if (!appPassword) {
    throw new Error("Falta configurar GMAIL_APP_PASSWORD para enviar correos.");
  }

  await sendWithGmailSmtp({
    cc,
    from: user,
    fromName,
    password: appPassword,
    subject,
    text,
    to,
    user,
  });
}

interface GmailSmtpInput extends SendPlainEmailInput {
  from: string;
  fromName: string;
  password: string;
  user: string;
}

async function sendWithGmailSmtp({
  cc = [],
  from,
  fromName,
  password,
  subject,
  text,
  to,
  user,
}: GmailSmtpInput) {
  const client = tls.connect({
    host: "smtp.gmail.com",
    port: 465,
    servername: "smtp.gmail.com",
  });

  try {
    await waitForSmtpCode(client, 220);
    await smtpCommand(client, `EHLO ${getMailDomain(from)}`, 250);
    await smtpCommand(client, "AUTH LOGIN", 334);
    await smtpCommand(client, Buffer.from(user).toString("base64"), 334);
    await smtpCommand(client, Buffer.from(password).toString("base64"), 235);
    await smtpCommand(client, `MAIL FROM:<${from}>`, 250);
    const recipients = [to, ...cc].map((email) => email.trim()).filter(Boolean);

    for (const recipient of recipients) {
      await smtpCommand(client, `RCPT TO:<${recipient}>`, [250, 251]);
    }

    await smtpCommand(client, "DATA", 354);
    await smtpCommand(
      client,
      buildRawEmail({ cc, from, fromName, subject, text, to }),
      250,
    );
    await smtpCommand(client, "QUIT", 221);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";

    throw new Error(`No se pudo enviar el correo con Gmail. ${message}`);
  } finally {
    client.destroy();
  }
}

function buildRawEmail({
  cc = [],
  from,
  fromName,
  subject,
  text,
  to,
}: Omit<GmailSmtpInput, "password" | "user">) {
  const encodedSubject = encodeHeader(subject);
  const encodedFromName = encodeHeader(fromName);
  const safeText = text.replace(/\r?\n/g, "\r\n");

  return [
    `From: ${encodedFromName} <${from}>`,
    `To: <${to}>`,
    ...(cc.length > 0 ? [`Cc: ${cc.map((email) => `<${email}>`).join(", ")}`] : []),
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    safeText,
    ".",
  ].join("\r\n");
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function getMailDomain(email: string) {
  return email.split("@")[1] ?? "localhost";
}

function waitForSmtpCode(socket: tls.TLSSocket, expectedCodes: number | number[]) {
  return new Promise<string>((resolve, reject) => {
    let response = "";

    const onData = (chunk: Buffer) => {
      response += chunk.toString("utf8");

      if (!hasCompleteSmtpResponse(response)) {
        return;
      }

      cleanup();
      const code = Number(response.slice(0, 3));
      const validCodes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];

      if (validCodes.includes(code)) {
        resolve(response);
        return;
      }

      reject(new Error(`SMTP respondió ${response.trim()}`));
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function smtpCommand(
  socket: tls.TLSSocket,
  command: string,
  expectedCodes: number | number[],
) {
  const responsePromise = waitForSmtpCode(socket, expectedCodes);
  socket.write(`${command}\r\n`);
  return responsePromise;
}

function hasCompleteSmtpResponse(response: string) {
  const lines = response.split(/\r?\n/).filter(Boolean);
  const lastLine = lines.at(-1);

  return Boolean(lastLine && /^\d{3}\s/.test(lastLine));
}
