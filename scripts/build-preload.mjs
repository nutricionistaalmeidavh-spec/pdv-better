import { build } from 'esbuild';
await build({
  entryPoints: ['electron/preload.mjs'],
  outfile: 'electron/preload.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  bundle: true
});
