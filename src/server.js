require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhooks');
const { getFromRedis } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Sesiones: Redis si disponible, sino memoria
async function setupSession() {
  let sessionStore;

  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require('redis');
      const { RedisStore } = require('connect-redis');
      const redisClient = createClient({ url: process.env.REDIS_URL });
      await redisClient.connect();
      sessionStore = new RedisStore({ client: redisClient });
      console.log('Sesiones: usando Redis');
    } catch (e) {
      console.error('Redis no disponible, usando memoria:', e.message);
    }
  } else {
    console.log('Sesiones: usando memoria (no hay REDIS_URL)');
  }

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'findable-dev-secret',
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000
    }
  }));
}

setupSession().then(() => {

  // Ruta pública: servir llms.txt por store ID
  app.get('/llms/:storeId.txt', async (req, res) => {
    try {
      const content = await getFromRedis(`llms:${req.params.storeId}`);
      if (!content) return res.status(404).send('llms.txt not found for this store');
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      });
      res.type('text/plain').send(content);
    } catch (e) {
      res.status(500).send('Error retrieving llms.txt');
    }
  });

  app.use('/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/webhooks', webhookRoutes);

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Findable corriendo en http://localhost:${PORT}`);
  });
});
