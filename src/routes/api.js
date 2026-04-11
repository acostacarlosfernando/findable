const express = require('express');
const axios = require('axios');
const ftp = require('basic-ftp');
const { Readable } = require('stream');
const demoData = require('../demo-data');
const router = express.Router();

const TIENDANUBE_API = 'https://api.tiendanube.com/v1';

// Convertir contenido llms.txt (markdown-like) a HTML semántico para página de Tiendanube
function llmsToHtml(content) {
  const lines = content.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h3>${line.slice(4)}</h3>\n`;
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h2>${line.slice(3)}</h2>\n`;
    } else if (line.startsWith('# ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h1>${line.slice(2)}</h1>\n`;
    } else if (line.startsWith('> ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<blockquote><p>${line.slice(2)}</p></blockquote>\n`;
    } else if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += `<li>${line.slice(2)}</li>\n`;
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>\n'; inList = false; }
    } else {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<p>${line}</p>\n`;
    }
  }
  if (inList) html += '</ul>\n';
  return html;
}

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
      logo: null
    });
  }

  try {
    const { data } = await axios.get(
      `${TIENDANUBE_API}/${req.session.storeId}/store`,
      { headers: tiendanubeHeaders(req) }
    );
    // Preferir dominio personalizado sobre subdominio de Tiendanube
    const customDomain = (data.domains || []).find(d => !d.includes('.mitiendanube.com') && !d.includes('.nuvemshop.com'));
    const domain = customDomain || data.original_domain || data.main_domain;

    res.json({
      id: data.id,
      name: data.name?.es || data.name?.en || Object.values(data.name || {})[0] || 'Tienda',
      description: data.description?.es || data.description?.en || Object.values(data.description || {})[0] || '',
      domain,
      logo: data.logo?.src || null
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

    // Preferir dominio personalizado sobre subdominio de Tiendanube
    const customDomain = (store.domains || []).find(d => !d.includes('.mitiendanube.com') && !d.includes('.nuvemshop.com'));
    const domain = customDomain || store.original_domain || store.main_domain;

    let llmsTxt = '';

    // Encabezado (sin datos sensibles: email ni razón social)
    llmsTxt += `# ${getText(store.name)}\n\n`;
    const desc = stripHtml(getText(store.description));
    if (desc) {
      llmsTxt += `> ${desc}\n\n`;
    }
    llmsTxt += `- Dominio: https://${domain}\n`;
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

// POST /api/publish/tiendanube - Publicar llms.txt (página en dominio + archivo TXT externo)
router.post('/publish/tiendanube', requireAuth, express.json(), async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No hay contenido para publicar' });

  const storeId = req.session.storeId;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const txtUrl = `${baseUrl}/llms/${storeId}.txt`;

  if (req.session.demoMode) {
    return res.json({
      ok: true,
      pageUrl: 'https://tienda-demo.mitiendanube.com/llms/',
      txtUrl,
      storeDomain: 'tienda-demo.mitiendanube.com',
      message: '(Demo) Página y archivo llms.txt publicados'
    });
  }

  const headers = tiendanubeHeaders(req);
  const result = { ok: true, txtUrl, pageUrl: null, storeDomain: '', pageCreated: false, errors: [] };

  try {
    // Paso 1: Obtener datos de la tienda (dominio)
    try {
      const { data: store } = await axios.get(`${TIENDANUBE_API}/${storeId}/store`, { headers });
      const custom = (store.domains || []).find(d => !d.includes('.mitiendanube.com') && !d.includes('.nuvemshop.com'));
      result.storeDomain = custom || store.original_domain || store.main_domain || '';
    } catch (e) {
      console.error('Error obteniendo store:', e.response?.data || e.message);
    }

    // Paso 2: Guardar contenido en Redis o memoria (archivo TXT externo)
    if (process.env.REDIS_URL) {
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.set(`llms:${storeId}`, content);
      await client.quit();
    } else {
      if (!global.llmsStore) global.llmsStore = {};
      global.llmsStore[storeId] = content;
    }

    // Paso 3: Crear/actualizar página en Tiendanube (contenido on-domain)
    const htmlContent = llmsToHtml(content);
    const pageHandle = 'llms';
    let existingPageId = null;

    try {
      // Buscar si ya existe la página "llms"
      const { data: pages } = await axios.get(`${TIENDANUBE_API}/${storeId}/pages`, { headers });
      const existing = pages.find(p => {
        const h = p.handle?.es || p.handle?.en || Object.values(p.handle || {})[0] || '';
        return h === pageHandle;
      });
      if (existing) existingPageId = existing.id;
    } catch (e) {
      console.log('No se pudieron leer páginas:', e.response?.status);
    }

    try {
      if (existingPageId) {
        await axios.put(
          `${TIENDANUBE_API}/${storeId}/pages/${existingPageId}`,
          { content: { es: htmlContent } },
          { headers }
        );
      } else {
        await axios.post(
          `${TIENDANUBE_API}/${storeId}/pages`,
          {
            title: { es: 'Información para asistentes de IA' },
            handle: { es: pageHandle },
            content: { es: htmlContent }
          },
          { headers }
        );
      }
      result.pageCreated = true;
      if (result.storeDomain) {
        result.pageUrl = `https://${result.storeDomain}/${pageHandle}/`;
      }
    } catch (e) {
      const errDetail = e.response?.data || e.message;
      console.error('Error creando página:', e.response?.status, errDetail);
      result.errors.push({ step: 'page', status: e.response?.status, detail: errDetail });
    }

    // Paso 4: Inyectar/actualizar script en la tienda (meta tags para descubrimiento)
    let existingScriptId = null;
    try {
      const { data: scripts } = await axios.get(`${TIENDANUBE_API}/${storeId}/scripts`, { headers });
      const existing = scripts.find(s => s.src && s.src.includes('findable-llms'));
      if (existing) existingScriptId = existing.id;
    } catch (e) {
      console.log('No se pudieron leer scripts:', e.response?.status);
    }

    const scriptParams = `store=${storeId}` + (result.pageCreated ? `&page=${pageHandle}` : '');
    const scriptUrl = `${baseUrl}/findable-llms.js?${scriptParams}`;

    try {
      if (existingScriptId) {
        await axios.put(
          `${TIENDANUBE_API}/${storeId}/scripts/${existingScriptId}`,
          { src: scriptUrl, event: 'onload', where: 'store' },
          { headers }
        );
      } else {
        await axios.post(
          `${TIENDANUBE_API}/${storeId}/scripts`,
          { src: scriptUrl, event: 'onload', where: 'store' },
          { headers }
        );
      }
    } catch (e) {
      const errDetail = e.response?.data || e.message;
      console.error('Error inyectando script:', e.response?.status, errDetail);
      result.errors.push({ step: 'script', status: e.response?.status, detail: errDetail });
    }

    // Construir mensaje según lo que funcionó
    if (result.pageCreated && result.errors.length === 0) {
      result.message = 'Página y archivo llms.txt publicados exitosamente';
    } else if (result.pageCreated) {
      result.message = 'Página publicada. Archivo TXT disponible como respaldo.';
    } else if (result.errors.length > 0) {
      result.message = 'Archivo TXT publicado. No se pudo crear la página en tu tienda (podés crearla manualmente).';
    } else {
      result.message = 'Archivo llms.txt publicado';
    }

    res.json(result);
  } catch (error) {
    console.error('Error publicando:', error.message);
    res.status(500).json({ error: 'Error al publicar' });
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
