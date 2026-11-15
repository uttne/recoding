const HEADER_BYTES = 44;

function fourcc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function writeFourcc(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** 16-bit little-endian mono PCM. The returned buffer is the whole file. */
export function encodeWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  if (sampleRate <= 0) throw new Error("サンプルレートが不正です");
  const dataBytes = pcm.length * 2;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(bytes.buffer);
  writeFourcc(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeFourcc(view, 8, "WAVE");
  writeFourcc(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeFourcc(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), HEADER_BYTES);
  return bytes;
}

/** Read the 16-bit mono PCM files this app writes. */
export function decodeWav(bytes: Uint8Array): { pcm: Int16Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < HEADER_BYTES || fourcc(view, 0) !== "RIFF" || fourcc(view, 8) !== "WAVE") {
    throw new Error("WAV ではありません");
  }
  let offset = 12;
  let sampleRate = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= view.byteLength) {
    const id = fourcc(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > view.byteLength) break;
    if (id === "fmt ") {
      const format = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      const bits = view.getUint16(body + 14, true);
      if (format !== 1 || channels !== 1 || bits !== 16) throw new Error("16 bit モノラル PCM の WAV だけ読めます");
    } else if (id === "data") {
      dataOffset = body;
      dataBytes = size;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (dataOffset < 0 || sampleRate <= 0 || dataBytes % 2 !== 0) throw new Error("WAV の形式が読めません");
  const viewPcm = new Int16Array(bytes.buffer, bytes.byteOffset + dataOffset, dataBytes / 2);
  return { pcm: new Int16Array(viewPcm), sampleRate };
}
