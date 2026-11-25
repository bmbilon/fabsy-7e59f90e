# AnderHue parent site — November 25, 2026

The user authorized turning anderhue.ca into the AnderHue Canada Inc. parent site and moving the existing paralegal experience to /paralegal. The spoken spelling variations were resolved to the existing owned domain, anderhue.ca; /paralegal is a path, not a subdomain.

The parent site source is ontario/anderhue-group. Original portraits were supplied by Brett, along with Don's November 25 biography email. Public biographies are edited for length and omit exact birth dates and parents' names. Annette is not assigned an invented corporate title. Company descriptions do not imply that concepts or beta products are commercially available.

## Business destinations

- AVCM: on-page description and enquiry link. The historical avcm.io site returned 404; do not send users there until restored.
- See-Hear: https://see-hear.ca/ — current official positioning is consumer audio eyewear.
- AllerGenie: https://testflight.apple.com/join/8pGKqGMS — iPhone beta, not a public App Store release.
- SmartAccess: /smartaccess — existing project-level rewrite to https://smartaccess-execom.vercel.app$1 is retained. Its regex is ^(/smartaccess(?:/.*)?)$ and its rule ID is ee3c2119-ec3d-4fbb-ac98-5b4bb17885e6. Do not replace it with the parent page.
- AnderHue Paralegal: /paralegal.

## Compatibility and validation

Existing /files, /start, /admin and /sign-in URLs remain direct aliases. Signed email fragments and authentication callbacks are not redirected. The client storage keys and backend signing behavior are unchanged. Public legal pages redirect to /paralegal paths, with new canonicals and a combined sitemap. Historical email image URLs stay available.

Run npm run build:anderhue and node scripts/check-anderhue-routes.mjs through the Studio sandbox. Browser CI runs npm run verify:anderhue on Chromium, Firefox, WebKit, Chrome and Edge, including the parent layout, new prefixed app smoke checks and existing legacy client/staff fixtures. Before release, check the production SmartAccess route independently because its project-level proxy is not represented by the local static server.
