const express = require('express');
const axios = require('axios');
const { saveToRedis, tiendanubeHeaders, TIENDANUBE_API } = require('../utils');
const router = express.Router();

const DEMO_MODE = process.env.DEMO_MODE === 'true';
const CLIENT_ID = process.env.TIENDANUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback';
const SCOPES = 'read_products read_content write_content write_pages write_scripts';

// Paso 1: Iniciar flujo OAuth con Tiendanube
router.get('/start', (req, res) => {
  if (DEMO_MODE) {
    req.session.accessToken = 'demo_token';
    req.session.storeId = 12345;
    req.session.demoMode = true;
    return res.redirect('/?connected=true');
  }

  const authUrl = `https://www.tiendanube.com/apps/${CLIENT_ID}/authorize`;
  res.redirect(authUrl);
});

// Paso 2: Callback de OAuth - recibir el código y canjearlo por token
router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return req.session.save(() => {
      res.redirect('/?error=no_code');
    });
  }

  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);

    const response = await axios.post('https://www.tiendanube.com/apps/authorize/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const access_token = response.data.access_token || response.data.token;
    const user_id = response.data.user_id || response.data.store_id || response.data.id;

    req.session.accessToken = access_token;
    req.session.storeId = user_id;

    // Guardar token persistente para webhooks
    await saveToRedis(`token:${user_id}`, access_token);

    // Registrar webhooks para productos (en background, no bloquea el redirect)
    registerWebhooks(user_id, access_token, req).catch(e =>
      console.error('Error registrando webhooks:', e.message)
    );

    // Guardar sesión explícitamente antes de redirigir
    req.session.save((err) => {
      if (err) console.error('Error guardando sesión:', err);
      res.redirect('/?connected=true');
    });
  } catch (error) {
    const errDetail = {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
    console.error('Error en OAuth callback:', JSON.stringify(errDetail));
    req.session.save(() => {
      res.redirect('/?error=auth_failed');
    });
  }
});

// Verificar estado de conexión
router.get('/status', (req, res) => {
  res.json({
    connected: !!(req.session?.accessToken && req.session?.storeId),
    storeId: req.session?.storeId || null
  });
});

// Desconectar
router.post('/disconnect', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Registrar webhooks para eventos de productos
async function registerWebhooks(storeId, accessToken, req) {
  const headers = tiendanubeHeaders(accessToken);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const webhookUrl = `${baseUrl}/webhooks/product`;

  // Verificar webhooks existentes
  let existingWebhooks = [];
  try {
    const { data } = await axios.get(`${TIENDANUBE_API}/${storeId}/webhooks`, { headers });
    existingWebhooks = data;
  } catch (e) {
    console.log('No se pudieron leer webhooks:', e.response?.status);
  }

  const events = ['product/created', 'product/updated', 'product/deleted'];

  for (const event of events) {
    const exists = existingWebhooks.find(w => w.event === event && w.url === webhookUrl);
    if (exists) continue;

    try {
      await axios.post(
        `${TIENDANUBE_API}/${storeId}/webhooks`,
        { event, url: webhookUrl },
        { headers }
      );
      console.log(`Webhook registrado: ${event}`);
    } catch (e) {
      console.error(`Error registrando webhook ${event}:`, e.response?.status, e.response?.data || e.message);
    }
  }
}

module.exports = router;
