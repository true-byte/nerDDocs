/** The two Mermaid builds and the licenses of what they bundle, which `vite.config.ts` writes into the command file. */
declare module 'virtual:nerddocs-diagrams' {
  const diagrams: import('../server/diagram-builds.ts').DiagramBuilds;
  export default diagrams;
}
