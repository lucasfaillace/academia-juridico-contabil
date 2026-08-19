import "server-only";

import sharp from "sharp";

export const IMAGE_PROCESSING_LIMITS = {
  inputPixels: 40_000_000,
  desktop: { width: 1600, height: 2000 },
  mobile: { width: 800, height: 1200 },
} as const;

const webpOptions = {
  quality: 88,
  alphaQuality: 90,
  effort: 4,
  smartSubsample: true,
} as const;

type ProcessedImageVariant = {
  data: Buffer;
  width: number;
  height: number;
};

export type ProcessedArticleImage = {
  desktop: ProcessedImageVariant;
  mobile: ProcessedImageVariant;
};

async function processVariant(buffer: Buffer, width: number, height: number): Promise<ProcessedImageVariant> {
  const result = await sharp(buffer, { failOn: "error", limitInputPixels: IMAGE_PROCESSING_LIMITS.inputPixels })
    .rotate()
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .webp(webpOptions)
    .toBuffer({ resolveWithObject: true });
  if (!result.info.width || !result.info.height) throw new Error("invalid_image_dimensions");
  return { data: result.data, width: result.info.width, height: result.info.height };
}

export async function processArticleImage(buffer: Buffer): Promise<ProcessedArticleImage> {
  const { desktop, mobile } = IMAGE_PROCESSING_LIMITS;
  const [desktopImage, mobileImage] = await Promise.all([
    processVariant(buffer, desktop.width, desktop.height),
    processVariant(buffer, mobile.width, mobile.height),
  ]);
  return { desktop: desktopImage, mobile: mobileImage };
}
