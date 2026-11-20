import type { Plugin } from 'vite';

/** Managed dev pages keep a live control channel outside the restarting Vite worker. */
export function serviceNoticePlugin(): Plugin {
  return {
    name: 'hakoniwa-service-notice',
    apply: 'serve',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', async: true, src: '/src/client/service/entry.ts' },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
