# Bot local de WhatsApp

Este bot corre en tu Mac/PC y consulta la cola creada por el boton
`Correr bot recordatorios`.

## Como funciona

1. En la app, el admin selecciona el mes en Home y toca `Correr bot recordatorios`.
2. La app deja en cola los jugadores pendientes de ese mes.
3. Este bot consulta la cola cada algunos segundos.
4. WhatsApp Web manda los mensajes uno por uno.
5. El bot marca cada recordatorio como `sent` o `failed`.

La cola solo toma jugadores no pagados del mes elegido en la app, con cuota del
calculador definida y monto final mayor a cero.

La sesion de WhatsApp queda guardada en `.wwebjs_auth`. Si cambias de PC, esa PC
va a pedir QR propio.

## Instalacion

```bash
cd bot/whatsapp
cp .env.example .env
npm install
npm start
```

En macOS tambien podes iniciar el bot sin escribir en la terminal:

1. Abrí `bot/whatsapp/Iniciar Bot WhatsApp.app` una vez para que macOS registre
   el launcher.
2. Desde la app web, tocá `Correr bot recordatorios`.
3. La web intenta abrir el launcher automáticamente. Si el navegador lo bloquea,
   tocá `Abrir bot local`.
4. Se abre la ventana de WhatsApp Web controlada por el bot.
5. Si aparece QR, escanealo desde WhatsApp.
6. El bot queda consultando la cola en segundo plano.

Si necesitás regenerar el launcher:

```bash
cd bot/whatsapp
./create-macos-launcher.sh
```

### Sin abrir ningun archivo cada vez

La opcion mas comoda es instalar el bot como servicio de inicio de macOS. Se hace
una sola vez:

```bash
cd bot/whatsapp
./install-macos-autostart.sh
```

Desde ese momento el bot arranca solo cuando iniciás sesión en la Mac y queda
consultando la cola. En la app web solo tocás `Correr bot recordatorios`; no hace
falta abrir el launcher ni una terminal. Usá esta opción después de haber
escaneado el QR al menos una vez con el modo visible.

Para desinstalarlo:

```bash
cd bot/whatsapp
./uninstall-macos-autostart.sh
```

La primera vez se abre una ventana de WhatsApp Web con el QR. Escanealo desde
WhatsApp:

```text
WhatsApp > Dispositivos vinculados > Vincular un dispositivo
```

## Variables

- `CLUB_APP_URL`: URL de Vercel, por ejemplo
  `https://club-cuotas-admin.vercel.app`.
- `WHATSAPP_BOT_RUNNER_SECRET`: mismo valor cargado en Vercel.
- `WHATSAPP_BOT_DEFAULT_COUNTRY_CODE`: `549` para Argentina.
- `WHATSAPP_BOT_DRY_RUN`: `true` para probar sin mandar mensajes.
- `WHATSAPP_BOT_SEND_DELAY_MS`: `60000` deja 1 minuto entre chat y chat.
- `WHATSAPP_BOT_HEADLESS`: `false` abre WhatsApp Web visible para escanear el QR;
  `true` lo deja en segundo plano y muestra el QR en la terminal.
- `WHATSAPP_BOT_BROWSER_PATH`: ruta opcional del navegador. En macOS, si se deja
  vacía, usa Google Chrome instalado porque WhatsApp Web rechaza algunos
  navegadores internos de Puppeteer.
- `WHATSAPP_BOT_USE_PUPPETEER_BROWSER`: `true` fuerza el navegador interno de
  Puppeteer. No es lo recomendado para WhatsApp Web.
- `WHATSAPP_BOT_USER_AGENT`: User-Agent opcional. Por defecto usa uno compatible
  con WhatsApp Web.
- `WHATSAPP_BOT_READY_TIMEOUT_MS`: tiempo máximo de espera para que WhatsApp Web
  llegue a listo. Por defecto son `120000` milisegundos.
- `WHATSAPP_BOT_CLIENT_ID`: nombre de la sesión local. Por defecto usa
  `club-cuotas-reminders-v2`.

## Importante

La Mac puede estar bloqueada, pero no dormida. Si entra en reposo, el bot deja de
consultar y no manda mensajes hasta que la vuelvas a despertar.
