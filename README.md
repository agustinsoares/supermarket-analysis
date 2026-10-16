# supermarket-analysis

Web personal para comparar precios de **Rema 1000**, **Kiwi** y **Extra** (Solheim Nord, Bergen).

Stack: Next.js 15 (App Router) · Supabase · Vercel · API de [Kassalapp](https://kassal.app/api/docs).

## Cómo funciona
1. Añades **productos a vigilar** (términos como `lettmelk`, `egg`).
2. «Actualizar precios» busca cada término en Rema, Kiwi y Coop vía Kassalapp, guarda los productos en `items` y apunta cada **cambio de precio** en `price_history`.
3. La página agrupa por EAN y marca el precio más bajo.

## Limitaciones de los datos (probado 2026-10)
- Kassalapp da precios **por cadena**, no por tienda física.
- **Kiwi**: buena cobertura (marcas nacionales incluidas).
- **Rema 1000**: cobertura parcial, casi solo marca propia (REMA 1000, Kolonihagen…). No aparecen marcas como Tine.
- **Extra**: Kassalapp no tiene precios de `COOP_EXTRA`. Se usa `COOP_NO` (tienda online de Coop) solo como **referencia**; puede diferir del precio en tienda.
- Cubrir Rema/Extra completos requiere los folletos (ver «Siguientes pasos»).

## Puesta en marcha
1. **Supabase**: ejecuta `supabase/migrations/0001_init.sql` en el SQL Editor.
2. Copia `.env.example` a `.env.local` y rellena las variables (nunca subas claves al repo).
3. `npm install && npm run dev`
4. En Vercel: importa este repo y define las mismas variables de entorno.

## Variables de entorno
| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servidor (solo servidor) |
| `KASSAL_TOKEN` | Token de la API de Kassalapp |
| `SYNC_SECRET` | Clave para lanzar la sincronización desde la web |

## Siguientes pasos
- Subida manual de folletos (PDF/imágenes) y lectura de ofertas con visión.
- Lista de la compra y «dónde me conviene comprar todo».
- Recetas y despensa.
