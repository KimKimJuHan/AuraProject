export const GPU_OPTIONS = [
  { name: 'Intel UHD Graphics 630', score: 1200 },
  { name: 'AMD Radeon Vega 8', score: 1700 },
  { name: 'NVIDIA GeForce GTX 750 Ti', score: 3900 },
  { name: 'NVIDIA GeForce GTX 960', score: 6000 },
  { name: 'NVIDIA GeForce GTX 970', score: 9700 },
  { name: 'NVIDIA GeForce GTX 1050 Ti', score: 6300 },
  { name: 'NVIDIA GeForce GTX 1060', score: 10000 },
  { name: 'NVIDIA GeForce GTX 1650', score: 7900 },
  { name: 'NVIDIA GeForce GTX 1660', score: 11700 },
  { name: 'NVIDIA GeForce GTX 1660 SUPER', score: 12700 },
  { name: 'NVIDIA GeForce RTX 2060', score: 14000 },
  { name: 'NVIDIA GeForce RTX 2070', score: 16000 },
  { name: 'NVIDIA GeForce RTX 2080', score: 18800 },
  { name: 'NVIDIA GeForce RTX 3050', score: 13000 },
  { name: 'NVIDIA GeForce RTX 3060', score: 17100 },
  { name: 'NVIDIA GeForce RTX 3060 Ti', score: 20500 },
  { name: 'NVIDIA GeForce RTX 3070', score: 22500 },
  { name: 'NVIDIA GeForce RTX 3080', score: 25500 },
  { name: 'NVIDIA GeForce RTX 4060', score: 19500 },
  { name: 'NVIDIA GeForce RTX 4060 Ti', score: 22500 },
  { name: 'NVIDIA GeForce RTX 4070', score: 27000 },
  { name: 'NVIDIA GeForce RTX 4080', score: 35000 },
  { name: 'AMD Radeon RX 570', score: 7000 },
  { name: 'AMD Radeon RX 580', score: 8800 },
  { name: 'AMD Radeon RX 5500 XT', score: 9200 },
  { name: 'AMD Radeon RX 5600 XT', score: 14000 },
  { name: 'AMD Radeon RX 6600', score: 16000 },
  { name: 'AMD Radeon RX 6600 XT', score: 17600 },
  { name: 'AMD Radeon RX 6700 XT', score: 22000 },
  { name: 'AMD Radeon RX 7600', score: 18000 },
  { name: 'AMD Radeon RX 7700 XT', score: 26000 },
  { name: 'AMD Radeon RX 7800 XT', score: 30000 }
];

export const GPU_SCORE_MAP = GPU_OPTIONS.reduce((acc, item) => {
  acc[item.name.toLowerCase()] = item.score;
  return acc;
}, {});
