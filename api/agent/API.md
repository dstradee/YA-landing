# YA Agent API

API privada machine-to-machine para que MANAGER pueda controlar el catálogo de YA.

Base:
 /api/agent

Autenticación:
 Authorization: Bearer <MANAGER_AGENT_KEY>

La clave se lee exclusivamente desde process.env.MANAGER_AGENT_KEY.

## Reglas de seguridad

- Si MANAGER_AGENT_KEY no existe, todos los endpoints responden 503 Service Unavailable.
- Una clave ausente o incorrecta responde 401 Unauthorized sin detalles adicionales.
- La comparación se realiza mediante SHA-256 + crypto.timingSafeEqual.
- No se añaden cabeceras CORS.
- Los campos de entrada están sujetos a listas blancas y validación de tipos.
- No existe ningún endpoint DELETE. Cualquier DELETE responde 405.
- Los productos nuevos siempre se crean con active=false, aunque el cliente envíe active=true.
- Las acciones se registran mediante console.log en los logs de Vercel, sin API keys, cuerpos completos, bytes de imágenes ni secretos.
- No se crean tablas, migraciones ni tablas nuevas de auditoría.
- La API utiliza el cliente Supabase de servidor existente con service_role para acceder al catálogo desde backend.
- La subida de imágenes reutiliza la función uploadImageToCloudinary existente.

## Formato general de error

Respuesta JSON:

    {
      "error": "Mensaje"
    }

Los errores de autenticación son deliberadamente genéricos.

---

# 1. Productos

## GET /api/agent/products

Lista productos con filtros.

Query params:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| q | string | No | Busca por nombre. |
| category_id | UUID | No | Filtra por categoría. |
| active | boolean | No | true o false. |
| stock_mode | enum | No | in_stock, out_of_stock u on_demand. |
| limit | integer | No | 1-100. Por defecto 50. |
| offset | integer | No | >= 0. Por defecto 0. |

Respuesta 200:

    {
      "success": true,
      "items": [],
      "total": 0,
      "limit": 50,
      "offset": 0
    }

---

## POST /api/agent/products

Crea un producto.

Content-Type:
 application/json

Campos permitidos:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| name | string | Sí | Nombre del producto. |
| description | string | No | Descripción pública. |
| category_id | UUID | Sí | UUID de una categoría existente. |
| image | string | No | URL de imagen. |
| images | string[] | No | URLs adicionales. |
| price | number | Sí | >= 0. |
| estimated_cost | number | No | >= 0. |
| active | boolean | No | Se ignora al crear: siempre queda false. |
| stock_mode | enum | No | in_stock, out_of_stock u on_demand. |
| stock_quantity | integer | No | >= 0. |
| min_stock | integer | No | >= 0. Por defecto 5. |
| internal_courier_notes | string | No | Notas internas para repartidores. |
| suggested_purchase_locations | string | No | Lugares de compra sugeridos. |
| has_variants | boolean | No | Activa variantes. |
| variants_title | string/null | No | Título del grupo de variantes. |
| variants | ProductVariant[]/null | No | Estructura de variantes existente de YA. |

El slug se genera automáticamente con la misma normalización usada por YA y se hace único si existe una colisión.

No se acepta un campo slug enviado por MANAGER.

Respuesta 201:

    {
      "success": true,
      "product": { ... }
    }

---

# 2. Productos en lote

## POST /api/agent/products/batch

Crea o actualiza productos secuencialmente.

Content-Type:
 application/json

Único campo permitido:

    {
      "items": [ ... ]
    }

Límite:
 1-100 elementos.

Reglas:

- Un item sin id crea un producto nuevo.
- Un item con id UUID actualiza ese producto.
- Los productos nuevos siempre quedan inactivos.
- No se permite borrar.
- El lote no es una transacción de base de datos: si falla un elemento, los anteriores no se revierten.

Respuesta 200:

    {
      "success": true,
      "results": [
        {
          "index": 0,
          "success": true,
          "product": { ... }
        }
      ]
    }

Los elementos fallidos devuelven:

    {
      "index": 0,
      "success": false,
      "error": "..."
    }

---

# 3. Detalle de producto

## GET /api/agent/products/:idOrSlug

El parámetro puede ser:

- UUID del producto
- slug del producto

Respuesta 200:

    {
      "success": true,
      "product": { ... }
    }

Respuesta 404:
 producto no encontrado.

---

# 4. Editar producto

## PATCH /api/agent/products/:id

El id debe ser UUID.

Campos permitidos:
 los mismos campos indicados en POST /api/agent/products.

Además, active sí puede modificarse mediante PATCH.

Si cambia name, se genera automáticamente un nuevo slug único.

Respuesta 200:

    {
      "success": true,
      "product": { ... }
    }

---

# 5. Stock

## POST /api/agent/products/:id/stock

Ajusta stock de un producto.

Content-Type:
 application/json

Campos permitidos:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| type | enum | Sí | entry, adjustment o loss. |
| quantity | integer | Condicional | Cantidad para entry/loss o delta para adjustment. |
| new_stock | integer | Condicional | Stock absoluto para adjustment. |
| reason | string | No | Motivo del movimiento. |
| mode | enum | No | in_stock, out_of_stock u on_demand. |

Ejemplo de entrada:

    {
      "type": "entry",
      "quantity": 12,
      "reason": "Reposición"
    }

Ajuste absoluto:

    {
      "type": "adjustment",
      "new_stock": 7,
      "reason": "Recuento físico"
    }

Merma:

    {
      "type": "loss",
      "quantity": 2,
      "reason": "Producto dañado"
    }

El stock nunca puede quedar negativo.

El registro de inventario se guarda en la tabla stock_movements existente. No se crea ninguna tabla de auditoría adicional.

Respuesta 200:

    {
      "success": true,
      "product": { ... }
    }

---

# 6. Categorías

## GET /api/agent/categories

Devuelve las categorías existentes para que MANAGER pueda resolver category_id.

Respuesta 200:

    {
      "success": true,
      "categories": [
        {
          "id": "uuid",
          "name": "Bebidas",
          "slug": "bebidas",
          "description": "...",
          "icon": "...",
          "image": "...",
          "sort_order": 1,
          "active": true
        }
      ]
    }

---

# 7. Imágenes

## POST /api/agent/media/upload

Sube una imagen reutilizando la integración Cloudinary existente de YA.

Content-Type:
 application/json

Campos permitidos:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| source_url | string | Uno de los dos | URL HTTP/HTTPS de una imagen. |
| file_base64 | string | Uno de los dos | Imagen codificada en Base64. |
| mime_type | string | No | MIME de la imagen. Por defecto image/jpeg. |
| folder | string | No | Carpeta Cloudinary. Por defecto ya_delivery. |

Debe enviarse exactamente una fuente: source_url o file_base64.

Límite:
 5 MB.

Respuesta 200:

    {
      "success": true,
      "url": "https://res.cloudinary.com/..."
    }

La URL devuelta pasa por la misma optimización f_auto/q_auto que usa YA actualmente.

---

# 8. DELETE

## DELETE /api/agent/products/:id

No existe operación de borrado.

Respuesta:

    HTTP 405 Method Not Allowed

Esto es intencionado: el Agent API no puede eliminar productos ni física ni lógicamente.

---

# Códigos HTTP

| Código | Significado |
|---:|---|
| 200 | Operación correcta. |
| 201 | Producto creado. |
| 400 | Datos de entrada inválidos. |
| 401 | API key ausente o incorrecta. |
| 404 | Endpoint o producto no encontrado. |
| 405 | Método HTTP no permitido. |
| 422 | No se pudo procesar una imagen externa. |
| 500 | Error interno o de base de datos. |
| 502 | Error del servicio Cloudinary. |
| 503 | MANAGER_AGENT_KEY no está configurada. API cerrada por defecto. |

---

# Archivos creados en esta fase

Solo se crean archivos nuevos dentro de api/agent:

- api/agent/_auth.ts
- api/agent/_catalog.ts
- api/agent/_cloudinary.ts
- api/agent/[...route].ts
- api/agent/API.md

No se modifican archivos existentes.
