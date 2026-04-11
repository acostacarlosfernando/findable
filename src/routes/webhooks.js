const express = require('express');
const crypto = require('crypto');
const { generateContent, saveToRedis, getFromRedis, llmsToHtml, tiendanubeHeaders, TIENDANUBE_API } = require('../utils');
const axios = require('axios');
const router = express.Router();

const CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET;

// Verificar firma HMAC del webhook
function verifySignature(rawBody, signature) {
  if (!CLIENT_SECRET || !signature) return false;
  const hmac = crypto.createHmac('sha256', CLIENT_SECRET);
  hmac.update(rawBody);
  const calculated = hmac.digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(signature));
  } catch {
    return false;
  }
}

// POST /webhooks/product - Recibe eventos de productos desde Tiendanube
router.post('/product', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-linkedstore-hmac-sha256'];
  const rawBody = req.body.toString();

  // Verificar autenticidad
  if (!verifySignature(rawBody, signature)) {
    console.warn('Webhook: firma invalida');
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(rawBody);
  const { store_id, event } = payload;
  console.log(`Webhook recibido: ${event} para tienda ${store_id}`);

  // Responder 200 inmediatamente (Tiendanube espera respuesta en 3s)
  res.status(200).send('OK');

  // Regenerar en background
  try {
    const accessToken = await getFromRedis(`token:${store_id}`);
    if (!accessToken) {
      console.warn(`Webhook: no hay token guardado para tienda ${store_id}`);
      return;
    }

    // Regenerar llms.txt
    const { content, domain } = await generateContent(store_id, accessToken);

    // Guardar archivo TXT en Redis
    await saveToRedis(`llms:${store_id}`, content);

    // Actualizar pagina en Tiendanube
    const headers = tiendanubeHeaders(accessToken);
    const htmlContent = llmsToHtml(content);
    const pageHandle = 'llms';

    try {
      const { data: pages } = await axios.get(`${TIENDANUBE_API}/${store_id}/pages`, { headers });
      const existing = pages.find(p => {
        const h = p.handle?.es || p.handle?.en || Object.values(p.handle || {})[0] || '';
        return h === pageHandle;
      });

      if (existing) {
        await axios.put(
          `${TIENDANUBE_API}/${store_id}/pages/${existing.id}`,
          { content: { es: htmlContent } },
          { headers }
        );
      }
      // Si la pagina no existe, no la creamos desde el webhook (requiere publicacion manual primero)
    } catch (e) {
      console.error('Webhook: error actualizando pagina:', e.response?.status, e.response?.data || e.message);
    }

    console.log(`Webhook: llms.txt regenerado para tienda ${store_id} (${event})`);
  } catch (e) {
    console.error('Webhook: error regenerando llms.txt:', e.message);
  }
});

module.exports = router;
