type FlacLibrary = {
  isReady(): boolean;
  onready: (() => void) | undefined;
};

/** Vitest runs in Node, where libflac's wasm fetch does not. The asm.js build initializes there. */
export async function loadFlacForTests(): Promise<FlacLibrary> {
  const { createRequire } = await import("node:module");
  const flac = createRequire(import.meta.url)("libflacjs")() as FlacLibrary;
  if (flac.isReady()) return flac;
  return new Promise((resolve) => {
    flac.onready = () => resolve(flac);
  });
}
