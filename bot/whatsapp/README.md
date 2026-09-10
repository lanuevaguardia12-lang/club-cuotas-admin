# Bot local de WhatsApp

Este bot corre en tu Mac/PC y consulta la cola creada por el boton
`Correr bot recordatorios`.

## Como funciona

1. En la app, el admin selecciona el mes en Home y toca
   `Abrir WhatsApp y correr bot`.
2. La web intenta abrir el launcher local y la app deja en cola los jugadores
   pendientes de ese mes.
3. El launcher abre Google Chrome con WhatsApp Web.
4. Si aparece QR, lo escaneas desde WhatsApp y el bot espera sin cerrar Chrome.
5. WhatsApp Web manda los mensajes uno por uno, con 1 minuto y 30 segundos entre
   cada chat.
6. El bot marca cada recordatorio como `processing`, `sent` o `failed`.

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
2. Desde la app web, tocá `Abrir WhatsApp y correr bot`.
3. La web intenta abrir el launcher automaticamente. Si el navegador lo bloquea,
   toca `Reintentar abrir bot local`.
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
consultando la cola. En la app web solo tocas `Abrir WhatsApp y correr bot`; no hace
falta abrir el launcher ni una terminal. Usa esta opcion despues de haber
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

### Windows

En Windows, la forma recomendada es usar el boton `Instalar bot Windows` de la
app. Ese boton descarga un instalador `.cmd` para la computadora donde estas
trabajando.

Ejecutalo una sola vez. El instalador:

1. Instala Node.js LTS con `winget` si no lo encuentra.
2. Instala Google Chrome con `winget` si no lo encuentra.
3. Copia el bot local en `%LOCALAPPDATA%\LaNuevaGuardia\WhatsAppBot`.
4. Configura el archivo `.env` con la URL de la app y el secret del bot.
5. Registra el protocolo `lng-whatsapp-bot://start`.

Cuando termine, volve a la app y toca `Abrir WhatsApp y correr bot`. La primera
vez Windows puede pedir confirmar el enlace y WhatsApp puede pedir escanear QR.

## Variables

- `CLUB_APP_URL`: URL de Vercel, por ejemplo
  `https://club-cuotas-admin.vercel.app`.
- `WHATSAPP_BOT_RUNNER_SECRET`: mismo valor cargado en Vercel.
- `WHATSAPP_BOT_DEFAULT_COUNTRY_CODE`: `549` para Argentina.
- `WHATSAPP_BOT_DRY_RUN`: `true` para probar sin mandar mensajes.
- `WHATSAPP_BOT_SEND_DELAY_MS`: `90000` deja 1 minuto y 30 segundos entre chat
  y chat.
- `WHATSAPP_BOT_HEADLESS`: `false` abre WhatsApp Web visible para escanear el QR;
  `true` lo deja en segundo plano y muestra el QR en la terminal.
- `WHATSAPP_BOT_BROWSER_PATH`: ruta opcional del navegador. En macOS, si se deja
  vacía, usa Google Chrome instalado porque WhatsApp Web rechaza algunos
  navegadores internos de Puppeteer.
- `WHATSAPP_BOT_USE_PUPPETEER_BROWSER`: `true` fuerza el navegador interno de
  Puppeteer. No es lo recomendado para WhatsApp Web.
- `WHATSAPP_BOT_USER_AGENT`: User-Agent opcional. Por defecto usa uno compatible
  con WhatsApp Web.
- `WHATSAPP_BOT_READY_TIMEOUT_MS`: tiempo maximo de espera para que WhatsApp Web
  llegue a listo. Por defecto son `3600000` milisegundos en modo visible y
  `120000` en modo headless. Si el modo visible tarda mas, Chrome queda abierto
  y el bot sigue esperando.
- `WHATSAPP_BOT_SEND_READY_TIMEOUT_MS`: tiempo maximo de espera antes de enviar
  cada mensaje si WhatsApp Web esta recargando o todavia no termino de cargar el
  chat. Por defecto son `3600000` milisegundos en modo visible.
- `WHATSAPP_BOT_STARTUP_STABLE_DELAY_MS`: pausa despues de `ready` antes de
  consultar la cola. Por defecto son `15000` milisegundos.
- `WHATSAPP_BOT_PROTOCOL_TIMEOUT_MS`: tiempo maximo de espera del canal interno
  de Chrome/Puppeteer. Por defecto son `3600000` milisegundos para evitar
  errores como `Runtime.callFunctionOn timed out`.
- `WHATSAPP_BOT_CLIENT_ID`: nombre de la sesión local. Por defecto usa
  `club-cuotas-reminders-v2`.

## Importante

La Mac puede estar bloqueada, pero no dormida. Si entra en reposo, el bot deja de
consultar y no manda mensajes hasta que la vuelvas a despertar.
