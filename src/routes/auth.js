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

  const authUrl = `https://www.tiendanube.com/apps/authorize/token?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}`;
  res.redirect(authUrl);
});

// Paso 2: Callback de OAuth - recibir el código y canjearlo por token
router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('No se recibió código de autorización');
  }

  try {
    const response = await axios.post('https://www.tiendanube.com/apps/authorize/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code
    });

    const { access_token, user_id } = response.data;

    req.session.accessToken = access_token;
    req.session.storeId = user_id;

    res.redirect('/?connected=true');
  } catch (error) {
    console.error('Error en OAuth callback:', error.response?.data || error.message);
    res.redirect('/?error=auth_failed');
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
