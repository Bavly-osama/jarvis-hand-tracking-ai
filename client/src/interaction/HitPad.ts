export const CARD_HIT_PAD = 0.13;

export type NdcBox = { minX: number; maxX: number; minY: number; maxY: number };

export function pointInPaddedBox(x: number, y: number, box: NdcBox, pad = CARD_HIT_PAD) {
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  return x >= box.minX - width * pad
    && x <= box.maxX + width * pad
    && y >= box.minY - height * pad
    && y <= box.maxY + height * pad;
}
