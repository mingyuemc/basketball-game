import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // GitHub Pages 项目站点部署在 /basketball-game/ 子路径下；本地 dev 仍用根路径
  base: command === 'build' ? '/basketball-game/' : '/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
  },
}));