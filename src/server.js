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

async function getSessionStore() {
  if (!process.env.REDIS_URL) {
    console.log('Sesiones: usando memoria (no hay REDIS_URL)');
    return undefined;
  }
  try {
    const { createClient } = require('redis');
    const { RedisStore } = require('connect-redis');
    const redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 5000, reconnectStrategy: (retries) => retries > 3 ? false : 1000 }
    });
    redisClient.on('error', (err) => console.error('Redis error:', err.message));
    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connect timeout (5s)')), 5000))
    ]);
    console.log('Sesiones: usando Redis');
    return new RedisStore({ client: redisClient });
  } catch (e) {
    console.error('Redis no disponible, usando memoria:', e.message);
    return undefined;
  }
}

getSessionStore().then((store) => {
  app.use(session({
    store,
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
}).catch((e) => {
  console.error('Error fatal en setup:', e.message);
  process.exit(1);
});
