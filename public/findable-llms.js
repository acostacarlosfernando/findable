// Findable: vincula el llms.txt de esta tienda
(function() {
  var params = new URLSearchParams(document.currentScript.src.split('?')[1]);
  var storeId = params.get('store');
  if (!storeId) return;

  var baseUrl = document.currentScript.src.split('/findable-llms.js')[0];
  var llmsUrl = baseUrl + '/llms/' + storeId + '.txt';

  // Agregar <link> al llms.txt en el head (estándar llmstxt.org)
  var link = document.createElement('link');
  link.rel = 'llms';
  link.type = 'text/plain';
  link.href = llmsUrl;
  link.title = 'llms.txt';
  document.head.appendChild(link);

  // Agregar meta tag para descubrimiento
  var meta = document.createElement('meta');
  meta.name = 'llms-txt';
  meta.content = llmsUrl;
  document.head.appendChild(meta);
})();
