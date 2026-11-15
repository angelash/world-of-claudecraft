// LlmTransport implementations the runtime ships (docs/50_tech/llm_providers.md 2.2,
// 7; release_engineering.md 13.9): IpcTransport for the desktop shell and LocalHttpTransport
// for the web demo. The dev server's DevProxyTransport (./dev_proxy) is deliberately not
// exported here: the client imports it under import.meta.env.DEV only.

export * from './ipc';
export * from './local_http';
