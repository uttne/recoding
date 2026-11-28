import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { floatToInt16 } from "../../../audio/pcm";
import { encodeWav } from "../../../audio/wav";

const DB_NAME = "pitch-recorder";
const DB_VERSION = 1;

export type RecordingFile = {
  id: string;
  name: string;
  createdAt: number;
  sampleRate: number;
  frames: number;
};

export type StoredRecording = RecordingFile & { wav: Uint8Array };

interface RecordingDB extends DBSchema {
  files: {
    key: string;
    value: RecordingFile;
    indexes: { "by-created": number };
  };
  blobs: {
    key: string;
    value: ArrayBuffer;
  };
}

let opening: Promise<IDBPDatabase<RecordingDB>> | null = null;

function database(): Promise<IDBPDatabase<RecordingDB>> {
  if (!opening) {
    opening = openDB<RecordingDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const files = db.createObjectStore("files", { keyPath: "id" });
        files.createIndex("by-created", "createdAt");
        db.createObjectStore("blobs");
      },
    }).catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

function recordingName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

async function unusedName(db: IDBPDatabase<RecordingDB>, base: string): Promise<string> {
  const files = await db.getAll("files");
  const names = new Set(files.map((file) => file.name));
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base} (${suffix})`)) suffix += 1;
  return `${base} (${suffix})`;
}

/**
 * One recording is two IndexedDB records: a directory row in `files`, and the WAV bytes in `blobs`.
 * Listing reads only the directory, so it does not pull the audio into memory.
 */
export async function saveRecording(samples: Float32Array, sampleRate: number, createdAt = Date.now()): Promise<RecordingFile> {
  if (samples.length === 0 || sampleRate <= 0) throw new Error("保存する音がありません");
  const pcm = floatToInt16(samples);
  const wav = encodeWav(pcm, sampleRate);
  const db = await database();
  const file: RecordingFile = {
    id: crypto.randomUUID(),
    name: await unusedName(db, recordingName(new Date(createdAt))),
    createdAt,
    sampleRate,
    frames: pcm.length,
  };
  const tx = db.transaction(["files", "blobs"], "readwrite");
  await tx.objectStore("files").put(file);
  await tx.objectStore("blobs").put(wav.buffer, file.id);
  await tx.done;
  return file;
}

export async function listRecordings(): Promise<RecordingFile[]> {
  const db = await database();
  const files = await db.getAllFromIndex("files", "by-created");
  return files.reverse();
}

export async function readRecording(id: string): Promise<StoredRecording | null> {
  const db = await database();
  const file = await db.get("files", id);
  const wav = await db.get("blobs", id);
  if (!file || !wav) return null;
  return { ...file, wav: new Uint8Array(wav) };
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await database();
  const tx = db.transaction(["files", "blobs"], "readwrite");
  await tx.objectStore("files").delete(id);
  await tx.objectStore("blobs").delete(id);
  await tx.done;
}
