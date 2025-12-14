import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'https://api.predict.fun',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/v1'),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // Add API key from environment to all proxied requests
              const apiKey = env.VITE_API_KEY;
              if (apiKey) {
                proxyReq.setHeader('x-api-key', apiKey);
              }
              
              // Preserve Authorization header for JWT authentication
              const authHeader = req.headers['authorization'];
              if (authHeader) {
                proxyReq.setHeader('Authorization', authHeader);
                console.log('✅ JWT Authorization header forwarded');
              }
              
              console.log('📡 Proxying request:', req.method, req.url);
            });
          },
        },
      },
    },
  }
})
