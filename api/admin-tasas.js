// /api/admin-tasas.js
// Protegido por contraseña (ADMIN_PASSWORD, variable de entorno en Vercel
// — nunca en el código). Permite:
//  - Ver los valores crudos actuales (solo aquí, nunca en /api/tasas)
//  - Forzar manualmente compra/venta de USDT si Binance falla un día
//  - Editar los pisos de ganancia por tramo

import { redis, KEYS, DEFAULT_FLOORS, rawRates } from './_lib/redis.js';

function checkAuth(req) {
  const password = req.headers['x-admin-password'];
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta o no configurada.' });
  }

  if (req.method === 'GET') {
    const [rates, floors] = await Promise.all([
      redis.get(KEYS.rates),
      redis.get(KEYS.floors),
    ]);
    return res.status(200).json({
      ok: true,
      rates: rates || null,
      floors: floors || DEFAULT_FLOORS,
      raw: rates ? rawRates(rates) : null,
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const updates = {};

    if (body.rates) {
      const { compraCLP, ventaCLP, compraBOB, ventaBOB } = body.rates;
      if ([compraCLP, ventaCLP, compraBOB, ventaBOB].some((v) => typeof v !== 'number' || v <= 0)) {
        return res.status(400).json({ ok: false, error: 'Valores de tasas inválidos.' });
      }
      const record = {
        compraCLP,
        ventaCLP,
        compraBOB,
        ventaBOB,
        source: 'manual',
        updatedAt: new Date().toISOString(),
      };
      await redis.set(KEYS.rates, record);
      updates.rates = record;
    }

    if (body.floors) {
      const { clp, bob } = body.floors;
      if (!Array.isArray(clp) || clp.length !== 5 || !Array.isArray(bob) || bob.length !== 5) {
        return res.status(400).json({ ok: false, error: 'Los pisos deben ser arreglos de 5 valores.' });
      }
      const floors = { clp, bob };
      await redis.set(KEYS.floors, floors);
      updates.floors = floors;
    }

    return res.status(200).json({ ok: true, updates });
  }

  return res.status(405).json({ ok: false, error: 'Método no permitido.' });
}
