/**
 * Major Chinese FOB export ports.
 *
 * Coordinates are WGS-84 and point at the container port area itself, not the
 * city centre, and each was confirmed by reverse geocoding to the right port
 * district — Yangshan, Beilun, Shekou, Yantian, Nansha, Qianwan/Huangdao,
 * Xingang, Jiangyin, Haicang and Kwai Chung respectively.
 *
 * `primary` marks the ports this business actually ships from. They are drawn
 * larger and haloed so they stand out from the rest at country zoom.
 *
 * `descriptionKey` refers to entries in the i18n bundles rather than holding
 * prose here, so the panel is fully translatable. Only factual, publicly known
 * information about each port is recorded — no business-specific logistics data
 * is invented.
 */
export const FOB_PORTS = [
  {
    id: 'shanghai',
    name: 'Shanghai',
    nameLocal: '上海港',
    city: 'Shanghai',
    province: 'Shanghai Municipality',
    latitude: 30.5948,
    longitude: 122.0686,
    terminals: ['Yangshan Deep-Water Port', 'Waigaoqiao'],
    unlocode: 'CNSHA',
    primary: true,
  },
  {
    id: 'ningbo-zhoushan',
    name: 'Ningbo-Zhoushan',
    nameLocal: '宁波舟山港',
    city: 'Ningbo',
    province: 'Zhejiang',
    latitude: 29.9024,
    longitude: 121.8406,
    terminals: ['Beilun'],
    unlocode: 'CNNGB',
    primary: true,
  },
  {
    // Was pinned inside Yantian district, which is now a port in its own
    // right, so this moves west to the Shekou/Chiwan areas it still covers.
    id: 'shenzhen',
    name: 'Shenzhen',
    nameLocal: '深圳港',
    city: 'Shenzhen',
    province: 'Guangdong',
    latitude: 22.4568,
    longitude: 113.8908,
    terminals: ['Shekou', 'Chiwan'],
    unlocode: 'CNSZX',
  },
  {
    // Commercially a port of loading in its own right — bills of lading say
    // YANTIAN, not SHENZHEN — and 35 km east of Shekou, so it gets its own pin.
    id: 'yantian',
    name: 'Yantian',
    nameLocal: '盐田港',
    city: 'Shenzhen',
    province: 'Guangdong',
    latitude: 22.5833,
    longitude: 114.2667,
    terminals: ['Yantian International Container Terminals'],
    unlocode: 'CNYTN',
    primary: true,
  },
  {
    id: 'guangzhou',
    name: 'Guangzhou',
    nameLocal: '广州港',
    city: 'Guangzhou',
    province: 'Guangdong',
    latitude: 22.73,
    longitude: 113.61,
    terminals: ['Nansha'],
    unlocode: 'CNGZG',
  },
  {
    id: 'qingdao',
    name: 'Qingdao',
    nameLocal: '青岛港',
    city: 'Qingdao',
    province: 'Shandong',
    latitude: 36.0,
    longitude: 120.15,
    terminals: ['Qianwan', 'Dongjiakou'],
    unlocode: 'CNTAO',
    primary: true,
  },
  {
    id: 'tianjin',
    name: 'Tianjin',
    nameLocal: '天津港',
    city: 'Tianjin',
    province: 'Tianjin Municipality',
    latitude: 38.9986,
    longitude: 117.7214,
    terminals: ['Xingang'],
    unlocode: 'CNTSN',
  },
  {
    id: 'fuzhou',
    name: 'Fuzhou',
    nameLocal: '福州港',
    city: 'Fuzhou',
    province: 'Fujian',
    latitude: 25.455,
    longitude: 119.32,
    terminals: ['Jiangyin'],
    unlocode: 'CNFOC',
    primary: true,
  },
  {
    id: 'xiamen',
    name: 'Xiamen',
    nameLocal: '厦门港',
    city: 'Xiamen',
    province: 'Fujian',
    latitude: 24.4885,
    longitude: 118.0266,
    terminals: ['Haicang'],
    unlocode: 'CNXMN',
    primary: true,
  },
  {
    id: 'hong-kong',
    name: 'Hong Kong',
    nameLocal: '香港港',
    city: 'Hong Kong',
    province: 'Hong Kong SAR',
    latitude: 22.361,
    longitude: 114.129,
    terminals: ['Kwai Tsing'],
    unlocode: 'HKHKG',
    primary: true,
  },
]

export const portDescriptionKey = (id) => `ports.descriptions.${id}`

/** Look up a port by the id stored on an order. */
export const getPort = (id) => FOB_PORTS.find((port) => port.id === id) ?? null
