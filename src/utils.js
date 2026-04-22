const axios = require('axios');

const TIENDANUBE_API = 'https://api.tiendanube.com/v1';

function tiendanubeHeaders(accessToken) {
  return {
    'Authentication': `bearer ${accessToken}`,
    'User-Agent': 'Findable (findable@app.com)',
    'Content-Type': 'application/json'
  };
}

function getText(obj, lang = 'es') {
  return obj?.[lang] || obj?.en || Object.values(obj || {})[0] || '';
}

function stripHtml(str) {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Limpiar dominio: quitar protocolo si viene incluido
function cleanDomain(domain) {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function getCustomDomain(store) {
  const custom = (store.domains || []).find(d => !d.includes('.mitiendanube.com') && !d.includes('.nuvemshop.com'));
  const raw = custom || store.original_domain || store.main_domain || '';
  return cleanDomain(raw);
}

// Convertir contenido llms.txt (markdown-like) a HTML semantico
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

// Generar contenido llms.txt a partir de datos de Tiendanube
async function generateContent(storeId, accessToken) {
  const headers = tiendanubeHeaders(accessToken);
  const timeout = 30000; // 30 segundos

  // Obtener store
  const storeRes = await axios.get(`${TIENDANUBE_API}/${storeId}/store`, { headers, timeout });
  const store = storeRes.data;

  // Obtener productos con paginacion
  const products = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data } = await axios.get(`${TIENDANUBE_API}/${storeId}/products`, {
      headers,
      timeout,
      params: { page, per_page: perPage, fields: 'id,name,description,handle,variants,images,categories' }
    });
    if (!data || !data.length) break;
    products.push(...data);
    if (data.length < perPage) break;
    page++;
  }

  let pages = [];
  try {
    const pagesRes = await axios.get(`${TIENDANUBE_API}/${storeId}/pages`, { headers });
    pages = pagesRes.data;
  } catch (e) {
    console.log('No se pudieron obtener pages:', e.message);
  }

  const domain = getCustomDomain(store);

  let llmsTxt = '';
  llmsTxt += `# ${getText(store.name)}\n\n`;
  const desc = stripHtml(getText(store.description));
  if (desc) llmsTxt += `> ${desc}\n\n`;
  llmsTxt += `- Dominio: https://${domain}\n\n`;

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
      if (cats.length) llmsTxt += `- Categorias: ${cats.join(', ')}\n`;
      if (handle) llmsTxt += `- URL: https://${domain}/productos/${handle}\n`;
      llmsTxt += '\n';
    }
  }

  if (pages.length) {
    llmsTxt += `## Paginas\n\n`;
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

  return { content: llmsTxt, domain, store, products, pages };
}

// Guardar contenido en Redis o memoria
async function saveToRedis(key, value) {
  if (process.env.REDIS_URL) {
    const { createClient } = require('redis');
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    await client.set(key, value);
    await client.quit();
  } else {
    if (!global.kvStore) global.kvStore = {};
    global.kvStore[key] = value;
  }
}

// Leer valor de Redis o memoria
async function getFromRedis(key) {
  if (process.env.REDIS_URL) {
    const { createClient } = require('redis');
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    const value = await client.get(key);
    await client.quit();
    return value;
  }
  return global.kvStore?.[key] || null;
}

module.exports = {
  TIENDANUBE_API,
  tiendanubeHeaders,
  getText,
  stripHtml,
  getCustomDomain,
  llmsToHtml,
  generateContent,
  saveToRedis,
  getFromRedis
};
