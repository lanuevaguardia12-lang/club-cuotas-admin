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

1. Abrí `bot/whatsapp/Iniciar Bot WhatsApp.app`.
2. Se abre Google Chrome con WhatsApp Web.
3. Si aparece QR, escanealo desde WhatsApp.
4. El bot queda consultando la cola en segundo plano.

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
- `WHATSAPP_BOT_BROWSER_PATH`: ruta opcional del navegador. En macOS detecta
  Google Chrome automaticamente si esta instalado.

## Importante

La Mac puede estar bloqueada, pero no dormida. Si entra en reposo, el bot deja de
consultar y no manda mensajes hasta que la vuelvas a despertar.
