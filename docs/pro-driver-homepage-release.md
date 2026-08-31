# Allstate and Pro Driver homepage section

This change adds Allstate to the six existing insurer examples and places a
Pro Driver section immediately below the grid on the English homepage and all
seven published language homepages. The insurer disclaimer continues to state
that Fabsy is independent and not affiliated with or endorsed by these brands.

## One Pro Driver program

The section advertises the same program being implemented in the separate
Pro Discount and Referrals work:

- Independent licence verification for Alberta Class 1, 2 or 4 licence holders.
- Eligible officer-issued Rapid Resolution tickets only. Camera/photo-radar
  notices, Class 5 gig couriers and standalone insurance reports are excluded.
- Twenty percent off the regular CAD 198 service fee: CAD 158.40 plus applicable
  GST. The CAD 229 bundle becomes CAD 183.20 plus applicable GST.
- The licence photo must match the declared class and client identity. An
  unverified purchase starts at the regular price, with a partial refund after
  verification under the program's rules.
- No combination with other discounts. Government fines, trial representation
  and work outside the accepted scope remain separate.

The homepage values are derived from `src/config/offers.json`. That marketing
configuration does not establish eligibility or authorize a payment discount.
The server must independently enforce the verified program. No self-attested
discount, new payment endpoint, public coupon code or checkout change is part
of this commit.

Every section links to the English `/pro-drivers` page. Non-English sections
explicitly disclose that eligibility details and the claim process are in
English. They do not advertise a translated Pro Driver purchase flow.

## Release dependency

Do not deploy this marketing commit by itself. Coordinate it with the verified
Pro Driver checkout, `/pro-drivers`, applicable terms, and their backend
validation. The public link and advertised prices must be usable when released.
Do not include unrelated unfinished changes from the shared checkout.

At the combined release, revalidate the exact language publication fingerprints
against the final English bundle, offer configuration and all source legal
documents. This commit retains the owner's machine-translation publication
basis. It does not record a native review, legal approval or staffed service
capability that has not occurred. Any later terms changes invalidate its source
document fingerprints and require a deliberate publication review.

The snapshot guard admits the new amounts only inside one complete,
source-matched Pro Driver section on the eight homepages. The ordinary prices,
structured data, outcome restrictions and 48-hour commitment checks remain
unchanged. The program's separate `/pro-drivers` page needs its own complete
validation in the coordinating task.

## Marketing handoff validation

- The production build, application TypeScript check, scoped ESLint check and
  contrast guard pass.
- Runtime dictionaries, publication gates, 34 offline SEO integration groups,
  exact promotion mutation cases and all eight actual section renders pass.
  Existing payment controls are tested without clicking checkout or making
  backend requests in the offline tests.
- The production preview rendered all 153 critical routes. Guards passed for
  all 1,275 snapshots, including 77 blog snapshots, and FAQ parity passed.
- Browser checks covered all eight homepages at a 390-pixel phone width and
  the English desktop layout. The compiled build loads the Allstate asset,
  places the promotion directly after the insurer section, and retains the
  English eligibility link. Arabic prices use explicit left-to-right isolation.

These checks validate this marketing change. They do not claim that a real
discounted payment or refund was performed, that the verified backend has been
deployed, or that the `/pro-drivers` dependency exists in this isolated base.

## Allstate asset provenance

`src/assets/logos/allstate.svg` is the unchanged wordmark served by
[Allstate Canada](https://www.allstate.ca/-/media/project/allstate/allstateca/header/logo.svg?iar=0&hash=568DC21F027B8090B0D51F795E0A15BE),
retrieved on 2026-08-31. SHA-256:

`874f087dddc2fa4ad1bfa1f19e38286cdcaa300e5a68ebb7823b9d0e4bc0e9da`

The SVG was checked for active scripts, event handlers, embedded foreign
content and external references before being added. It is a brand
identification example, not a statement of partnership, endorsement or
audience market share.
