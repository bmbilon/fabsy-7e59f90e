# HarfBuzz JavaScript

Vendored from the official `harfbuzzjs@1.6.0` npm distribution.
Source: https://github.com/harfbuzz/harfbuzzjs
Tarball: https://registry.npmjs.org/harfbuzzjs/-/harfbuzzjs-1.6.0.tgz
Tarball SHA-256: `c1e2c37480396d8d8721f909f2a7fce42153bbbc26cdd712c611d498311a2088`.

MIT license is retained in LICENSE. The only change to `index.mjs` is initialization with a local `Deno.readFile` WASM asset instead of runtime network loading. All other files are unmodified. Runtime does not call an external shaping or document service.
