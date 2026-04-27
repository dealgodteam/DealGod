# DealGod Go-Live Checklist

## 1) Required Config

- Set `SITE_CONFIG.affiliateTag` in `data.js` to your real Amazon Associates tag.
- Confirm `SITE_CONFIG.siteUrl` in `data.js` matches your final production domain.
- Keep mock flags disabled in `SITE_CONFIG.features` for production:
  - `enableFomoPopups: false`
  - `enablePushPromptMock: false`

## 2) Product Link Health

- Spot-check at least 20 products by clicking `View on Amazon`.
- Replace any ASINs that consistently open unavailable pages on Amazon.
- Confirm coupon flow copies code and opens Amazon link correctly.

## 3) Legal and Contact

- Verify privacy policy content is accurate for your business.
- Verify Formspree endpoint in `contact.html` is your owned form.
- Ensure affiliate disclosure is visible and accurate.

## 4) SEO and Indexing

- Update `sitemap.xml` URLs if your domain changes.
- Update `robots.txt` sitemap URL if your domain changes.
- Verify meta title/description on all pages.

## 5) Security and UX Validation

- Run site only from HTTPS in production.
- Confirm no console errors on:
  - `index.html`
  - `search.html`
  - `contact.html`
- Test mobile and desktop:
  - search
  - filters
  - gift finder
  - compare
  - contact form

## 6) Final Release Check

- Hard refresh before final QA (`Ctrl+F5`).
- Re-test top navigation links and footer links.
- Keep a backup copy of final `data.js`.
