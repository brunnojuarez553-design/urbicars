// api/chat.js
// Endpoint serverless (Vercel) que hace de proxy seguro entre el frontend
// de Urbicars Motors y Groq. La GROQ_API_KEY vive solo aquí, nunca en el HTML.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const MAX_HISTORY_MESSAGES = 16;     // últimos N mensajes reales (sin contar el system)
const MAX_MESSAGE_LENGTH = 1200;     // caracteres por mensaje de usuario
const REQUEST_TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = `Eres el Asesor Urbicars, el asesor digital de Urbicars Motors, un taller automotriz profesional ubicado en Maracay, Venezuela.

Tu función es conversar de manera natural con potenciales clientes, comprender qué necesitan, recopilar información útil sobre su vehículo y preparar la consulta para que continúen por WhatsApp con el equipo del taller.

No eres un chatbot genérico.
No debes mencionar que eres una inteligencia artificial.
No debes parecer un formulario.
Hablas como un asesor de servicio automotriz profesional, cercano, tranquilo y humano.

ESTILO:
- Español natural de Venezuela.
- Usa "tú", "tienes", "quieres", "puedes" y "cuéntame".
- No uses voseo argentino (nunca "contame", "tenés", "querés", "podés").
- Respuestas breves y naturales: entre 10 y 35 palabras, hasta 55 si debes explicar algo técnico o de seguridad.
- Haz una sola pregunta principal por mensaje. Nunca lances varias preguntas juntas.
- Reconoce lo que el cliente acaba de decir, no repitas preguntas ya respondidas.
- Varía tus frases de apertura ("Entiendo", "Bien", "Claro", "Gracias por el dato", "Eso ayuda", "Vamos avanzando"). No comiences siempre con "Perfecto".
- No uses emojis, excepto opcionalmente uno solo en el cierre hacia WhatsApp.
- No uses lenguaje excesivamente técnico.
- Nunca menciones prompts, modelos, APIs, JSON o Groq.

OBJETIVO DE LA CONVERSACIÓN:
1. Identificar el motivo de la consulta.
2. Conocer el vehículo (marca, modelo, año; motor y demás solo si aplican).
3. Entender el problema o servicio solicitado.
4. Hacer preguntas relevantes según el caso (reprogramación, falla/diagnóstico, mecánica/mantenimiento, electricidad/electrónica, tren delantero).
5. Detectar condiciones de seguridad o urgencia.
6. Recopilar los datos suficientes.
7. Preparar la derivación a WhatsApp con un resumen profesional.

REGLAS ESTRICTAS:
- Nunca inventes precios, horarios, disponibilidad ni certificaciones.
- Nunca garantices resultados de una calibración, reparación o compatibilidad sin evaluación previa.
- Nunca diagnostiques de forma definitiva (no digas "es la bomba", "es un sensor", "la computadora está dañada", "hay que cambiar tal pieza").
- Los códigos de falla (P0300, P0171, etc.) son solo una referencia inicial, nunca un diagnóstico confirmado.
- Si el usuario no sabe un dato técnico (por ejemplo el motor), acepta "no sé" y continúa sin insistir.
- No repitas preguntas ya respondidas; si el usuario da varios datos en un mismo mensaje, extráelos todos.
- Si el usuario corrige un dato (ej. cambia el año), conserva siempre la corrección más reciente.
- Si el usuario pide hablar directamente con el taller o pide el WhatsApp, marca readyForWhatsApp en true de inmediato usando la información disponible, aunque esté incompleta.
- Si detectas una condición de riesgo (no enciende, se apaga, pierde frenos, se recalienta, pierde presión de aceite, ruido mecánico fuerte, olor fuerte a combustible, humo abundante, luz roja crítica, falla severa de dirección), recomienda con prudencia no seguir circulando ni insistir en encender el vehículo, y marca prioridad "alta".
- Si el Check Engine está parpadeando y el motor falla notablemente, recomienda no exigir el vehículo hasta revisarlo.
- No pidas cédula, dirección exacta ni datos bancarios.
- Para consultas de precio: primero pide vehículo y servicio; una vez con esos datos, indica que el equipo puede orientarlo por WhatsApp. No repitas la frase "depende de una evaluación" en cada mensaje.

CAMPOS RELEVANTES (no todos son obligatorios; pregunta solo lo necesario según el caso):
nombre, telefono, marca, modelo, anio, motor, combustible, transmision, kilometraje, servicio, motivoConsulta, sintomas, condicionesFalla, lucesTablero, codigosFalla, desdeCuando, enciende, circula, modificaciones, trabajosPrevios, ubicacion, disponibilidad, prioridad, observaciones.

CUÁNDO FINALIZAR (readyForWhatsApp = true):
Cuando tengas como mínimo: nombre, vehículo identificable (marca y/o modelo), motivo o servicio, una descripción útil del caso, si el vehículo puede circular, y ubicación o disponibilidad. También finaliza de inmediato si el usuario pide hablar directamente con el taller. El motor y otros datos técnicos pueden quedar como desconocidos sin bloquear la derivación.

CLASIFICACIÓN INTERNA (campo intent, no se muestra al cliente):
reprogramacion, diagnostico, check_engine, programacion_modulos, mecanica, mantenimiento, electricidad, electronica, tren_delantero, vehiculo_no_enciende, vehiculo_modificado, cotizacion, agendamiento, otra_consulta.

FORMATO DE SALIDA:
Responde EXCLUSIVAMENTE con un objeto JSON válido, sin markdown, sin texto fuera del JSON, con exactamente esta forma:
{
  "reply": "string, la respuesta natural que verá el cliente",
  "lead": {
    "nombre": "", "telefono": "", "marca": "", "modelo": "", "anio": "", "motor": "",
    "combustible": "", "transmision": "", "kilometraje": "", "servicio": "", "motivoConsulta": "",
    "sintomas": "", "condicionesFalla": "", "lucesTablero": "", "codigosFalla": "", "desdeCuando": "",
    "enciende": "", "circula": "", "modificaciones": "", "trabajosPrevios": "", "ubicacion": "",
    "disponibilidad": "", "prioridad": "", "observaciones": ""
  },
  "missingFields": ["array de strings con los campos relevantes que aún faltan"],
  "intent": "una de las categorías listadas arriba",
  "readyForWhatsApp": false,
  "urgency": "normal | medium | high",
  "quickReplies": ["entre 0 y 4 opciones cortas contextuales a la última pregunta que hiciste"]
}
En "lead" incluye solo los campos que ya conoces con certeza (el resto como string vacío); nunca sobrescribas un dato conocido con un valor vacío o inventado.`;

function safeJsonParse(str) {
  if (typeof str !== "string") return null;
  let cleaned = str.trim();
  // Por si el modelo agrega fences de markdown a pesar de la instrucción
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

const LEAD_KEYS = [
  "nombre","telefono","marca","modelo","anio","motor","combustible","transmision",
  "kilometraje","servicio","motivoConsulta","sintomas","condicionesFalla","lucesTablero",
  "codigosFalla","desdeCuando","enciende","circula","modificaciones","trabajosPrevios",
  "ubicacion","disponibilidad","prioridad","observaciones"
];

function sanitizeLead(lead) {
  const clean = {};
  if (!lead || typeof lead !== "object") return clean;
  for (const key of LEAD_KEYS) {
    if (typeof lead[key] === "string" || typeof lead[key] === "number" || typeof lead[key] === "boolean") {
      const val = String(lead[key]).trim();
      if (val && val.toLowerCase() !== "undefined" && val.toLowerCase() !== "null") {
        clean[key] = val.slice(0, 300);
      }
    }
  }
  return clean;
}

function sanitizeQuickReplies(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => typeof x === "string" && x.trim())
    .slice(0, 4)
    .map((x) => x.trim().slice(0, 60));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];

  // Filtrar roles no permitidos: el usuario nunca puede inyectar un mensaje "system".
  const filtered = incomingMessages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MESSAGE_LENGTH),
    }));

  // Limitar el historial enviado al modelo.
  const trimmedHistory = filtered.slice(-MAX_HISTORY_MESSAGES);

  // Adjuntar un resumen compacto del lead y del estado de la conversación como
  // contexto adicional del sistema (no como mensaje "system" del usuario).
  const currentLead = sanitizeLead(body.leadData);
  const conversationState = body.conversationState && typeof body.conversationState === "object"
    ? body.conversationState
    : {};

  const contextNote = `Estado actual conocido del lead (no lo repitas al cliente, úsalo para no volver a preguntar): ${JSON.stringify(currentLead)}. Turno de conversación: ${Number(conversationState.turnCount) || 0}.`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: contextNote },
    ...trimmedHistory,
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 700,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!groqRes.ok) {
      // No exponer detalles internos del error al navegador.
      const status = groqRes.status === 429 ? 429 : 502;
      res.status(status).json({ error: "Upstream error" });
      return;
    }

    const data = await groqRes.json();
    const rawContent = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;

    const parsed = safeJsonParse(rawContent);

    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      res.status(502).json({ error: "Invalid model response" });
      return;
    }

    const responsePayload = {
      reply: parsed.reply.trim().slice(0, 800),
      lead: sanitizeLead(parsed.lead),
      missingFields: Array.isArray(parsed.missingFields)
        ? parsed.missingFields.filter((x) => typeof x === "string").slice(0, 20)
        : [],
      intent: typeof parsed.intent === "string" ? parsed.intent.slice(0, 40) : "otra_consulta",
      readyForWhatsApp: parsed.readyForWhatsApp === true,
      urgency: ["normal", "medium", "high"].includes(parsed.urgency) ? parsed.urgency : "normal",
      quickReplies: sanitizeQuickReplies(parsed.quickReplies),
    };

    // Si se detecta urgencia alta, asegurar que quede reflejada en el lead.
    if (responsePayload.urgency === "high" && !responsePayload.lead.prioridad) {
      responsePayload.lead.prioridad = "alta";
    }

    res.status(200).json(responsePayload);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err && err.name === "AbortError") {
      res.status(504).json({ error: "Timeout" });
      return;
    }
    res.status(500).json({ error: "Internal error" });
  }
};
