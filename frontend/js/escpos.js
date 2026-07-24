/** ESC/POS raster (GS v 0) for 80mm USB thermal via RawBT */

const ESCPOS_PRINT_WIDTH_PX = 576;
const ESCPOS_FEED_LINES = 4;
const ESCPOS_PACKAGE = "ru.a402d.rawbtprinter";

function concatEscPosBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function escPosBytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function canvasToGsV0Raster(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const raster = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const gray =
        pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
      if (gray < 128) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        raster[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;
  const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
  return concatEscPosBytes(header, raster);
}

function buildEscPosReceiptFromCanvas(canvas) {
  const init = new Uint8Array([0x1b, 0x40]);
  const raster = canvasToGsV0Raster(canvas);
  const feedCut = new Uint8Array([
    0x1b,
    0x64,
    ESCPOS_FEED_LINES,
    0x1d,
    0x56,
    0x00,
  ]);
  return concatEscPosBytes(init, raster, feedCut);
}

/** RawBT silent path — binary ESC/POS via intent:base64 (Mike42 RawbtPrintConnector) */
function buildRawBtEscPosIntent(escposBase64) {
  return (
    `intent:base64,${escposBase64}` +
    `#Intent;scheme=rawbt;launchFlags=0x10000000;package=${ESCPOS_PACKAGE};end;`
  );
}
