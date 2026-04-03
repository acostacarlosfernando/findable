const express = require('express');
const axios = require('axios');
const router = express.Router();

const DEMO_MODE = process.env.DEMO_MODE === 'true';
const CLIENT_ID = process.env.TIENDANUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback';
const SCOPES = 'read_products read_content write_content write_pages';

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
    connected: !!(req.session.accessToken && req.session.storeId),
    storeId: req.session.storeId || null
  });
});

// Desconectar
router.post('/disconnect', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

module.exports = router;
