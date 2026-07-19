import { defineConfig } from 'tsdown';

export default defineConfig({
 entry: ['src/index.ts', 'src/native.ts'],
 format: ['esm', 'cjs'],
 dts: true,
 target: 'node18',
 clean: true,
});
