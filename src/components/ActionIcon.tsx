export function ActionIcon({ name }: { name: 'note' | 'copy' | 'save' | 'delete' | 'add' | 'edit' | 'chevron' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {name === 'note' && <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>}
    {name === 'copy' && <><rect x="8" y="8" width="13" height="13" rx="3" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>}
    {name === 'save' && <path d="m5 12 4 4L19 6" />}
    {name === 'delete' && <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>}
    {name === 'add' && <path d="M12 5v14M5 12h14" />}
    {name === 'edit' && <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>}
    {name === 'chevron' && <path d="m9 5 7 7-7 7" />}
  </svg>;
}
