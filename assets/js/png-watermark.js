let logoPromise;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Chargement du logo ROSEBUDS impossible"));
    image.src = url;
  });
}

function getWatermarkLogo() {
  logoPromise ||= loadImage(new URL("../brand/rosebuds-logo.png", import.meta.url).href)
    .then((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas;
    }).catch((error) => { logoPromise = null; throw error; });
  return logoPromise;
}

export function drawWatermarkPattern(context, logo, width, height) {
  const logoWidth = Math.min(width, height) * 0.24;
  const logoHeight = logoWidth * logo.height / logo.width;
  const stepX = logoWidth * 1.65;
  const stepY = logoWidth * 1.25;
  const radius = Math.hypot(width, height) / 2;
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(-Math.PI / 6);
  context.globalAlpha = 0.22;
  context.shadowColor = "rgba(0, 0, 0, 0.8)";
  context.shadowBlur = logoWidth * 0.014;
  context.shadowOffsetY = logoWidth * 0.005;
  // Cover the rotated bounding square, including portrait images and the edges.
  for (let y = -Math.ceil(radius / stepY) * stepY; y <= radius; y += stepY) {
    for (let x = -Math.ceil(radius / stepX) * stepX; x <= radius; x += stepX) {
      context.drawImage(logo, x - logoWidth / 2, y - logoHeight / 2, logoWidth, logoHeight);
    }
  }
  context.restore();
}

export async function watermarkPngBlob(blob) {
  const logo = await getWatermarkLogo();
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    drawWatermarkPattern(context, logo, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((result) => result
      ? resolve(result) : reject(new Error("Export PNG impossible")), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
