# supermarket-analysis

Web personal para comparar precios de **Rema 1000**, **Kiwi** y **Extra** (Solheim Nord, Bergen).

Stack: Next.js 15 (App Router) · Supabase · Vercel · API de [Kassalapp](https://kassal.app/api/docs).

## Cómo funciona
- **Comparar**: vigilas productos (términos como `lettmelk`); «Actualizar precios» los busca en Rema, Kiwi y Coop vía Kassalapp y apunta cada **cambio de precio** en `price_history`. La tabla agrupa por EAN (o por nombre+marca+gramos) y marca el más barato. Las ofertas caducadas (`valid_to` pasado) no cuentan.
- **Productos**: alta a mano (nombre, marca, precio, supermercado, gramos, categoría, imagen, y opcionalmente vigencia y notas), edición y borrado. Un producto de Kassalapp que editas queda «bloqueado» y la sincronización ya no lo pisa.
- **Folletos**: subes un PDF (o varias imágenes) de Rema, Kiwi o Extra. La IA (Gemini o Claude) lo lee en partes de 3 páginas y guarda las ofertas como **borrador**; tú las revisas, editas y apruebas. El análisis es reanudable.
- **Acceso**: usuario y contraseña (tabla `app_users`, contraseñas con **scrypt** + sal; nunca MD5). Sesión en cookie firmada de 14 días, y bloqueo de 15 min tras 8 intentos fallidos. `SYNC_SECRET` firma las sesiones y también sirve como `Authorization: Bearer` para automatizar la API.
- **Imágenes**: se reducen en el navegador y se suben directo a Supabase Storage (`product-images`, público; `flyers`, privado).

## Limitaciones de los datos (probado 2026-10)
- Kassalapp da precios **por cadena**, no por tienda física.
- **Kiwi**: buena cobertura (marcas nacionales incluidas).
- **Rema 1000**: cobertura parcial, casi solo marca propia (REMA 1000, Kolonihagen…). No aparecen marcas como Tine.
- **Extra**: Kassalapp no tiene precios de `COOP_EXTRA`. Se usa `COOP_NO` (tienda online de Coop) solo como **referencia**; puede diferir del precio en tienda.
- Cubrir Rema/Extra completos requiere los folletos (ver «Siguientes pasos»).

## Puesta en marcha
1. **Supabase**: ejecuta en el SQL Editor, en orden, `supabase/migrations/0001_init.sql`, `0002_products_flyers.sql` y `0003_users.sql`.
   Luego crea tu usuario: `npm run user:sql -- <usuario> <contraseña>` imprime un `insert` con el hash; pégalo en el SQL Editor (el hash no se guarda en el repo). Repetirlo con otra contraseña la cambia.
2. Copia `.env.example` a `.env.local` y rellena las variables (nunca subas claves al repo).
3. `npm install && npm run dev`
4. En Vercel: importa este repo y define las mismas variables de entorno.

## Variables de entorno
| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servidor (solo servidor) |
| `KASSAL_TOKEN` | Token de la API de Kassalapp |
| `SYNC_SECRET` | Firma las sesiones (cambiarla cierra todas) y valida `Authorization: Bearer` en la API |
| `GEMINI_API_KEY` | Para leer folletos con Gemini (aistudio.google.com/apikey) |
| `GEMINI_MODEL` | Opcional; por defecto `gemini-3.8-flash` (Google retira modelos: si falla, la web lista los disponibles) |
| `ANTHROPIC_API_KEY` | Alternativa: leer folletos con Claude |
| `ANTHROPIC_MODEL` | Opcional; por defecto `claude-opus-5-5` |
| `LLM_PROVIDER` | Opcional: `gemini` o `anthropic`. Si no, se usa el que tenga clave (Gemini primero) |

## Notas
- El análisis de folletos corre en segundo plano (`maxDuration` 300 s). Si Vercel lo corta, el folleto queda «Interrumpido» y se reanuda donde se quedó.
- En Folletos hay un botón «Probar IA» que comprueba la clave y el modelo antes de subir nada.
- Los productos leídos de folletos no llevan imagen (se puede añadir al editarlos).

## Siguientes pasos
- Lista de la compra y «dónde me conviene comprar todo».
- Recetas y despensa.
