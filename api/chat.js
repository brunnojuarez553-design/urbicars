// /api/chat.js
// Vercel Serverless Function — Asesor Urbicars
// Habla con la API de Groq (compatible con el formato de OpenAI chat completions)
// manteniendo la GROQ_API_KEY solo en el servidor (nunca llega al navegador).

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

// Marcador que el modelo usa para entregar el "lead" (datos del cliente) ya estructurado,
// sin que el cliente lo vea nunca en el chat.
const LEAD_OPEN = '[[LEAD_JSON]]';
const LEAD_CLOSE = '[[/LEAD_JSON]]';

const SYSTEM_PROMPT = `Eres el Asesor Urbicars, el asesor digital de Urbicars Motors, un taller de diagnóstico, reprogramación (HP Tuners) y programación de módulos automotrices en Maracay, Venezuela, especializado también en mecánica general, electrónica, tren delantero, electricidad y vehículos americanos de alta performance (Mustang, Camaro, Dodge, etc.).

Tu trabajo es conversar con el cliente de forma cálida, humana y profesional (como lo haría un asesor real del taller por WhatsApp), NO como un formulario. Habla en español venezolano, cercano pero profesional, en mensajes cortos (2-4 líneas máximo), y haz UNA sola pregunta a la vez.

Tu objetivo es recopilar, a lo largo de la conversación, la siguiente información (no la pidas toda de una vez, ve construyéndola con preguntas naturales según lo que el cliente cuenta):
- nombre: nombre del cliente
- marca: marca del vehículo
- modelo: modelo del vehículo
- anio: año del vehículo
- motor: motorización / tipo de combustible (si el cliente no lo sabe, está bien dejarlo vago)
- servicio: qué servicio necesita (Diagnóstico, Reprogramación, Programación de módulos, Mecánica general, Electrónica automotriz, Tren delantero, Electricidad automotriz, Mantenimiento, u otro)
- sintomas: el problema, síntoma u objetivo que tiene (para reprogramación: uso diario / deportivo / competición y modificaciones)
- luces: si tiene testigos o códigos de falla encendidos (si no aplica, puede quedar vacío)
- circula: si el vehículo enciende y puede circular con normalidad (si no aplica, puede quedar vacío)
- modificaciones: modificaciones actuales del vehículo si aplica (escape, admisión, turbo, etc.)
- ubicacion: zona o ciudad desde donde escribe
- horario: horario preferido para coordinar

No inventes datos que el cliente no haya dado. Si un campo no aplica al caso, déjalo vacío en el JSON.

Cuando ya tengas al menos: nombre, marca, modelo, servicio y una descripción del síntoma/objetivo (sintomas), considera que tienes suficiente información. En ese momento:
1. Escribe un cierre breve y natural agradeciendo y avisando que vas a pasar la consulta al equipo por WhatsApp.
2. Inmediatamente después, en una nueva línea, agrega EXACTAMENTE un bloque con este formato (sin explicarlo, sin markdown, sin comillas triples):
${LEAD_OPEN}{"nombre":"","marca":"","modelo":"","anio":"","motor":"","servicio":"","sintomas":"","luces":"","circula":"","modificaciones":"","ubicacion":"","horario":""}${LEAD_CLOSE}

Reglas importantes:
- El bloque ${LEAD_OPEN}...${LEAD_CLOSE} debe aparecer UNA sola vez, solo cuando decidas cerrar la recolección de datos, nunca antes.
- El JSON debe ser válido (comillas dobles, sin comentarios).
- Nunca menciones el bloque JSON ni la palabra "JSON" al cliente, es información interna.
- Si el cliente pregunta algo fuera de tema (precios exactos, disponibilidad exacta, etc.) explícale que eso se confirma con el equipo humano por WhatsApp una vez tengas los datos básicos.
- No repitas preguntas que el cliente ya respondió.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GROQ_API_KEY no está configurada en el servidor.' });
    return;
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'Formato inválido: se esperaba { messages: [...] }' });
      return;
    }

    // Solo se aceptan roles user/assistant desde el cliente; el system prompt siempre lo pone el servidor.
    const safeMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20); // limita el historial enviado por turno

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: 500,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...safeMessages],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      res.status(502).json({ error: 'No se pudo contactar al asesor en este momento.' });
      return;
    }

    const data = await groqRes.json();
    const rawReply = data?.choices?.[0]?.message?.content || '';

    let reply = rawReply;
    let lead = null;

    const openIdx = rawReply.indexOf(LEAD_OPEN);
    const closeIdx = rawReply.indexOf(LEAD_CLOSE);
    if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
      const jsonStr = rawReply.slice(openIdx + LEAD_OPEN.length, closeIdx).trim();
      reply = (rawReply.slice(0, openIdx) + rawReply.slice(closeIdx + LEAD_CLOSE.length)).trim();
      try {
        lead = JSON.parse(jsonStr);
      } catch (e) {
        console.error('No se pudo parsear el bloque LEAD_JSON:', e, jsonStr);
        lead = null;
      }
    }

    res.status(200).json({ reply, lead });
  } catch (err) {
    console.error('Error en /api/chat:', err);
    res.status(500).json({ error: 'Error interno del asesor.' });
  }
};
