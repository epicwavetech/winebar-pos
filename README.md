# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Shared catalog and device setup

The app keeps working data in each device's IndexedDB so it can be used offline. When online, products and categories are synchronized with the shared Supabase database through the Vercel `/api` endpoints. Deploy the app with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SYNC_API_KEY` set in Vercel, and run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL editor.

After deploying, open **Settings** on every browser/device, enter the same `SYNC_API_KEY` value, and save. These sync settings are stored locally per browser; setting the key on a PC does not configure a phone. A product saved while online syncs immediately, and the shared catalog is downloaded the next time another device synchronizes. Offline changes sync when that device reconnects.

Customer accounts and Bill-to-Credit checkout require the latest API deployment and the updated `supabase/schema.sql` to be run in Supabase. Customer accounts sync across devices; BTC sales increase the selected customer's outstanding balance. POS discounts support a fixed amount per bottle and either a percentage or fixed amount on the remaining bill.

## Liquor purchase cost price

Stock In and Add Product capture case quantity, bottle size, MRP, permit levies, other charges, discounts, invoice payable, and the original invoice values on the existing purchase-batch records. Bottle quantity and total MRP are calculated from cases, bottles per case, loose bottles, and MRP per bottle. The actual invoice payable is used as acquisition cost when present; permit MRP, Ad Valorem, VAT, and TPF are not added or converted into CP by default.

No verified Assam retailer purchase-price formula is included. Without an actual invoice payable or an administrator-enabled formula verified against an applicable retailer invoice / official reference, CP is marked **Pending verification**. An Admin can edit and verify an individual invoice at **Purchases → Review values → Edit / verify invoice**. To verify the formula used when invoice payable is missing, use **Settings → Verified purchase cost formula**. The formula is disabled by default, stored per browser, and must be set on each device that records stock-in batches. Batch values and the formula snapshot used are retained for audit. The 96-bottle example calculates total MRP as ₹11,520 but leaves CP and profit/loss pending when actual payable is unknown.

Products with unverified CP are excluded from inventory valuation and gross-profit calculations. POS and Products show CP as pending, and display a prominent loss warning when verified CP exceeds MRP. Run the updated `supabase/schema.sql` in Supabase before deploying the sync changes so product CP status and purchase-batch invoice data can be synchronized.

To clear all products without older browser caches restoring them, deploy the catalog-reset sync code, close WineBar on all devices, then run this in the Supabase SQL editor:

```sql
begin;
delete from public.products;
insert into public.settings (key, value)
values ('product_catalog_reset', jsonb_build_object('resetAt', now()))
on conflict (key) do update set value = excluded.value, updated_at = now();
commit;
```

On the next sync, devices remove cached products older than the reset marker. Products created after the reset continue to sync normally.
