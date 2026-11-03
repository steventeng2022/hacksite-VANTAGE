const paths={
  overview:'<path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z"/>',
  constellation:'<circle cx="12" cy="12" r="2.5"/><path d="M3 12c3-6 15-6 18 0-3 6-15 6-18 0Zm9-9c6 3 6 15 0 18-6-3-6-15 0-18Z"/>',
  station:'<path d="M12 21v-7m-5 7h10M8.5 14a5 5 0 0 1 7 0M5 10.5a10 10 0 0 1 14 0"/><circle cx="12" cy="10" r="1.5"/>',
  command:'<path d="m4 12 6 6L21 3l-7 18-4-7-6-2Z"/>',
  timeline:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  access:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0 2 2 4-4"/>',
  incident:'<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  console:'<path d="m5 7-3 5 3 5m14-10 3 5-3 5M14 4l-4 16"/>',
  ledger:'<path d="M4 4h16v16H4zM8 8h8m-8 4h8m-8 4h5"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  satellite:'<path d="m9 15 6-6m-3-3 6 6-3 3-6-6 3-3ZM5 14l5 5-2 2-5-5 2-2Zm9-9 5 5 2-2-5-5-2 2Z"/><path d="M3 21 9 15m6-6 6-6"/>'
};
export function icon(name,label=''){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="${label?'false':'true'}"${label?` aria-label="${escapeHTML(label)}"`:''}>${paths[name]||paths.overview}</svg>`}
export function escapeHTML(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
