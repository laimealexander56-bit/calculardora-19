// /api/generar.js
// El navegador ya no llama a Anthropic directamente (eso solo funciona
// dentro de Claude.ai). Acá la API key vive como variable de entorno en
// Vercel, nunca en el código ni en el HTML.

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

const TYPE_INSTRUCTIONS = {
  rate: 'Tipo de publicación: SOLO TIPO DE CAMBIO. Texto corto y directo, anuncia el marcador del día (las dos tasas) y llama a la acción para enviar. Sin noticias ni tips, ve directo al grano.',
  news: 'Tipo de publicación: CAMBIO + MINI NOTICIA ECONÓMICA. Primero busca en la web una noticia económica reciente y relevante para Bolivia, Chile, o el contexto cambiario BOB/CLP. Luego escribe el post: anuncia el marcador del día y conecta brevemente con esa noticia, explicada en palabras simples, parafraseada con tus propias palabras (máximo 2 frases sobre la noticia, nunca cites texto literal).',
  tip: 'Tipo de publicación: CAMBIO + TIP FINANCIERO. Anuncia el marcador del día y agrega un tip financiero corto y práctico relacionado con remesas, ahorro, o cuándo conviene enviar dinero.',
  weekly: 'Tipo de publicación: RESUMEN SEMANAL. Anuncia el marcador del día como cierre de la semana. Si se entregó la tasa de hace 7 días, compárala con la de hoy usando una metáfora futbolera. Si no, haz un resumen general invitando a seguir atentos cada semana.',
};

const SYSTEM_PROMPT = (type) => `Eres el redactor de contenido de Viruez Envíos, un servicio de envío de dinero de Chile a Bolivia.

IDENTIDAD DE MARCA
- Nombre: Viruez Envíos
- Slogan: "De Chile a Bolivia – Rápido y Seguro"
- WhatsApp: +56 9 1021 4462
- Tono: casual, cercano, boliviano, con emojis y metáforas de fútbol ⚽ que tengan sentido (no forzadas)

REGLAS DE ESTILO
- Máximo 550 caracteres en total
- Usa emojis con moderación pero presentes
- Incluye al menos una metáfora o referencia futbolera relacionada con el contenido del día
- Cierra siempre invitando a escribir por WhatsApp para hacer su envío
- Máximo 2-3 hashtags relevantes al final, nada de spam genérico
- Nunca inventes cifras económicas que no se te dieron explícitamente
- Responde ÚNICAMENTE con el texto final de la publicación, listo para copiar y pegar. Sin explicaciones, sin comillas, sin markdown.

${TYPE_INSTRUCTIONS[type]}`;

async function getTodayRates() {
  const [rates, floors] = await Promise.all([
    redis.get(KEYS.rates),
    redis.get(KEYS.floors),
  ]);
  if (!rates) return null;
  const f = floors || DEFAULT_FLOORS;
  const { rawCLPtoBOB, rawBOBtoCLP } = rawRates(rates);
  return {
    rateClBo: Number(tasaTramoCLP(2, rawCLPtoBOB, f).toFixed(4)),
    rateBoCl: Number(tasaTramoBOB(2, rawBOBtoCLP, f).toFixed(4)),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'Falta configurar ANTHROPIC_API_KEY en Vercel.' });
  }

  try {
    const { type = 'rate', lastWeekRate } = req.body || {};
    if (!TYPE_INSTRUCTIONS[type]) {
      return res.status(400).json({ ok: false, error: 'Tipo de publicación inválido.' });
    }

    const today = await getTodayRates();
    if (!today) {
      return res.status(503).json({ ok: false, error: 'Aún no hay tasas cargadas para hoy.' });
    }

    const fecha = new Date().toLocaleDateString('es-BO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    const userPrompt = `Datos de hoy (${fecha}):
- Tasa CL → BO: 1 CLP = ${today.rateClBo} BOB
- Tasa BO → CL: 1 BOB = ${today.rateBoCl} CLP
${lastWeekRate ? `- Tasa CL → BO hace 7 días: 1 CLP = ${lastWeekRate} BOB (para comparar en el resumen semanal)` : ''}

Escribe el post de hoy siguiendo las reglas e instrucciones del tipo de publicación indicado.`;

    const body = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SYSTEM_PROMPT(type),
      messages: [{ role: 'user', content: userPrompt }],
    };
    if (type === 'news') {
      body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[viruez] Anthropic API error:', apiRes.status, errText);
      return res.status(502).json({ ok: false, error: 'La IA no pudo generar el texto. Intenta de nuevo.' });
    }

    const data = await apiRes.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
      .replace(/^```[a-z]*\n?/i, '')
      .replace(/```$/, '')
      .trim();

    if (!text) {
      return res.status(502).json({ ok: false, error: 'Respuesta vacía de la IA.' });
    }

    return res.status(200).json({ ok: true, text, rates: today });
  } catch (err) {
    console.error('[viruez] /api/generar falló:', err);
    return res.status(500).json({ ok: false, error: 'Error inesperado generando el contenido.' });
  }
}
