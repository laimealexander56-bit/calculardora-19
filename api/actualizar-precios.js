// /api/actualizar-precios.js
// Disparado una vez al día por el cron de Vercel (ver vercel.json).
// Trae el mejor precio de compra/venta de USDT en CLP y en BOB desde
// Binance P2P, y lo guarda en Redis. Si el spread sale raro (señal de
// que algo falló en Binance), NO pisa el último precio bueno conocido.

import { redis, KEYS } from './_lib/redis.js';

const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// Margen mínimo aceptable. Si el spread del día cae por debajo de esto,
// asumimos que el dato vino mal y no actualizamos el precio público.
const MIN_SPREAD_CLP = 4; // pesos CLP por USDT
const MIN_SPREAD_BOB = 0.03; // bolivianos por USDT

async function fetchBestPrice(fiat, tradeType) {
  const res = await fetch(BINANCE_P2P_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: 1,
      rows: 5,
      payTypes: [],
      asset: 'USDT',
      fiat,
      tradeType, // 'BUY' o 'SELL', desde la perspectiva de quien usa Binance
      publisherType: null,
    }),
  });

  if (!res.ok) throw new Error(`Binance respondió ${res.status} para ${fiat}/${tradeType}`);
  const json = await res.json();
  const first = json?.data?.[0]?.adv;
  if (!first?.price) throw new Error(`Sin anuncios disponibles para ${fiat}/${tradeType}`);
  return parseFloat(first.price);
}

export default async function handler(req, res) {
  // Protección simple: si configuraste CRON_SECRET, exigimos que coincida.
  // Vercel adjunta automáticamente "Authorization: Bearer <CRON_SECRET>"
  // en sus llamadas de cron cuando esa variable de entorno existe.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: 'No autorizado' });
    }
  }

  const log = [];
  try {
    log.push('Consultando Binance P2P…');

    const [compraCLP, ventaCLP, compraBOB, ventaBOB] = await Promise.all([
      fetchBestPrice('CLP', 'BUY'), // precio más barato para comprar USDT con CLP
      fetchBestPrice('CLP', 'SELL'), // precio más alto para vender USDT por CLP
      fetchBestPrice('BOB', 'BUY'),
      fetchBestPrice('BOB', 'SELL'),
    ]);

    const spreadCLP = compraCLP - ventaCLP;
    const spreadBOB = compraBOB - ventaBOB;

    log.push(
      `Compra USDT CLP: ${compraCLP} · Venta USDT CLP: ${ventaCLP} (spread ${spreadCLP.toFixed(2)})`
    );
    log.push(
      `Compra USDT BOB: ${compraBOB} · Venta USDT BOB: ${ventaBOB} (spread ${spreadBOB.toFixed(2)})`
    );

    if (spreadCLP < MIN_SPREAD_CLP || spreadBOB < MIN_SPREAD_BOB) {
      log.push('⚠️ Spread por debajo del mínimo aceptable. Se mantiene el último precio válido.');
      const previous = await redis.get(KEYS.rates);
      return res.status(200).json({
        ok: true,
        updated: false,
        reason: 'spread_demasiado_bajo',
        previous,
        log,
      });
    }

    const record = {
      compraCLP,
      ventaCLP,
      compraBOB,
      ventaBOB,
      source: 'auto',
      updatedAt: new Date().toISOString(),
    };

    await redis.set(KEYS.rates, record);
    log.push('✅ Precios guardados.');

    return res.status(200).json({ ok: true, updated: true, record, log });
  } catch (err) {
    log.push(`❌ Error: ${err.message}`);
    console.error('[viruez] actualizar-precios falló:', err);

    // No tiramos la app: el sitio sigue mostrando el último precio guardado.
    const previous = await redis.get(KEYS.rates).catch(() => null);
    return res.status(200).json({
      ok: false,
      updated: false,
      reason: 'error_fetch',
      previous,
      log,
    });
  }
}
