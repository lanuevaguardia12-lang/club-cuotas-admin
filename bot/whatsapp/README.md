# Bot local de WhatsApp

Este bot corre en tu Mac/PC y consulta la cola creada por el boton
`Correr bot recordatorios`.

## Como funciona

1. En la app, el admin selecciona el mes en Home y toca `Correr bot recordatorios`.
2. La app deja en cola los jugadores pendientes de ese mes.
3. Este bot consulta la cola cada algunos segundos.
4. WhatsApp Web manda los mensajes uno por uno.
5. El bot marca cada recordatorio como `sent` o `failed`.

La sesion de WhatsApp queda guardada en `.wwebjs_auth`. Si cambias de PC, esa PC
va a pedir QR propio.

## Instalacion

```bash
cd bot/whatsapp
cp .env.example .env
npm install
npm start
```

La primera vez aparece un QR en la terminal. Escanealo desde WhatsApp:

```text
WhatsApp > Dispositivos vinculados > Vincular un dispositivo
```

## Variables

- `CLUB_APP_URL`: URL de Vercel, por ejemplo
  `https://club-cuotas-admin.vercel.app`.
- `WHATSAPP_BOT_RUNNER_SECRET`: mismo valor cargado en Vercel.
- `WHATSAPP_BOT_DEFAULT_COUNTRY_CODE`: `549` para Argentina.
- `WHATSAPP_BOT_DRY_RUN`: `true` para probar sin mandar mensajes.
- `WHATSAPP_BOT_HEADLESS`: `false` abre WhatsApp Web visible; `true` lo deja
  en segundo plano.

## Importante

La Mac puede estar bloqueada, pero no dormida. Si entra en reposo, el bot deja de
consultar y no manda mensajes hasta que la vuelvas a despertar.
