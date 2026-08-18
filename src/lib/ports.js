/**
 * Major Chinese FOB export ports.
 *
 * Coordinates are WGS-84 and point at the container port area itself (not the
 * city centre) — they were checked against MapTiler geocoding for the relevant
 * port district: Yangshan, Beilun, Yantian, Nansha, Qianwan/Huangdao, Xingang,
 * Haicang and Kwai Chung respectively.
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
  },
  {
    id: 'shenzhen',
    name: 'Shenzhen',
    nameLocal: '深圳港',
    city: 'Shenzhen',
    province: 'Guangdong',
    latitude: 22.575,
    longitude: 114.26,
    terminals: ['Yantian', 'Shekou', 'Chiwan'],
    unlocode: 'CNSZX',
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
    id: 'xiamen',
    name: 'Xiamen',
    nameLocal: '厦门港',
    city: 'Xiamen',
    province: 'Fujian',
    latitude: 24.4885,
    longitude: 118.0266,
    terminals: ['Haicang'],
    unlocode: 'CNXMN',
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
  },
]

export const portDescriptionKey = (id) => `ports.descriptions.${id}`
