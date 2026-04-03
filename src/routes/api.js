const express = require('express');
const axios = require('axios');
const ftp = require('basic-ftp');
const { Readable } = require('stream');
const demoData = require('../demo-data');
const router = express.Router();

const TIENDANUBE_API = 'https://api.tiendanube.com/v1';

// Middleware: verificar que hay sesión autenticada
function requireAuth(req, res, next) {
  if (!req.session.accessToken || !req.session.storeId) {
    return res.status(401).json({ error: 'No autenticado. Conectá tu tienda primero.' });
  }
  next();
}

function tiendanubeHeaders(req) {
  return {
    'Authentication': `bearer ${req.session.accessToken}`,
    'User-Agent': 'Findable (findable@app.com)',
    'Content-Type': 'application/json'
  };
}

// GET /api/store - Datos de la tienda
router.get('/store', requireAuth, async (req, res) => {
  if (req.session.demoMode) {
    const s = demoData.store;
    return res.json({
      id: s.id,
      name: s.name.es,
      description: s.description.es,
      domain: s.main_domain,
      logo: null,
      email: s.email,
      business_name: s.business_name
    });
  }

  try {
    const { data } = await axios.get(
      `${TIENDANUBE_API}/${req.session.storeId}/store`,
      { headers: tiendanubeHeaders(req) }
    );
    res.json({
      id: data.id,
      name: data.name?.es || data.name?.en || Object.values(data.name || {})[0] || 'Tienda',
      description: data.description?.es || data.description?.en || Object.values(data.description || {})[0] || '',
      domain: data.main_domain || data.original_domain,
      logo: data.logo?.src || null,
      email: data.email,
      business_name: data.business_name
    });
  } catch (error) {
    console.error('Error obteniendo store:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al obtener datos de la tienda' });
  }
});

// GET /api/products - Productos de la tienda
router.get('/products', requireAuth, async (req, res) => {
  if (req.session.demoMode) {
    const products = demoData.products.map(p => ({
      id: p.id,
      name: p.name.es,
      description: p.description.es,
      handle: p.handle.es,
      price: p.variants[0].price,
      image: p.images[0].src,
      categories: p.categories.map(c => c.name.es)
    }));
    return res.json(products);
  }

  try {
    const allProducts = [];
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data } = await axios.get(
        `${TIENDANUBE_API}/${req.session.storeId}/products`,
        {
          headers: tiendanubeHeaders(req),
          params: { page, per_page: perPage, fields: 'id,name,description,handle,variants,images,categories' }
        }
      );
      if (!data.length) break;
      allProducts.push(...data);
      if (data.length < perPage) break;
      page++;
    }

    const products = allProducts.map(p => ({
      id: p.id,
      name: p.name?.es || p.name?.en || Object.values(p.name || {})[0] || '',
      description: (p.description?.es || p.description?.en || Object.values(p.description || {})[0] || '').replace(/<[^>]*>/g, ''),
      handle: p.handle?.es || p.handle?.en || Object.values(p.handle || {})[0] || '',
      price: p.variants?.[0]?.price || null,
      image: p.images?.[0]?.src || null,
      categories: (p.categories || []).map(c => c.name?.es || c.name?.en || Object.values(c.name || {})[0] || '')
    }));

    res.json(products);
  } catch (error) {
    console.error('Error obteniendo products:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/pages - Páginas de contenido
router.get('/pages', requireAuth, async (req, res) => {
  if (req.session.demoMode) {
    const pages = demoData.pages.map(p => ({
      id: p.id,
      title: p.title.es,
      handle: p.handle.es,
      content: p.content.es
    }));
    return res.json(pages);
  }

  try {
    const { data } = await axios.get(
      `${TIENDANUBE_API}/${req.session.storeId}/pages`,
      { headers: tiendanubeHeaders(req) }
    );

    const pages = data.map(p => ({
      id: p.id,
      title: p.title?.es || p.title?.en || Object.values(p.title || {})[0] || '',
      handle: p.handle?.es || p.handle?.en || Object.values(p.handle || {})[0] || '',
      content: (p.content?.es || p.content?.en || Object.values(p.content || {})[0] || '').replace(/<[^>]*>/g, '')
    }));

    res.json(pages);
  } catch (error) {
    console.error('Error obteniendo pages:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al obtener páginas' });
  }
});

// GET /api/generate - Generar el archivo llms.txt
router.get('/generate', requireAuth, async (req, res) => {
  try {
    let store, products, pages;

    if (req.session.demoMode) {
      store = demoData.store;
      products = demoData.products;
      pages = demoData.pages;
    } else {
      const [storeRes, productsRes] = await Promise.all([
        axios.get(`${TIENDANUBE_API}/${req.session.storeId}/store`, { headers: tiendanubeHeaders(req) }),
        axios.get(`${TIENDANUBE_API}/${req.session.storeId}/products`, {
          headers: tiendanubeHeaders(req),
          params: { per_page: 200, fields: 'id,name,description,handle,variants,images,categories' }
        })
      ]);
      store = storeRes.data;
      products = productsRes.data;

      // Pages es opcional - puede fallar si no hay scope
      try {
        const pagesRes = await axios.get(
          `${TIENDANUBE_API}/${req.session.storeId}/pages`,
          { headers: tiendanubeHeaders(req) }
        );
        pages = pagesRes.data;
      } catch (e) {
        console.log('No se pudieron obtener pages (puede faltar scope):', e.message);
        pages = [];
      }
    }

    const lang = 'es';
    const getText = (obj) => obj?.[lang] || obj?.en || Object.values(obj || {})[0] || '';
    const stripHtml = (str) => str.replace(/<[^>]*>/g, '').trim();
    const domain = store.main_domain || store.original_domain;

    let llmsTxt = '';

    // Encabezado
    llmsTxt += `# ${getText(store.name)}\n\n`;
    const desc = stripHtml(getText(store.description));
    if (desc) {
      llmsTxt += `> ${desc}\n\n`;
    }
    llmsTxt += `- Dominio: ${domain}\n`;
    if (store.email) llmsTxt += `- Contacto: ${store.email}\n`;
    if (store.business_name) llmsTxt += `- Razón social: ${store.business_name}\n`;
    llmsTxt += '\n';

    // Productos
    if (products.length) {
      llmsTxt += `## Productos\n\n`;
      for (const p of products) {
        const name = getText(p.name);
        const handle = getText(p.handle);
        const pdesc = stripHtml(getText(p.description));
        const price = p.variants?.[0]?.price;
        const cats = (p.categories || []).map(c => getText(c.name)).filter(Boolean);

        llmsTxt += `### ${name}\n`;
        if (pdesc) llmsTxt += `${pdesc}\n`;
        if (price) llmsTxt += `- Precio: $${price}\n`;
        if (cats.length) llmsTxt += `- Categorías: ${cats.join(', ')}\n`;
        if (handle) llmsTxt += `- URL: https://${domain}/productos/${handle}\n`;
        llmsTxt += '\n';
      }
    }

    // Páginas
    if (pages.length) {
      llmsTxt += `## Páginas\n\n`;
      for (const p of pages) {
        const title = getText(p.title);
        const handle = getText(p.handle);
        const content = stripHtml(getText(p.content));

        llmsTxt += `### ${title}\n`;
        if (content) llmsTxt += `${content}\n`;
        if (handle) llmsTxt += `- URL: https://${domain}/${handle}\n`;
        llmsTxt += '\n';
      }
    }

    res.json({
      content: llmsTxt,
      stats: {
        products: products.length,
        pages: pages.length,
        size: Buffer.byteLength(llmsTxt, 'utf8')
      }
    });
  } catch (error) {
    console.error('Error generando llms.txt:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al generar llms.txt' });
  }
});

// POST /api/publish/tiendanube - Publicar como página en Tiendanube
router.post('/publish/tiendanube', requireAuth, express.json(), async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No hay contenido para publicar' });

  if (req.session.demoMode) {
    return res.json({
      ok: true,
      url: 'https://tienda-demo.mitiendanube.com/paginas/llms-txt/',
      message: '(Demo) Página llms-txt creada exitosamente'
    });
  }

  try {
    const headers = tiendanubeHeaders(req);
    const storeId = req.session.storeId;
    const pageContent = `<pre style="white-space:pre-wrap;font-family:monospace;">${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

    // Buscar si ya existe una página llms-txt
    const { data: pages } = await axios.get(
      `${TIENDANUBE_API}/${storeId}/pages`,
      { headers }
    );
    const existing = pages.find(p => {
      const handle = p.handle?.es || p.handle?.en || Object.values(p.handle || {})[0];
      return handle === 'llms-txt';
    });

    let result;
    if (existing) {
      // Actualizar página existente
      result = await axios.put(
        `${TIENDANUBE_API}/${storeId}/pages/${existing.id}`,
        { content: { es: pageContent } },
        { headers }
      );
    } else {
      // Crear página nueva
      result = await axios.post(
        `${TIENDANUBE_API}/${storeId}/pages`,
        {
          title: { es: 'llms.txt' },
          handle: { es: 'llms-txt' },
          content: { es: pageContent }
        },
        { headers }
      );
    }

    const { data: store } = await axios.get(
      `${TIENDANUBE_API}/${storeId}/store`,
      { headers }
    );
    const domain = store.main_domain || store.original_domain;

    res.json({
      ok: true,
      url: `https://${domain}/paginas/llms-txt/`,
      message: existing ? 'Página llms-txt actualizada' : 'Página llms-txt creada'
    });
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error('Error publicando en Tiendanube:', JSON.stringify(detail));
    res.status(500).json({
      error: `Error al publicar: ${JSON.stringify(detail)}`
    });
  }
});

// POST /api/publish/ftp - Subir llms.txt por FTP al servidor propio
router.post('/publish/ftp', requireAuth, express.json(), async (req, res) => {
  const { content, host, user, password, path: remotePath } = req.body;

  if (!content) return res.status(400).json({ error: 'No hay contenido para publicar' });
  if (!host || !user || !password) return res.status(400).json({ error: 'Faltan credenciales FTP' });

  if (req.session.demoMode) {
    return res.json({
      ok: true,
      url: `https://${host}/llms.txt`,
      message: '(Demo) Archivo llms.txt subido por FTP exitosamente'
    });
  }

  const client = new ftp.Client();
  try {
    await client.access({ host, user, password, secure: false });

    const uploadPath = remotePath
      ? `${remotePath.replace(/\/$/, '')}/llms.txt`
      : '/llms.txt';

    const stream = Readable.from([content]);
    await client.uploadFrom(stream, uploadPath);

    res.json({
      ok: true,
      url: `https://${host}/llms.txt`,
      message: 'Archivo llms.txt subido por FTP exitosamente'
    });
  } catch (error) {
    console.error('Error subiendo por FTP:', error.message);
    res.status(500).json({ error: `Error FTP: ${error.message}` });
  } finally {
    client.close();
  }
});

module.exports = router;
