# Club Cuotas Admin

Aplicacion web productiva para administrar cuotas, jugadores, cobranzas y cash
flow de un club deportivo.

La app es mobile first, responsive para escritorio, consume datos desde una capa
abstracta `IDataService` y esta preparada para migrar de Google Sheets a
PostgreSQL sin modificar la interfaz.

## Stack

- Next.js 15 con App Router
- React 19
- TypeScript
- TailwindCSS 4
- shadcn/ui
- React Hook Form
- Zod
- Lucide React
- TanStack Table
- next-themes para modo claro y oscuro
- JWT con cookie `httpOnly` para autenticacion
- ESLint
- Prettier
- GitHub Actions
- Vercel
- PWA con manifest, service worker, iconos y favicons

## Identidad visual

- Logo institucional: `public/brand/escudo-la-nueva-guardia.png`.
- Color primario: `#012F77`.
- Color secundario: `#0094DC`.
- Color de alerta: `#C10202`.
- Color destacado: `#F4CE0F`.

El escudo se usa como logo por defecto en la interfaz, metadata social, favicon
y PWA. Si la hoja `Configuracion` no define `logo_url`, la aplicacion usa este
logo institucional como fallback.

## Estructura

```text
app/
  (dashboard)/
    cash-flow/
    fee-calculator/
    layout.tsx
    page.tsx
    players/
      [playerId]/
    reports/
    settings/
    users/
  api/
    auth/
      logout/
  globals.css
  layout.tsx
  login/
  manifest.ts
  robots.ts
  sitemap.ts
components/
  auth/
  cash-flow/
  fee-calculator/
  layout/
  providers/
  reminders/
  settings/
  ui/
hooks/
lib/
  auth/
public/
  brand/
  favicon.svg
  icons/
  sw.js
services/
  auth/
  DatabaseService.ts
  GoogleSheetsService.ts
  IDataService.ts
  data-service.ts
types/
utils/
.github/
  workflows/
    ci.yml
    vercel.yml
```

## Funcionalidades incluidas

- Layout responsive mobile first.
- Navbar superior.
- Sidebar fijo en escritorio.
- Sidebar mobile con panel lateral.
- Modo claro y oscuro.
- Login con usuario administrador.
- Credenciales tomadas desde variables de entorno.
- JWT firmado con `AUTH_SECRET`.
- Cookie de sesion `httpOnly`, `sameSite=lax` y `secure` en produccion.
- Proteccion server-side de rutas privadas con redireccion a `/login`.
- Roles `Administrador`, `Tesorero` y `Profesor` con permisos RBAC.
- Capa `UserStore` preparada para multiples usuarios por `AUTH_USERS_JSON`.
- Dashboard avanzado consumiendo datos desde `IDataService`.
- Indicadores de jugadores, morosidad, ingresos, comparativa anual, altas y bajas.
- Graficos interactivos con Recharts.
- Seccion Cash Flow con ingresos, gastos, balance, saldo y graficos.
- Seccion Calculador de cuota con costos por vigencia, costos fijos, canchas
  reales, politica de devoluciones, partidos jugados y cuota final por jugador.
- Exportacion de jugadores, cuotas, ingresos y cash flow.
- Formatos de exportacion: Excel, CSV y PDF.
- Tabla profesional de jugadores con TanStack Table.
- Busqueda, filtros, ordenamiento, paginacion y vista mobile responsive.
- Badges de estado: `Pagó`, `Debe`, `Pendiente`.
- Ficha de jugador con historial completo y los 12 meses del año.
- Actualizacion de estado mensual `Pagado` / `Impago` desde server actions.
- Boton `Enviar recordatorio` con WhatsApp y mensaje configurable.
- Panel de configuracion para nombre del club, logo, WhatsApp, cuota, color y
  modo oscuro.
- Configuracion validada con React Hook Form y Zod.
- Historial de cambios y logs mediante panel de auditoria.
- Notificaciones internas con estado leido/no leido.
- Recordatorios automaticos en cola mediante Vercel Cron.
- Integracion preparada con Mercado Pago Checkout Pro.
- Integracion preparada con Stripe Checkout.
- API REST protegida con sesion o `API_SECRET`.
- Webhooks para Mercado Pago y Stripe con validacion de firma.
- `GoogleSheetsService` con Service Account, cache y manejo de errores.
- Capa abstracta `IDataService` preparada para reemplazar Google Sheets por PostgreSQL.
- Ruta placeholder para administracion futura de usuarios.
- Componentes base shadcn/ui: `Button`, `Card`, `Sheet`.
- Alias `@/*` apuntando a la raiz del proyecto.
- Lazy loading y code splitting para graficos y tablas pesadas.
- SEO tecnico con metadata, Open Graph, Twitter Card, robots y sitemap.
- PWA con `manifest.webmanifest`, service worker, iconos y favicons.
- Headers de seguridad y cache para assets estaticos.
- Configuracion lista para Vercel.
- CI de GitHub con formato, lint, typecheck, auditoria y build.
- Deploy automatico a Vercel desde GitHub Actions.
- Dependabot para npm y GitHub Actions.

## Requisitos

- Node.js 20 o superior
- npm

La version recomendada esta fijada en `.nvmrc`.

## Instalacion

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abrir:

```text
http://localhost:3000
```

## Variables de entorno

```bash
NEXT_PUBLIC_APP_NAME="La Nueva Guardia"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SITE_INDEXABLE=false
NEXT_PUBLIC_PWA_ENABLED=true
NEXT_PUBLIC_REMINDER_TEMPLATE="Buenas {nombre}, ¿cómo estás? Porfa acordate de pagar la cuota de {mes}.\nEl monto es {monto}.\nY completar el formulario! https://forms.gle/FFmGxDKRM4UNhM5h6"
NEXT_PUBLIC_DEFAULT_MONTHLY_FEE=0
NEXT_PUBLIC_PRIMARY_COLOR="#012f77"
DATA_SOURCE="google-sheets"

AUTH_SECRET="replace-with-a-long-random-secret"
AUTH_SESSION_MAX_AGE_SECONDS=28800
ADMIN_USERNAME="replace-with-admin-username"
ADMIN_PASSWORD="replace-with-a-strong-password"
ADMIN_NAME="replace-with-admin-display-name"
AUTH_USERS_JSON='[{"id":"admin","username":"admin","password":"replace-with-a-strong-password","name":"Administrador","role":"admin"},{"id":"tesorero","username":"tesorero","password":"replace-with-a-strong-password","name":"Tesorero","role":"treasurer"},{"id":"profesor","username":"profesor","password":"replace-with-a-strong-password","name":"Profesor","role":"coach"}]'

API_SECRET="replace-with-a-long-random-api-secret"
CRON_SECRET="replace-with-a-long-random-cron-secret"

MERCADO_PAGO_ACCESS_TOKEN="replace-with-mercado-pago-access-token"
MERCADO_PAGO_WEBHOOK_SECRET="replace-with-mercado-pago-webhook-secret"
MERCADO_PAGO_CURRENCY="ARS"
STRIPE_SECRET_KEY="replace-with-stripe-secret-key"
STRIPE_WEBHOOK_SECRET="replace-with-stripe-webhook-secret"
STRIPE_AMOUNT_MULTIPLIER=100

GOOGLE_SHEETS_SPREADSHEET_ID="replace-with-spreadsheet-id"
GOOGLE_SHEETS_CLIENT_EMAIL="replace-with-service-account-email"
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nreplace-with-private-key\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_PLAYERS_RANGE="Jugadores!A:Z"
GOOGLE_SHEETS_FEES_RANGE="Cuotas!A:Z"
GOOGLE_SHEETS_CASH_FLOW_RANGE="CashFlow!A:Z"
GOOGLE_SHEETS_SETTINGS_RANGE="Configuracion!A:B"
GOOGLE_SHEETS_AUDIT_RANGE="Auditoria!A:Z"
GOOGLE_SHEETS_LOGS_RANGE="Logs!A:Z"
GOOGLE_SHEETS_NOTIFICATIONS_RANGE="Notificaciones!A:Z"
GOOGLE_SHEETS_REMINDERS_RANGE="Recordatorios!A:Z"
GOOGLE_SHEETS_PAYMENTS_RANGE="Pagos!A:Z"
GOOGLE_SHEETS_FEE_CALCULATOR_COSTS_RANGE="CalculadoraCostos!A:Z"
GOOGLE_SHEETS_FEE_CALCULATOR_ACTUALS_RANGE="CalculadoraReales!A:Z"
GOOGLE_SHEETS_REFUND_POLICY_RANGE="Politica devoluciones!A:C"
GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID="replace-with-matches-spreadsheet-id"
GOOGLE_SHEETS_MATCHES_RANGE="Partidos jugados formulario!A:Z"
GOOGLE_SHEETS_CACHE_TTL_SECONDS=300
```

No subir archivos `.env.local` ni credenciales al repositorio.

Para generar `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

### Entornos

- Desarrollo local: copiar `.env.example` a `.env.local`.
- Produccion: usar `.env.production.example` como referencia y cargar las
  variables reales en Vercel.
- GitHub Actions: las credenciales de Vercel se cargan como secrets del
  repositorio, no como variables `.env`.

Variables publicas:

- `NEXT_PUBLIC_APP_NAME`: nombre visible de la app.
- `NEXT_PUBLIC_APP_URL`: URL canonica usada por metadata, sitemap y robots.
- `NEXT_PUBLIC_SITE_INDEXABLE`: `false` por defecto para un panel privado.
  Cambiar a `true` solo si se desea permitir indexacion publica.
- `NEXT_PUBLIC_PWA_ENABLED`: activa o desactiva el registro del service worker.
- `NEXT_PUBLIC_REMINDER_TEMPLATE`: plantilla inicial para WhatsApp.
- `NEXT_PUBLIC_DEFAULT_MONTHLY_FEE`: valor de cuota por defecto.
- `NEXT_PUBLIC_PRIMARY_COLOR`: color principal usado por metadata y manifest.

Variables privadas:

- `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME`,
  `AUTH_USERS_JSON`.
- `API_SECRET`, `CRON_SECRET`.
- `MERCADO_PAGO_*`, `STRIPE_*`.
- `GOOGLE_SHEETS_*`.
- `DATA_SOURCE`.

## Autenticacion

La autenticacion usa JWT firmado con `jose` y guardado en una cookie `httpOnly`.

Flujo:

1. El usuario entra a `/login`.
2. El server action valida `AUTH_USERS_JSON` y/o `ADMIN_USERNAME` +
   `ADMIN_PASSWORD`.
3. Si las credenciales son correctas, se crea un JWT.
4. El JWT se guarda en `dashboard_session`.
5. El layout server-side protege todas las rutas privadas.
6. Si no hay sesion valida, redirige a `/login?redirectTo=...`.

Roles soportados:

- `admin`: Administrador, acceso total.
- `treasurer`: Tesorero, acceso financiero, pagos, reportes y auditoria.
- `coach`: Profesor, acceso operativo a jugadores, cuotas y recordatorios.

Los permisos se definen en `lib/auth/roles.ts` y se usan en navegacion, paginas y
API REST. `AUTH_USERS_JSON` permite declarar multiples usuarios sin hardcodear
credenciales:

```json
[
  {
    "id": "tesorero",
    "username": "tesorero",
    "password": "usar-un-secreto-real",
    "name": "Tesorero",
    "role": "treasurer"
  }
]
```

Archivos principales:

- `app/login/page.tsx`
- `app/login/actions.ts`
- `app/(dashboard)/layout.tsx`
- `lib/auth/jwt.ts`
- `lib/auth/session.ts`
- `services/auth/user-store.ts`
- `services/auth/env-admin-user-store.ts`

Para una etapa con PostgreSQL, reemplazar `EnvAdminUserStore` por un store
respaldado por base de datos, API interna o proveedor externo manteniendo el
contrato `UserStore`.

## Google Sheets

La aplicacion lee datos exclusivamente mediante `IDataService`. Los componentes
no acceden a Google Sheets ni conocen sus credenciales.

Flujo:

1. Las paginas protegidas llaman a `getDataService()`.
2. El factory devuelve una implementacion de `IDataService`.
3. `GoogleSheetsService` se usa cuando `DATA_SOURCE=google-sheets`.
4. `DatabaseService` queda listo para la migracion a PostgreSQL.
5. `GoogleSheetsService` autentica con Service Account.
6. Los datos se cachean con `unstable_cache`.
7. Los errores de configuracion o lectura se transforman en estado de UI seguro.

Archivos principales:

- `services/IDataService.ts`
- `services/GoogleSheetsService.ts`
- `services/DatabaseService.ts`
- `services/data-service.ts`
- `types/dashboard.ts`

### Service Account

1. Crear un Service Account en Google Cloud.
2. Habilitar Google Sheets API.
3. Compartir la planilla con el email del Service Account con permisos de editor.
4. Cargar las variables `GOOGLE_SHEETS_*` en `.env.local` y en Vercel.

`GOOGLE_SHEETS_PRIVATE_KEY` debe mantener saltos de linea escapados como `\n`.

### Formato de las hojas

Rangos por defecto:

- `Jugadores!A:Z`
- `Cuotas!A:Z`
- `CashFlow!A:Z`
- `Configuracion!A:B`
- `Auditoria!A:Z`
- `Logs!A:Z`
- `Notificaciones!A:Z`
- `Recordatorios!A:Z`
- `Pagos!A:Z`
- `CalculadoraCostos!A:Z`
- `CalculadoraReales!A:Z`
- `Politica devoluciones!A:C`
- `Partidos jugados formulario!A:Z` en el Sheet definido por
  `GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID`

### Planilla operativa La Nueva Guardia

La aplicacion tambien soporta la planilla operativa actual del club sin duplicar
carga manual. Si no existen las hojas normalizadas `Jugadores`, `Cuotas` y
`CashFlow`, `GoogleSheetsService` intenta leer automaticamente estas hojas:

- `Listado jugadores!A:Z`: nombres, telefonos y emails.
- `Seguimiento!A:Z`: matriz anual con estados `Pago`, `Pagó`,
  `Enviar recordatorio` y `No se cobra`.
- `Cuota final por jugador!A:Z`: matriz anual con el importe calculado por mes.
- `Respuestas de formulario!A:Z`: pagos cargados desde el formulario.
- `Gastos nueva guardia!A:Z`: gastos del club para Cash Flow.
- `Politica devoluciones!A:C`: rangos de asistencia y porcentaje a devolver.

En este modo, el Google Sheet existente sigue siendo la fuente de verdad:

- La app arma los jugadores desde `Listado jugadores`.
- Las cuotas se calculan combinando `Seguimiento`, `Cuota final por jugador` y
  `Respuestas de formulario`.
- Los telefonos locales como `1154012398` se normalizan internamente a formato
  WhatsApp Argentina (`549...`).
- Los ingresos de Cash Flow salen de cuotas pagadas y los gastos de
  `Gastos nueva guardia`.
- El calculador resta al jugador los gastos que haya pagado en el mes anterior,
  matcheando la columna `Pagado por` contra el nombre del jugador.
- Si no existe `Configuracion`, la app usa configuracion por defecto y no rompe
  la pantalla.

Para usar este modo solo hay que configurar el `GOOGLE_SHEETS_SPREADSHEET_ID`
de la planilla operativa y compartirla con el Service Account como editor.

Hoja `Jugadores`:

| id      | nombre          | categoria | telefono       | cuota | observaciones |
| ------- | --------------- | --------- | -------------- | ----- | ------------- |
| JUG-001 | Martina Alvarez | Sub 18    | +5491111111111 | 25000 | Becada 50%    |
| JUG-002 | Tomas Fernandez | Primera   | +5491122222222 | 25000 |               |

Hoja `Cuotas`:

| id      | jugador_id | periodo | monto | estado    | vencimiento | fecha_pago |
| ------- | ---------- | ------- | ----- | --------- | ----------- | ---------- |
| CUO-001 | JUG-001    | 2026-07 | 25000 | pagada    | 2026-07-10  | 2026-07-05 |
| CUO-002 | JUG-002    | 2026-07 | 25000 | pendiente | 2026-07-10  |            |

Hoja `CashFlow`:

| id      | fecha      | periodo | tipo    | concepto        | monto |
| ------- | ---------- | ------- | ------- | --------------- | ----- |
| MOV-001 | 2026-07-05 | 2026-07 | ingreso | Cuotas socios   | 80000 |
| MOV-002 | 2026-07-12 | 2026-07 | gasto   | Alquiler cancha | 25000 |

Hoja `Configuracion`:

| clave                     | valor                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| club_name                 | La Nueva Guardia                                                                                                                                               |
| logo_url                  | https://example.com/logo.png                                                                                                                                   |
| whatsapp_message_template | Buenas {nombre}, ¿cómo estás? Porfa acordate de pagar la cuota de {mes}.\nEl monto es {monto}.\nY completar el formulario! https://forms.gle/FFmGxDKRM4UNhM5h6 |
| monthly_fee               | 25000                                                                                                                                                          |
| primary_color             | #012f77                                                                                                                                                        |
| dark_mode                 | false                                                                                                                                                          |

Hoja `Auditoria`:

| id      | timestamp            | actor_id | actor_name    | actor_role | action                   | entity_type | entity_id    | summary                    | metadata |
| ------- | -------------------- | -------- | ------------- | ---------- | ------------------------ | ----------- | ------------ | -------------------------- | -------- |
| AUD-001 | 2026-07-16T12:00:00Z | admin    | Administrador | admin      | settings.updated         | settings    | app-settings | Configuracion actualizada. | {}       |
| AUD-002 | 2026-07-16T12:05:00Z | system   | Sistema       | system     | payment.webhook_received | payment     | 123456       | Webhook recibido.          | {}       |

Hoja `Logs`:

| id      | timestamp            | level   | source              | message                  | context |
| ------- | -------------------- | ------- | ------------------- | ------------------------ | ------- |
| LOG-001 | 2026-07-16T12:00:00Z | warning | GoogleSheetsService | Rango premium sin datos. | {}      |

Hoja `Notificaciones`:

| id      | created_at           | title           | message              | type | status | target_role | read_at |
| ------- | -------------------- | --------------- | -------------------- | ---- | ------ | ----------- | ------- |
| NOT-001 | 2026-07-16T12:00:00Z | Pago confirmado | Se registro un pago. | info | unread | treasurer   |         |

Hoja `Recordatorios`:

| id      | created_at           | scheduled_for        | period  | player_id | player_name | phone          | payment_status | message    | status | sent_at | error |
| ------- | -------------------- | -------------------- | ------- | --------- | ----------- | -------------- | -------------- | ---------- | ------ | ------- | ----- |
| REM-001 | 2026-07-16T12:00:00Z | 2026-07-16T12:00:00Z | 2026-07 | JUG-001   | Juan Perez  | +5491111111111 | pending        | Hola Juan. | queued |         |       |

Hoja `Pagos`:

| id      | provider     | external_id | player_id | player_name | period  | amount | currency | status  | checkout_url | created_at           | updated_at           | raw_event_type   |
| ------- | ------------ | ----------- | --------- | ----------- | ------- | ------ | -------- | ------- | ------------ | -------------------- | -------------------- | ---------------- |
| PAY-001 | mercado-pago | 123456      | JUG-001   | Juan Perez  | 2026-07 | 25000  | ARS      | pending | https://...  | 2026-07-16T12:00:00Z | 2026-07-16T12:00:00Z | checkout.created |

Hoja `CalculadoraCostos`:

| id     | nombre | tipo  | vigencia_desde | vigencia_hasta | monto | repite_mensual | dividir_entre | cantidad_estimada | notas | activo |
| ------ | ------ | ----- | -------------- | -------------- | ----- | -------------- | ------------- | ----------------- | ----- | ------ |
| cost-1 | Cancha | court | 2026-07        | 2026-12        | 50000 | true           | 20            | 4                 |       | true   |
| cost-2 | DT     | fixed | 2026-07        | 2026-12        | 23000 | true           | 20            | 1                 |       | true   |

Hoja `CalculadoraReales`:

| id       | costo_id | periodo | cantidad_real | notas | actualizado_en       |
| -------- | -------- | ------- | ------------- | ----- | -------------------- |
| real-001 | cost-1   | 2026-07 | 5             |       | 2026-07-17T12:00:00Z |

Hoja externa `Partidos jugados formulario`:

| Marca temporal    | Rival       | Fecha    | Jugadores que ingresaron |
| ----------------- | ----------- | -------- | ------------------------ |
| 7/6/2026 16:25:19 | Green Ville | 6/6/2026 | Juan Perez, Pedro Gomez  |

Encabezados equivalentes soportados:

- Jugadores: `id`, `jugador_id`, `id_jugador`, `player_id`, `nombre`, `name`,
  `jugador`, `categoria`, `category`, `division`, `equipo`, `telefono`, `phone`,
  `whatsapp`, `celular`, `cuota`, `monto_mensual`, `monthly_fee`,
  `observaciones`, `observacion`, `notas`, `notes`, `estado`, `status`,
  `fecha_alta`, `alta`, `fecha_ingreso`, `ingreso`, `joined_at`, `created_at`,
  `fecha_registro`, `fecha_baja`, `baja`, `fecha_egreso`, `egreso`, `left_at`,
  `deleted_at`.
- Cuotas: `id`, `cuota_id`, `fee_id`, `jugador_id`, `id_jugador`, `player_id`,
  `periodo`, `period`, `mes`, `monto`, `importe`, `amount`, `estado`, `status`,
  `vencimiento`, `fecha_vencimiento`, `due_date`, `fecha_pago`, `paid_at`.
- Cash Flow: `id`, `movimiento_id`, `transaction_id`, `cash_flow_id`, `fecha`,
  `date`, `dia`, `periodo`, `period`, `mes`, `tipo`, `type`, `movimiento`,
  `clase`, `concepto`, `descripcion`, `description`, `detalle`, `categoria`,
  `category`, `monto`, `importe`, `amount`, `valor`, `total`.
- Configuracion: `club_name`, `nombre_club`, `logo_url`, `logo`,
  `whatsapp_message_template`, `mensaje_whatsapp`, `monthly_fee`,
  `valor_cuota`, `primary_color`, `color_principal`, `dark_mode`,
  `modo_oscuro`.
- Premium: las hojas `Auditoria`, `Logs`, `Notificaciones`, `Recordatorios` y
  `Pagos` soportan los encabezados mostrados arriba y aliases equivalentes en
  espanol/ingles para las columnas principales.

### Calculador de cuota

La pantalla `/fee-calculator` calcula la cuota final por jugador con esta regla:

```text
cuota final =
  cuota base del mes actual
  - devolucion por asistencia del mes anterior sobre la cuota base anterior
  - gastos pagados por el jugador en el mes anterior
```

La cuota base del mes actual se arma con los costos vigentes en
`CalculadoraCostos`. Cada costo calcula `monto * cantidad_estimada` y luego lo
divide por `dividir_entre`.

Los tipos especiales autocompletan la cantidad real del mes anterior:

- `court`: `monto` es costo por jornada. La cantidad real se cuenta desde
  `Partidos jugados formulario`, columna `Local / Visitante`, tomando solo
  partidos `Local`.
- `coach`: `monto` es costo por hora. La cantidad real se calcula desde
  `Asistió joaco?`; cada `Si` suma 3 horas.

En `CalculadoraReales` se puede corregir manualmente la cantidad real del mes
anterior; si existe una correccion manual, tiene prioridad sobre el calculo
automatico. La diferencia contra lo estimado se suma o resta en la cuota del mes
siguiente.

La devolucion ya no toma la cuota base desde el Sheet viejo de cuotas. La app
calcula la cuota base del mes anterior con la misma estructura de costos y usa
ese valor como base de devolucion.

La devolucion se calcula con `Politica devoluciones`:

| Desde  | Hasta | Devolucion |
| ------ | ----- | ---------- |
| 0%     | 0%    | 38%        |
| 0.01%  | 50%   | 23%        |
| 50.01% | 100%  | 0%         |

Los partidos salen del Sheet configurado en
`GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID`, hoja `Partidos jugados formulario`. La
app cuenta partidos por mes, por jugador, y permite desplegar los rivales desde
la tabla de cálculo. En el calculador se muestra un panel de asistencia mensual
con partidos del mes, partidos asistidos, porcentaje de asistencia y porcentaje
de devolucion aplicado.

Estados de cuota soportados:

- Cobradas: `pagada`, `pagado`, `cobrada`, `cobrado`, `paid`, `pago`.
- Morosas: `vencida`, `vencido`, `morosa`, `moroso`, `overdue`.
- El resto se considera pendiente. Si una cuota no esta pagada y su vencimiento
  ya paso, se considera morosa.

La primera fila puede ser encabezado. Si el rango esta vacio o hay un error, el
dashboard muestra un estado controlado sin romper la app.

La actualizacion de meses desde la ficha escribe sobre la hoja `Cuotas`. Si la
fila del periodo existe, actualiza `estado` y `fecha_pago`. Si no existe,
agrega una nueva fila usando los encabezados disponibles.

### Dashboard avanzado

La pantalla principal muestra:

- Cantidad de jugadores activos.
- Morosidad en porcentaje.
- Ingresos del mes.
- Ingresos del año para comparativa anual.
- Jugadores nuevos del mes.
- Jugadores dados de baja.

Los graficos interactivos permiten alternar entre ingresos y cuotas, comparar
años, revisar tendencia de morosidad y visualizar altas/bajas. Para calcular
altas y bajas se usan las columnas opcionales `fecha_alta` y `fecha_baja`; si no
existen, el sistema usa los estados `baja`, `dado de baja`, `inactivo` o
equivalentes como baja actual.

### Exportaciones

La pantalla `/reports` permite exportar:

- Jugadores
- Cuotas
- Ingresos
- Cash Flow

Formatos disponibles:

- Excel `.xlsx`
- CSV `.csv`
- PDF `.pdf`

Las descargas se generan desde `/api/exports`, una ruta protegida por la misma
autenticacion del sistema. La ruta consume datos desde `IDataService`;
los componentes no acceden a Google Sheets directamente.

Los datasets se preparan asi:

- `Jugadores`: listado completo con categoria, telefono, cuota, estado, alta,
  baja y observaciones.
- `Cuotas`: detalle de cuotas con jugador, periodo, monto, estado, vencimiento y
  fecha de pago.
- `Ingresos`: cuotas pagadas como ingresos cobrados.
- `Cash Flow`: movimientos financieros de ingresos y gastos.

### Cash Flow

La seccion `/cash-flow` consume datos desde `IDataService`, igual que
el resto de la aplicacion. Con `DATA_SOURCE=google-sheets`, los movimientos se
leen desde `GOOGLE_SHEETS_CASH_FLOW_RANGE`.

La pantalla muestra:

- Ingresos del mes actual.
- Gastos del mes actual.
- Balance del mes actual.
- Saldo acumulado.
- Grafico mensual de los ultimos 12 meses.
- Grafico anual de los ultimos 5 años.

Tipos soportados:

- Ingresos: `ingreso`, `ingresos`, `income`, `entrada`, `cobro`, `cobranza`,
  `venta`.
- Gastos: `gasto`, `gastos`, `expense`, `expenses`, `egreso`, `egresos`,
  `salida`, `pago`, `compra`.

Si el tipo no esta informado, un monto negativo se toma como gasto y un monto
positivo como ingreso.

### Tabla de jugadores

La tabla principal muestra:

- Nombre
- Categoría
- Teléfono
- Cuota
- Estado
- Último pago
- Observaciones
- Acciones

El estado se calcula en `GoogleSheetsService`:

- `Pagó`: cuota actual pagada o ultima cuota pagada cuando no hay cuota del mes.
- `Debe`: al menos una cuota vencida.
- `Pendiente`: cuotas no pagadas sin vencimiento moroso.

### Ficha de jugador

Al hacer click en un jugador desde la tabla se abre `/players/[playerId]`.

La ficha muestra:

- Nombre, categoria, telefono y observaciones.
- Historial completo de cuotas cargadas.
- Todos los meses del año seleccionado.
- Estado mensual `Pagado` o `Impago`.
- Accion para alternar el estado de cada mes.
- Boton `Enviar recordatorio`.

### Recordatorios por WhatsApp

El boton `Enviar recordatorio` abre:

```text
https://wa.me/<telefono>?text=<mensaje>
```

El telefono se toma del jugador y se sanitiza dejando solo digitos. El mensaje
se genera con la plantilla configurada en `Configuración`.

Plantilla predeterminada:

```text
Buenas {nombre}, ¿cómo estás? Porfa acordate de pagar la cuota de {mes}.
El monto es {monto}.
Y completar el formulario! https://forms.gle/FFmGxDKRM4UNhM5h6
```

Variables disponibles:

- `{nombre}`: nombre del jugador.
- `{mes}`: mes actual.
- `{club}`: nombre del club.

La plantilla inicial puede definirse con `NEXT_PUBLIC_REMINDER_TEMPLATE`. Desde
la pantalla de Configuracion el administrador puede cambiarla y se guarda en la
fuente de datos activa.

### Panel de configuracion

La pantalla `/settings` permite modificar:

- Nombre del club.
- Logo mediante URL.
- Mensaje de WhatsApp.
- Valor de cuota.
- Color principal.
- Modo oscuro.

Con `DATA_SOURCE=google-sheets`, estos valores se leen y guardan en
`GOOGLE_SHEETS_SETTINGS_RANGE`. El color principal y el modo oscuro se aplican
al layout protegido, y el mensaje de WhatsApp alimenta el boton
`Enviar recordatorio`.

## Arquitectura premium

### Capas

- UI: paginas App Router bajo `app/(dashboard)` y componentes en `components`.
- Dominio/tipos: `types/dashboard.ts`, `types/premium.ts`, `types/auth.ts`.
- Autenticacion y RBAC: `lib/auth/*` y `services/auth/*`.
- Datos: `services/IDataService.ts`, `GoogleSheetsService`, `DatabaseService`.
- Pagos: `services/payments/*`.
- Webhooks: `app/api/webhooks/*` y `lib/webhooks/signatures.ts`.
- API REST: `app/api/v1/*`.
- Automatizaciones: `app/api/cron/reminders/route.ts`.

Los componentes no consumen Google Sheets, Stripe ni Mercado Pago directamente.
Todo pasa por servicios, contratos y route handlers.

### Auditoria y logs

El panel `/audit` muestra:

- historial de cambios;
- eventos de login/logout;
- cambios de configuracion;
- cambios de estado de cuotas;
- checkouts creados;
- webhooks recibidos;
- logs operativos.

Las acciones criticas registran auditoria con `recordAuditEvent`. Si la hoja de
auditoria no esta disponible, la operacion principal no se bloquea.

### Notificaciones y recordatorios automaticos

El panel `/notifications` muestra avisos internos y la cola de recordatorios.

El cron diario se configura en `vercel.json`:

```json
{
  "path": "/api/cron/reminders",
  "schedule": "0 12 * * *"
}
```

La ruta valida `Authorization: Bearer <CRON_SECRET>`. En Vercel, los cron jobs
solo corren en produccion y la autenticacion debe configurarse con
`CRON_SECRET`.

El cron no envia WhatsApp directamente. Genera recordatorios auditables en cola,
preparados para conectar luego WhatsApp Business API, Twilio, Zenvia, QStash,
Inngest u otro worker.

### Pagos

El panel `/payments` permite crear links de pago para:

- Mercado Pago Checkout Pro.
- Stripe Checkout.

Los adapters estan en:

- `services/payments/MercadoPagoGateway.ts`
- `services/payments/StripeGateway.ts`

Ambos usan variables de entorno y `fetch`. No hay credenciales hardcodeadas.

Webhooks:

- `POST /api/webhooks/mercado-pago`
- `POST /api/webhooks/stripe`

Stripe valida `Stripe-Signature` contra el cuerpo raw y `STRIPE_WEBHOOK_SECRET`.
Mercado Pago valida `x-signature`, `x-request-id`, `data.id` y
`MERCADO_PAGO_WEBHOOK_SECRET`. Luego registra el evento en `Pagos` y en
`Auditoria`.

### API REST

Las rutas REST estan bajo `/api/v1` y aceptan:

- sesion web existente; o
- `Authorization: Bearer <API_SECRET>` para integraciones servidor a servidor.

Endpoints:

- `GET /api/v1/dashboard`
- `GET /api/v1/cash-flow`
- `GET /api/v1/players`
- `GET /api/v1/players/{playerId}`
- `GET /api/v1/audit`
- `POST /api/v1/payments/checkout`
- `POST /api/v1/reminders`

Los endpoints mutables validan permisos RBAC y registran auditoria.

### Cache

`GOOGLE_SHEETS_CACHE_TTL_SECONDS` define el tiempo de revalidacion. Por defecto:
`300` segundos.

### Migracion a PostgreSQL

La interfaz `IDataService` define todo lo que la app necesita. Para migrar:

1. Implementar `DatabaseService` con PostgreSQL.
2. Mantener los mismos metodos del contrato.
3. Cambiar `DATA_SOURCE=postgresql`.
4. No modificar componentes de UI.

## Produccion, rendimiento y SEO

### Optimizacion

El proyecto incluye configuracion productiva en `next.config.ts`:

- `reactStrictMode` activo.
- `poweredByHeader` desactivado.
- Compresion habilitada.
- Source maps de produccion desactivados.
- `googleapis` se mantiene como paquete externo del servidor para builds mas
  estables en Vercel.
- Headers de seguridad basicos.
- Cache largo para iconos y favicons.

El dashboard y Cash Flow mantienen la obtencion de datos en server components,
pero cargan los componentes pesados con `next/dynamic`:

- `components/dashboard/dashboard-content.tsx`
- `components/cash-flow/cash-flow-content.tsx`

Esto separa los bundles de `Recharts` y `TanStack Table` del render inicial y
mantiene placeholders estables para evitar saltos visuales.

### SEO tecnico

Archivos principales:

- `app/layout.tsx`: metadata global, Open Graph, Twitter Card, iconos y viewport.
- `app/robots.ts`: reglas de indexacion.
- `app/sitemap.ts`: sitemap tecnico.

Por defecto `NEXT_PUBLIC_SITE_INDEXABLE=false`, porque la aplicacion es un panel
administrativo protegido. En ese modo `robots.txt` bloquea indexacion. Para
permitir indexacion, configurar:

```bash
NEXT_PUBLIC_SITE_INDEXABLE=true
```

### PWA

Archivos principales:

- `app/manifest.ts`: genera `/manifest.webmanifest`.
- `public/sw.js`: service worker.
- `components/providers/service-worker-provider.tsx`: registro del service worker.
- `public/favicon.svg`
- `public/icons/*`

El service worker cachea solo assets estaticos, iconos, manifest y chunks de
Next. No cachea HTML navegable ni rutas `/api`, para evitar problemas con
sesiones, datos privados o autenticacion.

Para desactivar la PWA sin cambiar codigo:

```bash
NEXT_PUBLIC_PWA_ENABLED=false
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run audit:prod
npm run ci
npm run format
npm run format:check
```

## shadcn/ui

El proyecto incluye `components.json` configurado para:

- componentes en `components/ui`
- utilidades en `lib/utils`
- estilos globales en `app/globals.css`
- iconos con `lucide`

Para agregar componentes:

```bash
npx shadcn@latest add input dropdown-menu
```

## GitHub

El proyecto incluye:

- `.github/workflows/ci.yml`
- `.github/workflows/vercel.yml`
- `.github/pull_request_template.md`
- `.github/dependabot.yml`

Flujo sugerido:

```bash
git init
git add .
git commit -m "Initial project base"
git branch -M main
git remote add origin git@github.com:OWNER/REPOSITORY.git
git push -u origin main
```

La accion de CI corre automaticamente en push a `main` y en pull requests.

### Workflows

`CI` valida:

- instalacion reproducible con `npm ci`
- formato
- lint
- typecheck
- auditoria de dependencias productivas
- build

`Vercel Deploy` ejecuta:

- preview deploy en pull requests.
- production deploy en push a `main`.

Secrets requeridos en GitHub:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Variables requeridas en Vercel:

- `AUTH_SECRET`, `AUTH_USERS_JSON` o `ADMIN_*`.
- `API_SECRET`.
- `CRON_SECRET`.
- `GOOGLE_SHEETS_*`.
- `MERCADO_PAGO_*` si se usa Mercado Pago.
- `STRIPE_*` si se usa Stripe.

## Vercel

El proyecto incluye `vercel.json`, usa autodeteccion de Next.js y despliega en
la region `gru1`.

Pasos:

1. Subir el repositorio a GitHub.
2. Importarlo en Vercel.
3. Configurar las variables de entorno desde `.env.production.example`.
4. Obtener `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` y `VERCEL_TOKEN`.
5. Cargar esos valores como secrets en GitHub.
6. Hacer push a `main` para disparar deploy de produccion.

Comandos configurados:

```text
Install: npm ci
Build: npm run build
Dev: npm run dev
```

Cron configurado:

```text
Path: /api/cron/reminders
Schedule: 0 12 * * *
```

## Calidad

Antes de abrir un pull request:

```bash
npm run ci
```

## Referencias tecnicas

- Stripe Checkout Sessions: https://docs.stripe.com/api/checkout/sessions/create
- Stripe Webhooks y firma raw body: https://docs.stripe.com/webhooks
- Mercado Pago Checkout Pro Preferences:
  https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/preferences/create-preference/post
- Mercado Pago Webhooks:
  https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
- Vercel Cron Jobs: https://examples.vercel.com/docs/cron-jobs/quickstart

## Checklist de produccion

- Variables reales cargadas en Vercel.
- `AUTH_SECRET` generado con valor fuerte y unico.
- Service Account compartido con la planilla.
- `NEXT_PUBLIC_APP_URL` apuntando al dominio productivo.
- `NEXT_PUBLIC_SITE_INDEXABLE=false` si el panel debe permanecer privado.
- Secrets de Vercel cargados en GitHub.
- `npm run ci` pasando localmente.
- Primer deploy revisado en Vercel.
- Login validado con credenciales de produccion.
- Exportaciones validadas con datos reales.
- Roles probados: administrador, tesorero y profesor.
- Hojas premium creadas o permisos de escritura confirmados.
- `API_SECRET` probado contra `/api/v1/dashboard`.
- `CRON_SECRET` cargado y cron visible en Vercel.
- Webhook de Mercado Pago apuntando a `/api/webhooks/mercado-pago`.
- Webhook de Stripe apuntando a `/api/webhooks/stripe`.
- Pago de prueba validado en `/payments`.
