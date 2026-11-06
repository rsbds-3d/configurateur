export const ENGRAVING_FONT = 'Barlow Condensed';
export const ENGRAVING_MAX_LENGTH = 24;
const fonts = [
  {id:'aw-didot-light', label:'AW Conqueror Didot Light', source:'local("AW Conqueror Didot Light"), local("AW Conqueror Std Didot Light"), local("AWConquerorStdDidot-Light"), local("AWConquerorDidot-Light")', local:true},
  {id:'nickainley', label:'Nickainley Normal', file:'nickainley/Nickainley-Normal.otf'},
  {id:'barlow-condensed', label:ENGRAVING_FONT, file:'barlow-condensed/BarlowCondensed-Regular.ttf'},
  {id:'sansita-swashed', label:'Sansita Swashed', file:'sansita-swashed/SansitaSwashed.ttf'},
];
const resolveFont = value => fonts.find(font => font.id === value || font.label === value) || fonts[2];

export function normalizeEngraving(value = {}) {
  const text = String(value.text || '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (value.enabled && (!text || [...text].length > ENGRAVING_MAX_LENGTH)) throw new Error('Saisissez un prénom ou mot de 1 à 24 caractères.');
  const number = x => x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
  return {enabled: Boolean(value.enabled), text: value.enabled ? text : '', font: resolveFont(value.font).label,
    axialRatio: number(value.axialRatio) == null ? null : Math.max(0, Math.min(1, Number(value.axialRatio))), angle: number(value.angle)};
}
export function engravingFromParams(params) {
  try { return normalizeEngraving({enabled:params.get('personalization') === '1', text:params.get('engravingText'),font:params.get('engravingFont'),
    axialRatio:params.get('engravingU'),angle:params.get('engravingAngle')}); }
  catch { return normalizeEngraving(); }
}
export function engravingToParams(params, engraving) {
  const value = normalizeEngraving(engraving);
  for (const key of ['personalization','engravingText','engravingFont','engravingU','engravingAngle']) params.delete(key);
  if (value.enabled) {
    params.set('personalization','1'); params.set('engravingText',value.text);
    params.set('engravingFont',resolveFont(value.font).id);
    if(value.axialRatio != null) params.set('engravingU',String(value.axialRatio));
    if(value.angle != null) params.set('engravingAngle',String(value.angle));
  }
  return params;
}
const loadedFonts = new Map();
export function loadEngravingFont(value) {
  const {id,label,source,file,local} = resolveFont(value);
  if (!loadedFonts.has(id)) {
    loadedFonts.set(id,(async()=>{
      const face = new FontFace(`Rosebuds-${id}`, source || `url("${new URL(`../fonts/${file}`,import.meta.url)}")`);
      await face.load();
      document.fonts.add(face);
      return face.family;
    })().catch(()=>{
      loadedFonts.delete(id);
      throw new Error(local ? `Installez la police ${label} sur cet appareil pour afficher cette gravure.` : `Impossible de charger la police ${label}.`);
    }));
  }
  return loadedFonts.get(id);
}

export function populateEngravingFonts(select, value, preview) {
  const selected = resolveFont(value).id;
  select.replaceChildren(...fonts.map(({id,label,local})=>{
    const option = new Option(local ? `${label} (installation requise)` : label,id,false,id===selected);
    if (local) {
      option.disabled = true;
      loadEngravingFont(id).then(()=>{
        option.disabled = false;
        option.textContent = label;
      }).catch(()=>{});
    }
    return option;
  }));
  if (preview) {
    const updatePreview = async () => {
      const value = select.value;
      preview.style.removeProperty('font-family');
      const family = await loadEngravingFont(value).catch(()=>null);
      if (family && select.value === value) preview.style.fontFamily = `"${family}"`;
    };
    select.onchange = updatePreview;
    updatePreview();
  }
}

export async function engravingCanvas(text, font) {
  const family = await loadEngravingFont(font);
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=512;
  const ctx=canvas.getContext('2d');ctx.font=`400px "${family}"`;
  const metrics=ctx.measureText(text);
  const inkWidth=metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight;
  const inkHeight=metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent;
  const ratio=Math.min(1,1900/Math.max(1,inkWidth),440/Math.max(1,inkHeight));
  ctx.font=`${400*ratio}px "${family}"`;ctx.fillStyle='#fff';
  ctx.fillText(text,1024+(metrics.actualBoundingBoxLeft-metrics.actualBoundingBoxRight)*ratio/2,
    256+(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)*ratio/2);
  return canvas;
}
