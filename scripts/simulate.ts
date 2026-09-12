import { simulateBuybacks } from '../lib/buybacks.ts';
console.log(
  JSON.stringify(
    simulateBuybacks({
      revenue: Number(process.argv[2] ?? 10),
      drop: Number(process.argv[3] ?? 55),
      main: process.argv.includes('--main'),
    }),
    null,
    2,
  ),
);
