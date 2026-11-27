const SPONSOR_ROW_HEIGHT = 84;
const BOTTOM_MARGIN = 60;

export function getSponsorFooterLabelY(height: number) {
  return height - BOTTOM_MARGIN - SPONSOR_ROW_HEIGHT - 18;
}

export async function drawSponsorFooter(
  context: CanvasRenderingContext2D,
  labelColor = "rgba(255,255,255,0.75)",
) {
  const image = new Image();
  image.src = "/brand/sponsors-placas.png";
  await image.decode();

  const { width, height } = context.canvas;
  const rowWidth = (image.naturalWidth / image.naturalHeight) * SPONSOR_ROW_HEIGHT;

  context.save();
  context.fillStyle = labelColor;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = `800 ${height <= 1080 ? 24 : height <= 1350 ? 30 : 34}px Arial, sans-serif`;
  context.fillText("LA NUEVA GUARDIA", width / 2, getSponsorFooterLabelY(height));
  context.drawImage(
    image,
    (width - rowWidth) / 2,
    height - BOTTOM_MARGIN - SPONSOR_ROW_HEIGHT,
    rowWidth,
    SPONSOR_ROW_HEIGHT,
  );
  context.restore();
}
