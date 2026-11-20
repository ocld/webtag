/// <reference types="astro/client" />
declare module "*.wasm?url" {
  const src: string;
  export default src;
}
