import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      // BlockNote가 쓰는 코드 블록 하이라이트 플러그인을 증분 갱신판으로 바꾼다 (하위 경로 /shiki는 원본 유지)
      { find: /^prosemirror-highlight$/, replacement: fileURLToPath(new URL('./src/incrementalHighlightPlugin.ts', import.meta.url)) },
    ],
  },
  // 파일명에 콘텐츠 해시를 포함(vite 기본값)해 캐시 무효화를 처리함.
  // 엔트리에 ?t= 쿼리를 붙이는 방식은 동적 청크가 쿼리 없는 ./index.js를
  // 다시 import하면서 엔트리가 이중 실행되는 문제(acquireVsCodeApi 중복 호출)를 일으킴.
})
