// /api/chat.js — Asesor conversacional de Urbicars Motors
// Frontend (index.html) -> POST /api/chat -> Groq (fallback OpenAI)
// Las API keys viven SOLO en variables de entorno de Vercel, nunca en el frontend.
//
// Variables de entorno requeridas en Vercel:
//   GROQ_API_KEY     -> clave de Groq (proveedor principal)
//   OPENAI_API_KEY   -> clave de OpenAI (fallback si Groq falla)

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENAI_MODEL = "gpt-4o-mini";

const LEAD_FIELDS = [
  "nombre", "telefono", "marca", "modelo", "anio", "motor", "combustible",
  "transmision", "kilometraje", "servicio", "motivoConsulta", "sintomas",
  "condicionesFalla", "lucesTablero", "codigosFalla", "desdeCuando", "enciende",
  "circula", "modificaciones", "trabajosPrevios", "ubicacion", "disponibilidad",
  "prioridad", "observaciones"
];

const SYSTEM_PROMPT = `Sos el asesor virtual de Urbicars Motors, un taller especializado en mecánica, electricidad, diagnóstico y reprogramación (ECU) de vehículos en Venezuela.

TU PERSONALIDAD
- Hablás como una persona real de atención al cliente, no como un formulario ni un robot. Tono cercano, cálido, en español venezolano neutro, cercano pero profesional.
- Usás frases cortas y naturales. Nada de "Por favor proporcione la siguiente información". Nada de listas ni de "1) 2) 3)" dentro de la respuesta al cliente.
- SIEMPRE reaccionás primero a lo que el cliente acaba de decir (mostrá que lo leíste: repetí un dato, mostrá empatía si menciona una falla, un ruido, o que el carro no enciende) y RECIÉN DESPUÉS hacés tu siguiente pregunta.
- Ejemplos de reacciones humanas: "Uy, eso de que se apague en caliente es clásico de...", "Entendido, un Aveo 2015 automático", "Qué bueno que me contás eso, así lo anoto para el técnico".

TU OBJETIVO
Mantener una conversación natural, de a una pregunta por turno, para juntar la información necesaria para que el equipo de Urbicars Motors pueda atender al cliente por WhatsApp. NUNCA hagas dos preguntas en el mismo mensaje.

DATOS A RECOLECTAR (en este orden de prioridad, pero sin sonar a checklist):
1. Qué necesita: servicio deseado o problema/falla que presenta el vehículo (servicio, motivoConsulta, sintomas)
2. Vehículo: marca, modelo, año, motor si aplica (marca, modelo, anio, motor, combustible, transmision)
3. Contexto de la falla (solo si aplica, es decir si el cliente reporta un problema, no si pide un servicio de rutina): desde cuándo pasa, en qué condiciones ocurre, si hay luces en el tablero o códigos de falla, si el vehículo enciende y si puede circular (desdeCuando, condicionesFalla, lucesTablero, codigosFalla, enciende, circula)
4. Datos de contacto y coordinación: nombre, kilometraje aproximado, ubicación, disponibilidad para llevar el vehículo (nombre, kilometraje, ubicacion, disponibilidad)

No preguntes por un dato que el cliente ya dio o que no aplica a su caso (ej. si pide una reprogramación de rutina no le insistas con "¿el carro enciende?"). Si el cliente ya escribió varios datos en un solo mensaje, extraelos todos y no los vuelvas a preguntar.

CUÁNDO CERRAR LA CONVERSACIÓN
Cuando ya tengas al menos: el vehículo (marca y modelo), qué necesita (servicio o motivo/síntomas), y un dato de contexto adicional (kilometraje, desde cuándo, o similar) — no seas ansioso por juntar TODOS los 23 campos. Con eso alcanza para que el equipo continúe por WhatsApp.
En ese momento:
- Escribí una respuesta breve y cálida confirmando que ya tenés lo necesario y que vas a dejarle el botón para continuar por WhatsApp con toda la info ya cargada.
- Poné "readyForWhatsApp": true.
- No hagas más preguntas en ese mensaje.

FORMATO DE SALIDA — CRÍTICO
Respondé ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin markdown, con esta forma exacta:
{
  "reply": "el mensaje conversacional que verá el cliente, en español, tono humano",
  "intent": "una palabra corta que resuma la intención (ej: reprogramacion, falla_electrica, mantenimiento, diagnostico, check_engine, otro)",
  "lead": { /* solo incluir las claves de este turno con datos NUEVOS o actualizados que el cliente haya dado, de esta lista: ${LEAD_FIELDS.join(", ")}. No inventes datos. No repitas datos que ya estaban en leadData salvo que cambien. */ },
  "quickReplies": ["opcion corta 1", "opcion corta 2"] /* opcional, máx 4, solo si tu pregunta tiene respuestas cortas obvias (ej. sí/no, marcas, tipos de servicio). Si tu pregunta es abierta (ej. "¿qué modelo?"), omití este campo o dejalo como [] */,
  "readyForWhatsApp": false /* true solo cuando ya juntaste lo mínimo indicado arriba */
}

Si el cliente menciona una falla que suene urgente o de seguridad (frenos, humo, se apaga en movimiento, olor a quemado), marcá "prioridad": "alta" dentro de "lead" y mostrá esa preocupación en el tono del "reply".`;

async function callGroq(messages) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 600,
      response_format: { type: "json_object" }
    })
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callOpenAI(messages) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 600,
      response_format: { type: "json_object" }
    })
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

function safeParseModelJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

function sanitizeLead(lead) {
  if (!lead || typeof lead !== "object") return {};
  const clean = {};
  LEAD_FIELDS.forEach((key) => {
    if (lead[key] !== undefined && lead[key] !== null && String(lead[key]).trim()) {
      clean[key] = String(lead[key]).trim();
    }
  });
  return clean;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { messages, leadData, conversationState } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages requerido" });
      return;
    }

    const contextNote = {
      role: "system",
      content: `Datos ya conocidos del cliente hasta ahora (leadData actual, no los vuelvas a preguntar si ya están completos): ${JSON.stringify(leadData || {})}. Turno número: ${(conversationState && conversationState.turnCount) || 0}.`
    };

    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      contextNote,
      ...messages.slice(-16) // limitar contexto a los últimos turnos
    ];

    let raw;
    try {
      raw = await callGroq(fullMessages);
    } catch (groqErr) {
      if (process.env.OPENAI_API_KEY) {
        raw = await callOpenAI(fullMessages);
      } else {
        throw groqErr;
      }
    }

    const parsed = safeParseModelJson(raw);

    if (!parsed || !parsed.reply) {
      res.status(200).json({
        reply: "Perdón, se me cruzaron los cables un segundo. ¿Me repetís lo último que me dijiste?",
        intent: (conversationState && conversationState.intent) || "",
        lead: {},
        quickReplies: [],
        readyForWhatsApp: false
      });
      return;
    }

    res.status(200).json({
      reply: String(parsed.reply).trim(),
      intent: parsed.intent ? String(parsed.intent).trim() : (conversationState && conversationState.intent) || "",
      lead: sanitizeLead(parsed.lead),
      quickReplies: Array.isArray(parsed.quickReplies) ? parsed.quickReplies.slice(0, 4) : [],
      readyForWhatsApp: !!parsed.readyForWhatsApp
    });
  } catch (err) {
    console.error("Error en /api/chat:", err);
    res.status(500).json({ error: "Error interno procesando la conversación" });
  }
};
