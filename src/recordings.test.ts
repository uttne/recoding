import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { decodeWav } from "./audio/wav";
import { floatToInt16 } from "./audio/pcm";
import { deleteRecording, listRecordings, readRecording, saveRecording } from "./recordings";

const when = new Date(2026, 10, 16, 0, 52, 10).getTime();

describe("recordings", () => {
  beforeEach(async () => {
    for (const file of await listRecordings()) await deleteRecording(file.id);
  });

  it("stores a WAV and lists the newest take first", async () => {
    const samples = Float32Array.of(-1, -0.25, 0, 0.5, 1);
    const older = await saveRecording(samples, 48_000, when - 1000);
    const newer = await saveRecording(samples, 48_000, when);
    const listed = await listRecordings();
    expect(listed.map((file) => file.id)).toEqual([newer.id, older.id]);
    expect(newer.name).toBe("2026-11-16 00-52-10");
    expect(newer.frames).toBe(samples.length);

    const stored = await readRecording(newer.id);
    expect(stored).not.toBeNull();
    const decoded = decodeWav(stored!.wav);
    expect(decoded.sampleRate).toBe(48_000);
    expect(Array.from(decoded.pcm)).toEqual(Array.from(floatToInt16(samples)));

    await deleteRecording(newer.id);
    expect(await readRecording(newer.id)).toBeNull();
    expect((await listRecordings()).map((file) => file.id)).toEqual([older.id]);
    await deleteRecording(older.id);
  });

  it("adds a suffix when two takes share a timestamp", async () => {
    const first = await saveRecording(Float32Array.of(0.1), 44_100, when);
    const second = await saveRecording(Float32Array.of(0.2), 44_100, when);
    expect(first.name).toBe("2026-11-16 00-52-10");
    expect(second.name).toBe("2026-11-16 00-52-10 (2)");
    await deleteRecording(first.id);
    await deleteRecording(second.id);
  });
});