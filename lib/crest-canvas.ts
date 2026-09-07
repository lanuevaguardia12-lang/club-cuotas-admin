import type { TeamCrestFit } from "@/types/teams";

interface SourceRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface BackgroundColor {
  a: number;
  b: number;
  g: number;
  r: number;
}

const MAX_SCAN_SIZE = 420;
const CROP_PADDING_RATIO = 0.06;
const cropCache = new WeakMap<HTMLImageElement, SourceRect>();

export async function resizeCrestImageFile(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const size = 320;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas no disponible.");
  }

  const source = getCrestSourceRect(image);
  const scale = Math.min(size / source.width, size / source.height);
  const width = source.width * scale;
  const height = source.height * scale;

  canvas.width = size;
  canvas.height = size;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    (size - width) / 2,
    (size - height) / 2,
    width,
    height,
  );

  return canvas.toDataURL("image/jpeg", 0.9);
}

export function drawFittedCrestImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: TeamCrestFit,
) {
  const source = getCrestSourceRect(image);
  const ratio = Math.min(width / source.width, height / source.height) * fit.zoom;
  const drawWidth = source.width * ratio;
  const drawHeight = source.height * ratio;
  const offsetX = (width * fit.offsetX) / 100;
  const offsetY = (height * fit.offsetY) / 100;

  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    x + (width - drawWidth) / 2 + offsetX,
    y + (height - drawHeight) / 2 + offsetY,
    drawWidth,
    drawHeight,
  );
}

function getCrestSourceRect(image: HTMLImageElement): SourceRect {
  const cached = cropCache.get(image);

  if (cached) {
    return cached;
  }

  const fullRect = getFullImageRect(image);

  if (typeof document === "undefined") {
    return fullRect;
  }

  try {
    const scanScale = Math.min(
      1,
      MAX_SCAN_SIZE / Math.max(fullRect.width, fullRect.height),
    );
    const scanWidth = Math.max(1, Math.round(fullRect.width * scanScale));
    const scanHeight = Math.max(1, Math.round(fullRect.height * scanScale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return fullRect;
    }

    canvas.width = scanWidth;
    canvas.height = scanHeight;
    context.clearRect(0, 0, scanWidth, scanHeight);
    context.drawImage(image, 0, 0, scanWidth, scanHeight);

    const imageData = context.getImageData(0, 0, scanWidth, scanHeight);
    const bounds = findContentBounds(imageData);

    if (!bounds) {
      cropCache.set(image, fullRect);
      return fullRect;
    }

    const source = scaleAndPadBounds(bounds, scanScale, fullRect);
    cropCache.set(image, source);
    return source;
  } catch {
    cropCache.set(image, fullRect);
    return fullRect;
  }
}

function getFullImageRect(image: HTMLImageElement): SourceRect {
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;

  return { height, width, x: 0, y: 0 };
}

function findContentBounds(imageData: ImageData): SourceRect | null {
  const { data, height, width } = imageData;
  const background = getBackgroundColor(imageData);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;

      if (!isContentPixel(data, index, background)) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  };
}

function getBackgroundColor(imageData: ImageData): BackgroundColor {
  const { data, height, width } = imageData;
  const cornerSize = Math.max(2, Math.round(Math.min(width, height) * 0.08));
  const samples = [
    [0, 0],
    [Math.max(0, width - cornerSize), 0],
    [0, Math.max(0, height - cornerSize)],
    [Math.max(0, width - cornerSize), Math.max(0, height - cornerSize)],
  ];
  const totals = { a: 0, b: 0, g: 0, r: 0 };
  let count = 0;

  samples.forEach(([startX, startY]) => {
    for (let y = startY; y < Math.min(height, startY + cornerSize); y += 1) {
      for (let x = startX; x < Math.min(width, startX + cornerSize); x += 1) {
        const index = (y * width + x) * 4;
        totals.r += data[index] ?? 0;
        totals.g += data[index + 1] ?? 0;
        totals.b += data[index + 2] ?? 0;
        totals.a += data[index + 3] ?? 0;
        count += 1;
      }
    }
  });

  return {
    a: totals.a / count,
    b: totals.b / count,
    g: totals.g / count,
    r: totals.r / count,
  };
}

function isContentPixel(
  data: Uint8ClampedArray,
  index: number,
  background: BackgroundColor,
) {
  const r = data[index] ?? 0;
  const g = data[index + 1] ?? 0;
  const b = data[index + 2] ?? 0;
  const a = data[index + 3] ?? 0;

  if (a < 24) {
    return false;
  }

  if (background.a < 24) {
    return true;
  }

  const colorDistance =
    Math.abs(r - background.r) +
    Math.abs(g - background.g) +
    Math.abs(b - background.b);
  const alphaDistance = Math.abs(a - background.a);

  return colorDistance > 46 || alphaDistance > 46;
}

function scaleAndPadBounds(
  bounds: SourceRect,
  scanScale: number,
  fullRect: SourceRect,
): SourceRect {
  const scale = scanScale || 1;
  const x = bounds.x / scale;
  const y = bounds.y / scale;
  const width = bounds.width / scale;
  const height = bounds.height / scale;
  const padding = Math.max(2, Math.max(width, height) * CROP_PADDING_RATIO);
  const paddedX = Math.max(0, x - padding);
  const paddedY = Math.max(0, y - padding);
  const paddedRight = Math.min(fullRect.width, x + width + padding);
  const paddedBottom = Math.min(fullRect.height, y + height + padding);

  return {
    height: Math.max(1, paddedBottom - paddedY),
    width: Math.max(1, paddedRight - paddedX),
    x: paddedX,
    y: paddedY,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
