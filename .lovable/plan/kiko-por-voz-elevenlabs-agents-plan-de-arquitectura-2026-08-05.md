# Kiko por voz (ElevenLabs Agents) — Plan de arquitectura

Objetivo: añadir una llamada de voz en tiempo real con Kiko **solo** en el Asistente de Cocina (`/chef`), con transcripciones dentro del hilo local, mismo contexto que el modelo de texto, y límites diarios de uso a prueba de fraude.

No se toca nada de `/descubrir` (Kiko Descubrir queda idéntico). El historial de `/chef` sigue siendo local (`sessionStorage`), y las transcripciones de voz se guardan ahí mismo: desaparecen al reiniciar la conversación.

## 1. Base de datos: control de tiempo diario

Migración sobre `profiles`:

- `voice_seconds_used_today` integer NOT NULL default 0
- `voice_usage_date` date NULL (día al que corresponde el contador, en zona horaria fija America/Bogota)

Blindajes:

- El trigger existente `prevent_profile_privilege_escalation` se amplía para que un usuario **no pueda** modificar estas dos columnas desde el cliente: cualquier `UPDATE` que no venga del rol de servicio revierte los valores. Todo el conteo se escribe desde el servidor.
- El "reset a medianoche" no necesita cronjob: si `voice_usage_date` es distinto del día actual, el servidor trata el contador como 0 y lo reescribe. Es más barato y no puede desincronizarse.
- Límites como constantes de servidor: gratis 60 s/día, Melik+ 900 s/día. Los `dev`/admin y usuarios con Melik+ indefinido usan el límite de Melik+.

## 2. Server functions (nuevas, en `src/lib/voice.functions.ts`)

- `getVoiceQuota()` — devuelve `{ limitSeconds, usedSeconds, remainingSeconds, isPremium }`. Lo usa la UI para pintar el estado y decidir si el micrófono está disponible.
- `getElevenLabsToken()` — valida sesión, recalcula la cuota, y si `remainingSeconds <= 0` lanza un error de límite. Si hay tiempo, pide a ElevenLabs un **conversation token** (WebRTC) para el agente configurado y devuelve `{ token, remainingSeconds }`. La API key nunca sale del servidor.
- `logVoiceUsage({ seconds })` — suma segundos consumidos (con tope defensivo por llamada para que un cliente manipulado no reste tiempo raro), rota el día si cambió, y devuelve `{ remainingSeconds }`. El cliente lo llama cada 15 s y una vez al colgar.

Credenciales (ya entregadas): se guardan como secretos del backend `ELEVENLABS_API_KEY` y `ELEVENLABS_AGENT_ID`. Nunca se exponen al navegador ni se escriben en el código.


## 3. Contexto paritario con el modelo de texto

Hoy el texto envía a Gemini: `CHEF_PERSONAL_SYSTEM_PROMPT` + catálogo de recetas del usuario, y cuando hay receta adjunta, el bloque formateado por `formatRecipeForLLM` (título, categoría, tiempo, ingredientes, pasos).

Para voz se reutilizan **las mismas funciones**, sin duplicar prompts:

- El cliente construye el mismo `systemPrompt` y, si hay receta activa/adjunta, el mismo bloque de receta, y lo envía a `getElevenLabsToken`.
- Al abrir la sesión se pasa como `overrides.agent.prompt.prompt` (prompt del sistema) + `dynamic_variables` con `recipe_title`, `recipe_context` y `first_name`, de modo que el agente arranque hablando de la receta correcta.
- Requisito de configuración en el panel de ElevenLabs (queda documentado en el plan de trabajo): habilitar overrides de prompt/primer mensaje y el idioma español para ese agente.

## 4. UI/UX en `/chef`

Cambios acotados al bloque del input y al hilo de mensajes:

- **Botón dinámico:** con `input.trim().length === 0` y sin adjuntos se muestra el botón de micrófono; al escribir el primer carácter se cambia por "Enviar"; al enviar y quedar vacío, vuelve el micrófono.
- **Permiso de hardware:** al pulsar el micrófono se pide `getUserMedia({ audio: true })` antes de conectar. Si se deniega o no hay micrófono, toast explicando que hay que habilitar el permiso, y no se consume cuota.
- **Estado en llamada:** el `textarea` y el menú de adjuntos quedan deshabilitados; el área del input se sustituye por una barra de llamada con ondas de sonido animadas (barras que reaccionan al nivel de audio de entrada/salida) en ocre/verde de la paleta, el tiempo restante en cuenta atrás, y un botón rojo circular para **Colgar**.
- **Transcripciones en vivo:** cada fragmento del usuario y de Kiko se inserta en el mismo estado `messages` con burbujas idénticas a las escritas. Mientras un turno está en curso se muestra como burbuja "provisional" que se va completando; al cerrarse el turno queda fija en el hilo. Un pequeño icono de micrófono distingue lo dicho por voz de lo escrito.
- **Corte en vivo:** un temporizador local descuenta el tiempo y el ping al servidor lo corrige. Al llegar a 0 se cierra la sesión inmediatamente y se abre un modal: para gratuitos, "Alcanzaste tu minuto diario" con botón a Melik+; para Melik+, aviso de límite alcanzado y cuándo se renueva.
- Si la cuota ya está agotada al entrar, el micrófono aparece deshabilitado con tooltip explicando el límite (y el upsell para gratuitos).

## 5. Detalles técnicos

- SDK: paquete npm **`@elevenlabs/client`** (`Conversation.startSession`) con WebRTC. **Prohibido** el embed HTML `<elevenlabs-convai>`: necesitamos control total de UI, transcripciones y ciclo de vida.
- El SDK se carga con import dinámico dentro de un componente cliente (`src/components/chef/VoiceCallBar.tsx`) para no engordar el bundle inicial ni romper SSR.

- Toda la lógica de voz vive en un hook nuevo `src/hooks/use-kiko-voice.ts` (conexión, permisos, quota, pings, corte). `chef.tsx` solo consume el hook y renderiza; su lógica de chat de texto no se altera.
- Los errores nuevos se registran en el catálogo central (`src/lib/errors/catalog.ts`): límite diario alcanzado, permiso de micrófono denegado, voz no disponible/credenciales faltantes.
- Nada de esto se importa desde `/descubrir`.

## 6. Orden de implementación

1. Migración SQL de cuota + endurecimiento del trigger `prevent_profile_privilege_escalation`.
2. Guardar los dos secretos de ElevenLabs y crear `voice.functions.ts` (`getVoiceQuota`, `getElevenLabsToken` con prompt + variables dinámicas, `logVoiceUsage`).
3. Instalar `@elevenlabs/client`, crear el hook de voz, el botón dinámico micrófono/enviar y `getUserMedia`.
4. Barra de llamada activa: ondas, cuenta atrás, botón rojo de colgar, textarea deshabilitado.
5. WebRTC + transcripciones en el estado local `messages` (icono de micrófono para distinguir voz de texto) y corte forzado al llegar a 0 segundos.

