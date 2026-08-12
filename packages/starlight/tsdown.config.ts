// tsdown.config.ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  sourcemap: true,
  format: 'esm',
  platform: 'node',
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  tsconfig: 'tsconfig.lib.json',
  dts: { build: true },
  outputOptions: {
    banner: '// tsdown.config.ts',
  },
  // ...
});
