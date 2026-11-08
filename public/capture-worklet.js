class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = 512;
    this.pending = new Float32Array(this.block);
    this.used = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const take = Math.min(this.block - this.used, channel.length - offset);
      this.pending.set(channel.subarray(offset, offset + take), this.used);
      this.used += take;
      offset += take;
      if (this.used === this.block) {
        const copy = this.pending.slice();
        this.port.postMessage(copy, [copy.buffer]);
        this.pending = new Float32Array(this.block);
        this.used = 0;
      }
    }
    return true;
  }
}

registerProcessor("capture", CaptureProcessor);
