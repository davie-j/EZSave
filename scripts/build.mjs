import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = resolve(root, 'src');
const outputDirectory = resolve(root, 'dist');
const watch = process.argv.includes('--watch');

function copyStaticFiles() {
  cpSync(resolve(root, 'manifest.json'), resolve(outputDirectory, 'manifest.json'));
  cpSync(resolve(sourceDirectory, 'offscreen', 'offscreen.html'), resolve(outputDirectory, 'offscreen', 'offscreen.html'));
  cpSync(resolve(sourceDirectory, 'content', 'toast.css'), resolve(outputDirectory, 'content', 'toast.css'));

  const assetsDirectory = resolve(root, 'assets');
  if (existsSync(assetsDirectory)) {
    cpSync(assetsDirectory, resolve(outputDirectory, 'assets'), { recursive: true });
  }
}

const buildOptions = {
  absWorkingDir: root,
  entryPoints: [
    resolve(sourceDirectory, 'background', 'index.ts'),
    resolve(sourceDirectory, 'content', 'index.ts'),
    resolve(sourceDirectory, 'offscreen', 'index.ts')
  ],
  outbase: sourceDirectory,
  outdir: outputDirectory,
  bundle: true,
  format: 'esm',
  target: ['chrome116'],
  sourcemap: true,
  logLevel: 'info'
};

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
copyStaticFiles();

if (watch) {
  const buildContext = await context(buildOptions);
  await buildContext.watch();
  console.log('Watching EZSave source files.');
} else {
  await build(buildOptions);
}
