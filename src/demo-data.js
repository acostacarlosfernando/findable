// Datos ficticios para modo demo
module.exports = {
  store: {
    id: 12345,
    name: { es: 'Tienda Demo' },
    description: { es: 'Tienda de ejemplo para probar Findable. Vendemos productos artesanales de diseño argentino.' },
    main_domain: 'tienda-demo.mitiendanube.com',
    original_domain: 'tienda-demo.mitiendanube.com',
    email: 'hola@tienda-demo.com',
    business_name: 'Demo S.R.L.',
    logo: { src: null }
  },

  products: [
    {
      id: 1,
      name: { es: 'Remera Oversize Algodón' },
      description: { es: 'Remera oversize de algodón peinado 100%. Corte relajado, ideal para el día a día. Disponible en varios colores.' },
      handle: { es: 'remera-oversize-algodon' },
      variants: [{ price: '12500.00' }],
      images: [{ src: 'https://via.placeholder.com/400' }],
      categories: [{ name: { es: 'Remeras' } }]
    },
    {
      id: 2,
      name: { es: 'Buzo Hoodie Urban' },
      description: { es: 'Buzo con capucha y bolsillo canguro. Tela frisada por dentro, perfecto para el invierno.' },
      handle: { es: 'buzo-hoodie-urban' },
      variants: [{ price: '28900.00' }],
      images: [{ src: 'https://via.placeholder.com/400' }],
      categories: [{ name: { es: 'Buzos' } }]
    },
    {
      id: 3,
      name: { es: 'Pantalón Cargo Relaxed' },
      description: { es: 'Pantalón cargo de gabardina con bolsillos laterales. Cintura elástica y corte relaxed fit.' },
      handle: { es: 'pantalon-cargo-relaxed' },
      variants: [{ price: '22000.00' }],
      images: [{ src: 'https://via.placeholder.com/400' }],
      categories: [{ name: { es: 'Pantalones' } }]
    },
    {
      id: 4,
      name: { es: 'Gorra Dad Cap Bordada' },
      description: { es: 'Gorra dad cap con logo bordado. Ajuste con hebilla metálica. Algodón lavado.' },
      handle: { es: 'gorra-dad-cap-bordada' },
      variants: [{ price: '8500.00' }],
      images: [{ src: 'https://via.placeholder.com/400' }],
      categories: [{ name: { es: 'Accesorios' } }]
    },
    {
      id: 5,
      name: { es: 'Mochila Urbana Eco' },
      description: { es: 'Mochila urbana hecha con materiales reciclados. Compartimento para notebook de hasta 15 pulgadas.' },
      handle: { es: 'mochila-urbana-eco' },
      variants: [{ price: '35000.00' }],
      images: [{ src: 'https://via.placeholder.com/400' }],
      categories: [{ name: { es: 'Accesorios' } }, { name: { es: 'Mochilas' } }]
    }
  ],

  pages: [
    {
      id: 1,
      title: { es: 'Quiénes Somos' },
      handle: { es: 'quienes-somos' },
      content: { es: 'Somos una marca argentina de diseño urbano. Creamos productos con identidad, combinando calidad y sustentabilidad. Nuestro taller está en Buenos Aires y trabajamos con productores locales.' }
    },
    {
      id: 2,
      title: { es: 'Envíos y Devoluciones' },
      handle: { es: 'envios-y-devoluciones' },
      content: { es: 'Hacemos envíos a todo el país por Correo Argentino y OCA. Envío gratis en compras mayores a $50.000. Las devoluciones se aceptan dentro de los 30 días con el producto sin uso y con etiquetas.' }
    }
  ]
};
