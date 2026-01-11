import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GOOGLE_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GOOGLE_API_KEY),
        'process.env.NEO4J_URI': JSON.stringify(env.NEO4J_URI),
        'process.env.NEO4J_USERNAME': JSON.stringify(env.NEO4J_USERNAME),
        'process.env.NEO4J_PASSWORD': JSON.stringify(env.NEO4J_PASSWORD)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
