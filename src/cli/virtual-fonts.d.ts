/** The font files of the themes, which `vite.config.ts` writes into the command file. */
declare module 'virtual:nerddocs-fonts' {
  const fonts: { files: Record<string, Uint8Array>; licenses: string };
  export default fonts;
}
