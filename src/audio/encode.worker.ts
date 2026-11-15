import { encodeAudio, type EncodeJob } from "./encode";

type WorkerScope = {
  onmessage: ((event: MessageEvent<EncodeJob>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, format, pcm, sampleRate } = event.data;
  void encodeAudio(format, pcm, sampleRate).then(
    (bytes) => {
      const copy = new Uint8Array(bytes);
      scope.postMessage({ id, bytes: copy }, [copy.buffer]);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      scope.postMessage({ id, message });
    },
  );
};
