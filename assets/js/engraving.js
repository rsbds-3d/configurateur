export const ENGRAVING_FONT = 'Barlow Condensed';
export const ENGRAVING_MAX_LENGTH = 24;
export function normalizeEngraving(value = {}) {
  const text = String(value.text || '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (value.enabled && (!text || [...text].length > ENGRAVING_MAX_LENGTH)) throw new Error('Saisissez un prénom ou mot de 1 à 24 caractères.');
  const number = x => x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
  return {enabled: Boolean(value.enabled), text: value.enabled ? text : '', font: ENGRAVING_FONT,
    axialRatio: number(value.axialRatio) == null ? null : Math.max(0, Math.min(1, Number(value.axialRatio))), angle: number(value.angle)};
}
export function engravingFromParams(params) {
  try { return normalizeEngraving({enabled:params.get('personalization') === '1', text:params.get('engravingText'),
    axialRatio:params.get('engravingU'),angle:params.get('engravingAngle')}); }
  catch { return normalizeEngraving(); }
}
export function engravingToParams(params, engraving) {
  const value = normalizeEngraving(engraving);
  for (const key of ['personalization','engravingText','engravingU','engravingAngle']) params.delete(key);
  if (value.enabled) {
    params.set('personalization','1'); params.set('engravingText',value.text);
    if(value.axialRatio != null) params.set('engravingU',String(value.axialRatio));
    if(value.angle != null) params.set('engravingAngle',String(value.angle));
  }
  return params;
}
let fontReady;
export function loadEngravingFont() {
  return fontReady ||= (async()=>{
    const font = new FontFace(ENGRAVING_FONT, `url(${new URL('../fonts/barlow-condensed/BarlowCondensed-Regular.ttf',import.meta.url)})`);
    await font.load(); document.fonts.add(font);
  })().catch(error=>{fontReady=null;throw error;});
}
export async function engravingCanvas(text) {
  await loadEngravingFont();
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=512;
  const ctx=canvas.getContext('2d');ctx.font=`400px "${ENGRAVING_FONT}"`;
  const size=Math.min(400,400*1900/Math.max(1,ctx.measureText(text).width));
  ctx.font=`${size}px "${ENGRAVING_FONT}"`;ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,1024,256);return canvas;
}
