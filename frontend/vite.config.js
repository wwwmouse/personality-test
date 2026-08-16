import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // 前端发往 /api 的请求，Vite 在幕后转交给 3001 的后端
      // 这样浏览器眼里只有 5173 一个窗口，绕开跨域限制
      '/api': 'http://localhost:3001',
    },
  },
})
