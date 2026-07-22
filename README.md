# Urbicars Motors — Sitio Web + Asesor Urbicars (chat con IA)

Sitio web de Urbicars Motors: diagnóstico, reprogramación y programación automotriz en Maracay, Venezuela. Incluye "Asesor Urbicars", un chat que conversa con el cliente en lenguaje natural (vía la API de **Groq**), recopila los datos de su caso, y arma automáticamente un mensaje de WhatsApp con toda la información para que el equipo lo reciba ya completo.

## Estructura

```
urbicars-motors/
├── index.html          → sitio completo (HTML, CSS y JS del frontend)
├── api/
│   └── chat.js          → función serverless (Vercel) que habla con Groq
├── package.json
├── .env.example          → plantilla de variables de entorno
├── .gitignore
└── README.md
```

## Cómo funciona el chat

1. El cliente escribe en el widget del sitio (`index.html`).
2. El navegador manda el historial de la conversación a `POST /api/chat`.
3. `api/chat.js` (corre en el servidor de Vercel) agrega instrucciones internas y llama a la API de Groq usando `GROQ_API_KEY` — **esta key nunca se expone en el navegador**.
4. El modelo (`llama-3.3-70b-versatile`) conversa de forma natural, una pregunta a la vez, hasta reunir: nombre, vehículo (marca/modelo/año/motor), servicio, síntomas u objetivo, luces/códigos de falla, modificaciones, ubicación y horario preferido.
5. Cuando ya tiene lo suficiente, el modelo devuelve internamente un bloque de datos estructurados (invisible para el cliente). El frontend arma con eso un mensaje de WhatsApp prellenado y muestra el botón **"Enviar consulta a Urbicars Motors"**, que abre WhatsApp directo con toda la info ya escrita.

Si la API falla por cualquier motivo, el chat avisa y muestra igual un botón directo a WhatsApp con un mensaje genérico, para no dejar al cliente sin forma de contactar.

## Cómo subirlo a GitHub

```bash
cd urbicars-motors
git init
git add .
git commit -m "Sitio Urbicars Motors + Asesor con Groq"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/urbicars-motors.git
git push -u origin main
```

`.env` nunca se sube (está en `.gitignore`) — la key se configura directo en Vercel.

## Cómo desplegarlo en Vercel

1. Entra a [vercel.com](https://vercel.com) → **Add New Project** → importa el repo de GitHub.
2. Vercel detecta automáticamente que `index.html` es estático y que `api/chat.js` es una Serverless Function. No hace falta tocar *Build Command* ni *Output Directory*.
3. Antes (o después) de desplegar, ve a **Project → Settings → Environment Variables** y agrega:
   - **Key:** `GROQ_API_KEY`
   - **Value:** tu API key de [console.groq.com](https://console.groq.com)
   - Aplica a **Production**, **Preview** y **Development**.
4. Clic en **Deploy** (o **Redeploy** si ya estaba desplegado, para que tome la nueva variable).

## Probarlo en local

El chat necesita la función serverless corriendo, así que **no funciona solo abriendo `index.html` en el navegador** (el `fetch('/api/chat')` no tendría a quién pegarle). Para probar en local con la función activa:

```bash
npm install -g vercel   # una sola vez
cd urbicars-motors
cp .env.example .env    # y completa tu GROQ_API_KEY real ahí
vercel dev
```

Esto levanta el sitio junto con `/api/chat` en `http://localhost:3000`.

## Cambiar el modelo de Groq

El modelo usado está definido en `api/chat.js`:

```js
const MODEL = 'llama-3.3-70b-versatile';
```

Podés cambiarlo por otro modelo disponible en tu cuenta de Groq (por ejemplo uno más rápido/económico) editando esa línea.

## Notas

- Todas las imágenes se sirven desde Cloudinary (`res.cloudinary.com`), no están incluidas en este repo.
- El dominio configurado en las metaetiquetas (Open Graph, canonical, JSON-LD) es `urbicarsmotors.com` — actualízalo si el dominio final es otro.
- El número de WhatsApp del negocio se define en `CONFIG.WHATSAPP_NUMBER` dentro de `index.html`.
