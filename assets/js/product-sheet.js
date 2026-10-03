const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

export function buildProductSheet({ title, choices, image, version }) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image || "")) throw new Error("Visuel PNG indisponible");
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} - ROSEBUDS</title><style>
body{font:16px Arial,sans-serif;color:#171717;background:white;margin:32px auto;padding:0 24px;max-width:900px}
header{border-bottom:3px solid #ed2b86;display:flex;justify-content:space-between;align-items:center;gap:20px}
h1{font-size:25px}small{color:#555}img{width:100%;height:auto;display:block;margin:24px 0}
dl{display:grid;grid-template-columns:minmax(140px,1fr) 2fr;margin:0}dt,dd{padding:12px 0;border-bottom:1px solid #ddd;margin:0;overflow-wrap:anywhere}dt{font-weight:bold}
@media print{body{margin:0;max-width:none}img{max-height:100mm;object-fit:contain}header,dl{break-inside:avoid}}
</style><header><h1>ROSEBUDS</h1><small>${escape(version)}</small></header><h2>${escape(title)}</h2>
<img src="${image}" alt="Vue 3D en perspective"><dl>${choices.filter(([, value]) => value).map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join("")}</dl></html>`;
}
