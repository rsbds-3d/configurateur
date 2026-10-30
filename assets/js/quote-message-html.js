const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function inline(text) {
  return escape(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/_([^_\n]+)_/g, '<em>$1</em>');
}

export function quoteMessageHtml(message, rows, viewerUrl) {
  const lines = String(message).replace(/\r\n?/g, '\n').split('\n');
  const known = new Map(rows.map(([key, value]) => [`${key} : ${value}`, [key, value]]));
  const cell = 'padding:11px 12px;border:1px solid #dedede;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;';
  const result = [];
  let tableAdded = false;
  const table = () => '<table width="100%" aria-label="Configuration du produit" style="width:100%;table-layout:fixed;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;margin:18px 0;">'
    + '<tr><th colspan="2" style="padding:12px;background:#38383b;color:#fff;text-align:left;border-top:3px solid #fe3a9e;">Configuration du produit</th></tr>'
    + rows.map(([key,value], n) => `<tr style="background:${n % 2 ? '#fcf1f6' : '#ffffff'};"><th scope="row" width="42%" style="${cell}font-weight:normal;color:#5d5d5d;">${escape(key)}</th><td style="${cell}color:#38383b;font-weight:bold;">${escape(value)}</td></tr>`).join('') + '</table>';
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    if (known.has(lines[i])) {
      while (i < lines.length && known.has(lines[i])) i++;
      if (!tableAdded) { result.push(table()); tableAdded = true; }
      continue;
    }
    if (/^[-*] /.test(lines[i])) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(`<li style="margin:4px 0;">${inline(lines[i++].slice(2))}</li>`);
      result.push(`<ul style="margin:12px 0;padding-left:24px;">${items.join('')}</ul>`);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !known.has(lines[i]) && !/^[-*] /.test(lines[i])) {
      const line = lines[i++];
      paragraph.push(line === `Configuration 3D : ${viewerUrl}`
        ? `<a href="${escape(viewerUrl)}" style="color:#a91f62;text-decoration:underline;">Voir ma configuration 3D</a>` : inline(line));
    }
    result.push(`<p style="margin:0 0 16px;">${paragraph.join('<br>')}</p>`);
  }
  if (!tableAdded) result.splice(Math.min(1, result.length), 0, table());
  return result.join('');
}

export function formatQuoteSelection(field, command) {
  const start = field.selectionStart, end = field.selectionEnd;
  const selected = field.value.slice(start, end);
  const text = command === 'list' ? (selected || 'Votre demande').split('\n').map(line => '- ' + line).join('\n')
    : command === 'bold' ? `**${selected || 'Texte en gras'}**` : `_${selected || 'Texte en italique'}_`;
  field.setRangeText(text, start, end, 'select');
  field.focus();
  field.dispatchEvent(new Event('input', {bubbles:true}));
}
