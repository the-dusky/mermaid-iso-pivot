import { defineConfig, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

const devtoolsPort = parseInt(process.env.DEVTOOLS_PORT ?? '42069', 10)

/**
 * Plugin to copy libavoid WASM file to public directory
 */
function copyLibavoidWasm(): Plugin {
  return {
    name: 'copy-libavoid-wasm',
    buildStart() {
      const wasmSrc = resolve(__dirname, '../../node_modules/libavoid-js/dist/libavoid.wasm')
      const wasmDest = resolve(__dirname, 'public/libavoid.wasm')

      // Create public directory if it doesn't exist
      const publicDir = dirname(wasmDest)
      if (!existsSync(publicDir)) {
        mkdirSync(publicDir, { recursive: true })
      }

      // Copy WASM file
      if (existsSync(wasmSrc)) {
        copyFileSync(wasmSrc, wasmDest)
        console.log('[libavoid] Copied libavoid.wasm to public/')
      } else {
        console.warn('[libavoid] WASM file not found at:', wasmSrc)
      }
    },
  }
}

const config = defineConfig({
  plugins: [
    copyLibavoidWasm(),
    devtools({ eventBusConfig: { port: devtoolsPort } }),
    nitro({
      preset: 'vercel',
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
