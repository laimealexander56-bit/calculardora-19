// /api/tasas.js
// Endpoint público de solo lectura. Devuelve las tasas YA calculadas por
// tramo (con el margen aplicado) — nunca el precio crudo de compra/venta
// de USDT ni los pisos de ganancia. Así, aunque alguien mire el código
// fuente del sitio, no ve tus márgenes reales.

import {
  redis,
  KEYS,
  DEFAULT_FLOORS,
  TRAMOS_CLP,
  TRAMOS_BOB,
  tasaTramoCLP,
  tasaTramoBOB,
  rawRates,
} from './_lib/redis.js';

export default async function handler(req, res) {
  try {
    const [rates, floors] = await Promise.all([
      redis.get(KEYS.rates),
      redis.get(KEYS.floors),
    ]);

    if (!rates) {
      return res.status(503).json({
        ok: false,
        error: 'Todavía no hay precios cargados. Espera al primer cron o cárgalos manualmente desde el panel admin.',
      });
    }

    const f = floors || DEFAULT_FLOORS;
    const { rawCLPtoBOB, rawBOBtoCLP } = rawRates(rates);

    const tramosCLP = TRAMOS_CLP.map((t, i) => ({
      min: t.min,
      max: t.max === Infinity ? null : t.max,
      label: t.label,
      tasa: Number(tasaTramoCLP(i, rawCLPtoBOB, f).toFixed(4)),
    }));

    const tramosBOB = TRAMOS_BOB.map((t, i) => ({
      min: t.min,
      max: t.max === Infinity ? null : t.max,
      label: t.label,
      tasa: Number(tasaTramoBOB(i, rawBOBtoCLP, f).toFixed(4)),
    }));

    // Tramo "representativo" para el banner público (el mismo criterio
    // que ya usabas: 100K-500K para CLP, 1K-5K BOB para BOB).
    const bannerClBo = tramosCLP[2].tasa;
    const bannerBoCl = tramosBOB[2].tasa;

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      ok: true,
      updatedAt: rates.updatedAt,
      source: rates.source,
      bannerClBo,
      bannerBoCl,
      tramosCLP,
      tramosBOB,
    });
  } catch (err) {
    console.error('[viruez] /api/tasas falló:', err);
    return res.status(500).json({ ok: false, error: 'No se pudieron leer las tasas.' });
  }
}
