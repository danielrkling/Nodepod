/**
 * Integration tests for the brotli compression polyfill.
 *
 * Reproduces the exact scenarios from:
 *   https://github.com/ScelarOrg/Nodepod/issues/17
 *
 * These tests import the zlib polyfill directly (the same module that
 * ScriptEngine exposes as `require('zlib')`) and exercise the sync / async
 * brotli paths in the order described in the bug report.
 *
 * The brotli WASM engine is loaded through the real `ensureBrotli()` path
 * (Node.js CJS fallback — identical to the CDN path in the browser, just
 * resolved from node_modules instead of esm.sh).
 */
export {};
