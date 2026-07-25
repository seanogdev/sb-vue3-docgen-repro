# Storybook 10.5 `vue3-vite` docgen reproduction

Minimal reproduction for **two independent docgen defects** in `@storybook/vue3-vite`'s
`vue-component-meta` plugin, both of which silently remove prop tables from autodocs.

`node verify.mjs` reports whether each fixture ends up with `__docgenInfo`, in `dev` and in
`build`. It checks the dev server's transformed module over HTTP and the static build output on
disk, so there is nothing to inspect by hand and no browser involved.

## Result

```
$ npm install && node verify.mjs

storybook dev:
  CleanButton          docgen present
  TypeExportButton     DOCGEN MISSING     <-- defect A
  ConstExportButton    docgen present

storybook build:
  CleanButton          DOCGEN MISSING     <-- defect B
  TypeExportButton     DOCGEN MISSING     <-- A and B
  ConstExportButton    DOCGEN MISSING     <-- defect B
```

On **10.4.6** all six cells read `docgen present`. Both defects are 10.5 regressions.

| | 10.4.6 | 10.5.0 – 10.5.4, 10.6.0-alpha.3 |
| --- | --- | --- |
| `vue-component-meta` | 2.2.12 | 3.3.8 |
| dev | 3 / 3 | 2 / 3 |
| build | 3 / 3 | 0 / 3 |

The plugin file is byte-identical across 10.5.0, 10.5.4 and 10.6.0-alpha.3, so neither defect is
fixed in any current release or prerelease.

## Defect A — one type-only export discards the whole file's docgen

`TypeExportButton.vue` differs from the control only by exporting a type alongside the component:

```vue
<script lang="ts">
export type TypeExportButtonVariant = 'primary' | 'secondary' | 'ghost';
</script>
<script setup lang="ts">
defineProps<{ label: string; variant?: TypeExportButtonVariant }>();
</script>
```

`vue-component-meta@3.x`'s `getExportNames()` reports type-level exports, and `getComponentMeta()`
throws for such a name. The plugin maps over every export name inside a single `try`, whose `catch`
returns `undefined`:

```ts
// frameworks/vue3-vite/src/plugins/vue-component-meta.ts
try {
  const exportNames = checker.getExportNames(id);
  let componentsMeta = exportNames.map((name) => checker.getComponentMeta(id, name));
  // ...
} catch (e) {
  return undefined;   // one bad export name discards every component in the file
}
```

So a component loses its entire prop table because it *also* exports a type. `ConstExportButton.vue`
is the control that isolates this: `getExportNames()` does not surface value exports the same way,
so an `export const` sibling is harmless. The trigger is specifically `export type` / `export
interface`.

Because an SFC cannot `export` from `<script setup>`, this affects any component using the
documented two-block pattern to publish a type — which is the idiomatic way to export a prop union.

**Fix:** resolve each export name in its own `try`/`catch`, keeping `exportNames` and
`componentsMeta` index-aligned, and return `undefined` only when nothing resolved.

## Defect B — production builds drop docgen for TS `<script setup>` SFCs

Already reported as [#35518](https://github.com/storybookjs/storybook/issues/35518), with an open
fix in [#35557](https://github.com/storybookjs/storybook/pull/35557). Included here because it is
what makes the `build` column read `0 / 3`, and because this repro exercises it alongside defect A.

`@vitejs/plugin-vue`'s `canInlineMain()` only inlines a TS `<script setup>` block when a dev server
is present, so in a production build the module Storybook transforms is an import-only shim:

```js
import _sfc_main from '/src/CleanButton.vue?vue&type=script&setup=true&lang.ts';
export * from '/src/CleanButton.vue?vue&type=script&setup=true&lang.ts';
export default _sfc_main;
```

The plugin will only attach docgen to a name that `parseLocalBindings(id, src)` reports, and that
helper collects `var`/`let`/`const`, function and class declarations while deliberately excluding
import specifiers — so `_sfc_main` is not found and docgen is never attached. It works in `dev`
because the SFC is inlined there and `_sfc_main` is a real declaration.

## Running it

```sh
npm install
node verify.mjs          # both modes
node verify.mjs dev
node verify.mjs build
```

To see the 10.4.6 reference, set both `storybook` and `@storybook/vue3-vite` to `10.4.6` in
`package.json`, reinstall, and re-run.

## Layout

```
src/CleanButton.vue         <script setup lang="ts"> only — control
src/TypeExportButton.vue    + export type    — triggers defect A
src/ConstExportButton.vue   + export const   — control showing value exports are fine
verify.mjs                  scripted dev + build docgen check
```

Each fixture has one `autodocs`-tagged story. `.storybook/main.ts` selects the engine with
`docgen: { plugin: 'vue-component-meta' }`.
