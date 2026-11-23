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
