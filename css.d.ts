// Ambient type declaration for global CSS side-effect imports.
//
// The bundler (Turbopack/webpack) already knows how to handle `import './x.css'`,
// but TypeScript does not ship a type for plain `*.css` files (Next only declares
// `*.module.css`). Under the stricter `noUncheckedSideEffectImports` check this
// surfaces as error ts(2882). Declaring the module here tells TypeScript the import
// is valid; it has no runtime effect.
declare module '*.css';
