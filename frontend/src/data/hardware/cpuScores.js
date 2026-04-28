export const CPU_OPTIONS = [
  { name: 'Intel Core i3-8100', score: 6200 },
  { name: 'Intel Core i3-10100', score: 8800 },
  { name: 'Intel Core i5-4460', score: 4800 },
  { name: 'Intel Core i5-8400', score: 9300 },
  { name: 'Intel Core i5-9400F', score: 9600 },
  { name: 'Intel Core i5-10400', score: 12300 },
  { name: 'Intel Core i5-11400F', score: 17000 },
  { name: 'Intel Core i5-12400F', score: 19500 },
  { name: 'Intel Core i5-13400F', score: 25000 },
  { name: 'Intel Core i7-7700', score: 8600 },
  { name: 'Intel Core i7-8700', score: 13000 },
  { name: 'Intel Core i7-9700K', score: 14500 },
  { name: 'Intel Core i7-10700K', score: 19000 },
  { name: 'Intel Core i7-12700K', score: 34500 },
  { name: 'Intel Core i7-13700K', score: 47000 },
  { name: 'Intel Core i9-9900K', score: 18800 },
  { name: 'Intel Core i9-12900K', score: 41000 },
  { name: 'Intel Core i9-13900K', score: 59000 },
  { name: 'AMD Ryzen 3 3100', score: 11700 },
  { name: 'AMD Ryzen 5 1600', score: 12300 },
  { name: 'AMD Ryzen 5 2600', score: 13200 },
  { name: 'AMD Ryzen 5 3600', score: 17800 },
  { name: 'AMD Ryzen 5 5600', score: 21500 },
  { name: 'AMD Ryzen 5 5600X', score: 22000 },
  { name: 'AMD Ryzen 5 7600', score: 27000 },
  { name: 'AMD Ryzen 7 2700X', score: 17600 },
  { name: 'AMD Ryzen 7 3700X', score: 22800 },
  { name: 'AMD Ryzen 7 5800X', score: 28000 },
  { name: 'AMD Ryzen 7 7700X', score: 36500 },
  { name: 'AMD Ryzen 9 5900X', score: 39000 },
  { name: 'AMD Ryzen 9 7900X', score: 52000 }
];

export const CPU_SCORE_MAP = CPU_OPTIONS.reduce((acc, item) => {
  acc[item.name.toLowerCase()] = item.score;
  return acc;
}, {});
