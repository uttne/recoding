import { loadFlacForTests } from "./flac-for-tests";

const target = globalThis as { __loadFlacForTests?: typeof loadFlacForTests };
target.__loadFlacForTests = loadFlacForTests;
