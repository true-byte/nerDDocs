/** @jsxImportSource react */
const PATHS = {
  panel: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg
      className="i"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
