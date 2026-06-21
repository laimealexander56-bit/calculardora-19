// Cliente Redis compartido (Upstash, instalado vía Vercel Marketplace).
// La integración de Vercel suele inyectar las variables como
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, pero en algunas
// cuentas viejas quedaron como KV_REST_API_URL / KV_REST_API_TOKEN.
// Probamos ambos nombres para no depender de cuál te haya tocado.
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.warn(
    '[viruez] Faltan las variables de Upstash Redis. Conecta la integración desde Vercel > Storage.'
  );
}

export const redis = new Redis({ url, token });

export const KEYS = {
  rates: 'viruez:rates', // último precio válido (compra/venta USDT en CLP y BOB)
  floors: 'viruez:floors', // pisos de ganancia por tramo (editable desde el panel admin)
};

export const DEFAULT_FLOORS = {
  clp: [3.5, 10, 10, 10, 10], // BOB de piso por tramo, envíos CL -> BO
  bob: [150, 900, 900, 900, 900], // CLP de piso por tramo, envíos BO -> CL
};

export const TRAMOS_CLP = [
  { min: 10000, max: 49999, label: '10K–50K CLP' },
  { min: 50000, max: 99999, label: '50K–100K CLP' },
  { min: 100000, max: 499999, label: '100K–500K CLP' },
  { min: 500000, max: 999999, label: '500K–1M CLP' },
  { min: 1000000, max: Infinity, label: '1M+ CLP' },
];

export const TRAMOS_BOB = [
  { min: 50, max: 499, label: '50–500 BOB' },
  { min: 500, max: 999, label: '500–1.000 BOB' },
  { min: 1000, max: 4999, label: '1.000–5.000 BOB' },
  { min: 5000, max: 9999, label: '5.000–10.000 BOB' },
  { min: 10000, max: Infinity, label: '10.000+ BOB' },
];

// Misma fórmula que ya usabas: tasa cruda menos un piso de ganancia
// convertido a "por unidad", más agresivo en montos chicos.
export function tasaTramoCLP(i, rawCLPtoBOB, floors) {
  const floor = floors.clp[i] ?? 0;
  return rawCLPtoBOB - (floor * 1000) / TRAMOS_CLP[i].min;
}
export function tasaTramoBOB(i, rawBOBtoCLP, floors) {
  const floor = floors.bob[i] ?? 0;
  return rawBOBtoCLP - floor / TRAMOS_BOB[i].min;
}

export function rawRates(rates) {
  return {
    rawCLPtoBOB: (rates.ventaBOB / rates.compraCLP) * 1000,
    rawBOBtoCLP: rates.ventaCLP / rates.compraBOB,
  };
}
