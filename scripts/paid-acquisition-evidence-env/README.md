# Paid-acquisition evidence environment

This directory is deliberately free of `.env` files. Vite uses it as `envDir`
only for `npm run build:evidence`, preventing local or production `.env` files
from changing the reproducible, provider-disabled evidence bundle.

The evidence build's synthetic public values and disabled measurement flags are
declared in `scripts/build-paid-acquisition-evidence.mjs`. Do not place secrets
or environment files here.
