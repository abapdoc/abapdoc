import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  sourcemap: false,
  dts: false,
  format: 'esm',
  platform: 'node',
  clean: true,
  outExtensions: () => ({ js: '.js' }),
  tsconfig: 'tsconfig.lib.json',
  // Bundle everything into one self-contained file. We explicitly do
  // NOT exclude workspace deps here — tsdown otherwise treats any
  // bare import (`@abapdoc/*`) as external by default and emits them
  // as imports in the output, which then can't be resolved from the
  // dist/ folder when those workspace packages haven't been built
  // with runnable .js outputs.
  deps: {
    alwaysBundle: [/.*/],
  },
});
