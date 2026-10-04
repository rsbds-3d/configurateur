const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

let pdfLibrary;
function loadPdfLibrary() {
  if (globalThis.jspdf?.jsPDF) return Promise.resolve(globalThis.jspdf.jsPDF);
  pdfLibrary ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("../vendor/jspdf.umd.min.js", import.meta.url).href;
    script.onload = () => globalThis.jspdf?.jsPDF ? resolve(globalThis.jspdf.jsPDF) : reject(new Error("Moteur PDF indisponible"));
    script.onerror = () => reject(new Error("Chargement PDF impossible"));
    document.head.append(script);
  }).catch((error) => { pdfLibrary = null; throw error; });
  return pdfLibrary;
}

export async function buildProductSheetPdf({ title, choices, image, version }, PdfConstructor) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image || "")) throw new Error("Visuel PNG indisponible");
  const Pdf = PdfConstructor || await loadPdfLibrary();
  const pdf = new Pdf({ unit: "mm", format: "a4", compress: true });
  const clean = (value) => String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ");
  const header = () => {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(21); pdf.setTextColor(20);
    pdf.text("ROSEBUDS", 16, 20);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text(clean(version), 194, 20, { align: "right" });
    pdf.setDrawColor(237, 43, 134); pdf.setLineWidth(0.7); pdf.line(16, 25, 194, 25);
  };
  header();
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(14);
  const lines = pdf.splitTextToSize(clean(title), 178);
  pdf.text(lines, 16, 35);
  let y = 39 + lines.length * 6;
  const properties = pdf.getImageProperties(image);
  const imageHeight = Math.min(95, 178 * properties.height / properties.width);
  const imageWidth = imageHeight * properties.width / properties.height;
  pdf.addImage(image, "PNG", (210 - imageWidth) / 2, y, imageWidth, imageHeight);
  y += imageHeight + 10;
  pdf.setFontSize(10);
  for (const [label, value] of choices.filter(([, value]) => value)) {
    pdf.setFont("helvetica", "bold");
    const labels = pdf.splitTextToSize(clean(label), 55);
    pdf.setFont("helvetica", "normal");
    const values = pdf.splitTextToSize(clean(value), 115);
    const height = Math.max(labels.length, values.length) * 5 + 5;
    if (y + height > 280) { pdf.addPage(); header(); y = 35; pdf.setFontSize(10); }
    pdf.setTextColor(25); pdf.setFont("helvetica", "bold"); pdf.text(labels, 16, y);
    pdf.setFont("helvetica", "normal"); pdf.text(values, 78, y);
    pdf.setDrawColor(220); pdf.setLineWidth(0.2); pdf.line(16, y + height - 3, 194, y + height - 3);
    y += height;
  }
  pdf.setProperties({ title: clean(title), author: "ROSEBUDS", subject: "Configuration du plug" });
  return pdf.output("blob");
}

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
