// Findable: vincula el llms.txt de esta tienda
(function() {
  var params = new URLSearchParams(document.currentScript.src.split('?')[1]);
  var storeId = params.get('store');
  var pagePath = params.get('page');
  if (!storeId) return;

  var baseUrl = document.currentScript.src.split('/findable-llms.js')[0];
  var txtUrl = baseUrl + '/llms/' + storeId + '.txt';

  // URL principal: página on-domain si existe, sino archivo TXT externo
  var primaryUrl = pagePath
    ? (window.location.origin + '/' + pagePath + '/')
    : txtUrl;

  // <link> apuntando al recurso principal (estándar llmstxt.org)
  var link = document.createElement('link');
  link.rel = 'llms';
  link.type = pagePath ? 'text/html' : 'text/plain';
  link.href = primaryUrl;
  link.title = 'llms.txt';
  document.head.appendChild(link);

  // <meta> para descubrimiento
  var meta = document.createElement('meta');
  meta.name = 'llms-txt';
  meta.content = primaryUrl;
  document.head.appendChild(meta);
})();
