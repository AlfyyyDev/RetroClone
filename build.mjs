// Bundles the game into dist/ as a fully static site.
// Usage: node build.mjs          -> production build
//        node build.mjs --serve  -> dev server with live rebuild on http://localhost:8080
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const serve = process.argv.includes('--serve');
const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(`${outdir}/fonts`, { recursive: true });
cpSync('index.html', `${outdir}/index.html`);
cpSync('src/styles.css', `${outdir}/styles.css`);
cpSync(
  'node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2',
  `${outdir}/fonts/press-start-2p.woff2`,
);

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  outfile: `${outdir}/game.js`,
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: outdir, port: 8080, host: '0.0.0.0' });
  console.log(`Dev server: http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
