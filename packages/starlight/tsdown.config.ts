// tsdown.config.ts
import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: ['./src/index.ts'],
    bundleDts: true,
    sourcemap: true,
    dts: true,
    format: 'esm',
    outputOptions: {
        banner: '// tsdown.config.ts'
    },
    external: [
        '@abaplint/core',
    ],
    inputOptions: {
        resolve: {
            tsconfigFilename: 'tsconfig.lib.json'
        }
    },
    clean: true,
    platform: 'node',
    // ...
})