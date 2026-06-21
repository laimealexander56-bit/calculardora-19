# Viruez Envíos

Calculadora pública + panel admin + generador de contenido diario con IA, para Viruez Envíos (Chile ⇄ Bolivia).

## Qué incluye

- `index.html` — la app: calculadora pública (2 direcciones), panel admin con contraseña, generador de posts
- `/api/tasas.js` — endpoint público de solo lectura (nunca expone tus márgenes)
- `/api/admin-tasas.js` — endpoint protegido por contraseña para ajustar precios y pisos de ganancia
- `/api/actualizar-precios.js` — se ejecuta solo, una vez al día, trae precios de Binance P2P
- `/api/generar.js` — genera el texto del post del día con Claude
- `vercel.json` — configura el cron diario

## 1. Subir a GitHub

```bash
cd viruez-app
git init
git add .
git commit -m "Viruez Envíos: calculadora + generador"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/viruez-envios.git
git push -u origin main
```

(Crea el repo vacío en GitHub primero, sin README ni .gitignore, para que el push no choque.)

## 2. Importar en Vercel

1. Entra a https://vercel.com/new
2. Selecciona el repo `viruez-envios`
3. Framework Preset: **Other** (no es Next.js, es estático + funciones)
4. Dale a **Deploy** — va a fallar la primera vez porque faltan las variables de entorno, es normal, las agregamos ahora.

## 3. Conectar Redis (Upstash, gratis)

1. En tu proyecto de Vercel → pestaña **Storage** → **Create Database**
2. Elige **Upstash** → **Redis**
3. Sigue el asistente y conéctalo a tu proyecto
4. Esto agrega automáticamente las variables `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL` / `KV_REST_API_TOKEN` según la versión) a tu proyecto

## 4. Variables de entorno

En **Settings → Environment Variables**, agrega:

| Variable | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | tu API key de https://console.anthropic.com/settings/keys |
| `ADMIN_PASSWORD` | una contraseña tuya para el panel admin |
| `CRON_SECRET` | cualquier string largo random (protege el cron) |

Las de Upstash ya quedaron del paso 3.

## 5. Redesplegar

Después de agregar las variables, ve a **Deployments** → los tres puntos del último deploy → **Redeploy**.

## 6. Cargar el primer precio

El cron corre una vez al día (configurado a las 11:00 UTC en `vercel.json` — ajusta la hora si quieres). Para no esperar al día siguiente la primera vez:

- Entra a tu sitio → ⚙️ Panel del negocio → pon tu `ADMIN_PASSWORD`
- Carga manualmente compra/venta de USDT en CLP y BOB → **Guardar precios manualmente**
- Listo, la calculadora y el generador ya tienen datos para hoy

## 7. Probar el generador

Panel admin → elige un tipo de publicación → **Generar publicación**. Si da error, revisa en Vercel → Logs que `ANTHROPIC_API_KEY` esté bien cargada.

## Notas importantes

- **El endpoint de Binance P2P que usa el cron es no oficial** (lo usan muchos bots de la comunidad, pero Binance puede cambiarlo sin avisar). Si un día deja de funcionar, vas a ver en los Logs de Vercel el error, y mientras tanto el sitio sigue funcionando con el último precio guardado — no se cae.
- El cron en el plan gratuito de Vercel solo puede correr **una vez al día**. Si más adelante quieres varias veces al día, hay que pasar a Vercel Pro (US$20/mes) o usar un servicio externo gratuito como cron-job.org apuntando al mismo endpoint.
- Cambia la contraseña de ejemplo del código viejo (`viruez2026`) — ahora la contraseña real vive solo en `ADMIN_PASSWORD` en Vercel, nunca en el código.
