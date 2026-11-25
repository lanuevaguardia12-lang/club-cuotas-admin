# Acceso y vinculación con Google

Google es otra forma de acceder a una cuenta existente. La vinculación conserva
el ID de usuario, el jugador asociado, los permisos y toda su información financiera.
No crea cuentas, no une por nombre o email y no cambia el correo de contacto del perfil.

## Configuración

1. En Google Cloud → Google Auth Platform, configurar la marca de la aplicación
   y una audiencia externa para los miembros del club. Esta integración solo pide
   `openid` y `email`: Google exceptúa estos permisos básicos de la lista de
   usuarios de prueba, incluso con el estado Testing. Ver
   [estados de una app OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
2. Crear un cliente OAuth de tipo **Aplicación web**. Agregar como URI de redirección:
   `https://club-cuotas-admin.vercel.app/api/auth/google/callback`.
   El dominio debe coincidir con `NEXT_PUBLIC_APP_URL`. Los accesos con Google
   deben iniciarse desde ese dominio principal.
3. Guardar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env.local` para desarrollo
   y en las variables **Production** de Vercel. No son las credenciales de la cuenta
   de servicio de Sheets. No agregar el secreto al repositorio ni al chat.
4. Ejecutar `npm run db:migrate` y desplegar nuevamente después de configurar las
   variables. La migración `008_google_account_linking.sql` agrega tablas privadas
   para identidades, preferencias e intentos de autorización, sin modificar jugadores.
5. Mantener `DIRECTORY_DATA_SOURCE=postgresql` y el `AUTH_SECRET` existente.
   Para un entorno local con acceso real, usar un cliente de desarrollo y registrar
   su callback `http://localhost:3000/api/auth/google/callback`, con
   `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

Solo se solicitan los permisos `openid` y `email`. No se guardan tokens de acceso
ni de actualización de Google. Los botones y el aviso no se activan mientras
falte la configuración OAuth.

## Uso

- En el login: **Iniciar sesión con Google**. Si la identidad aún no está vinculada,
  se solicita ingresar con el usuario y contraseña existentes y vincularla en Mi cuenta.
- En Mi cuenta: **Vincular con Google**. Se requiere una sesión vigente y la misma
  cuenta local al volver de Google. Elegir la cuenta en Google y confirmar.
- Al ingresar, los usuarios sin vinculación ni preferencia guardada ven el aviso.
  **No tengo Gmail** guarda una preferencia por usuario en Supabase; no vuelve a
  aparecer en otros dispositivos. Se puede vincular más adelante desde Mi cuenta.
- Cerrar el aviso lo oculta durante esa visita. Cancelar en Google mantiene el
  acceso existente y permite volver a intentar desde Mi cuenta.
- Una cuenta de Google solo puede vincularse a un usuario y cada usuario solo puede
  vincular una cuenta de Google. Cambiar esa vinculación requiere intervención del
  administrador; no se ofrece reemplazo automático.

## Validación

`node --test tests/google-auth.test.mjs` cubre el flujo, PKCE/nonce, estado firmado,
reintentos, propiedad de cuenta, permisos actuales, redirecciones y preferencia.

`RUN_DATABASE_TESTS=1 node --test tests/google-auth-postgres.test.mjs` verifica
unicidad, acceso privado, preferencias y consumo único de los intentos dentro de
una transacción que se revierte. No conserva registros de prueba.

Antes de activar para todos, vincular una cuenta real del club desde Mi cuenta,
cerrar sesión y volver a ingresar con Google para comprobar el consentimiento real.

Referencias: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
y [OAuth para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server).
