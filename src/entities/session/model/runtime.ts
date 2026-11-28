import type { PitchEngine } from "../../../audio/engine";

/** Late binding so the split modules can reach the engine without importing session.ts. */
export type SessionPorts = {
  engine: PitchEngine;
  publish(): void;
  getClock(): number;
  setClock(time: number): void;
  getEngagedAt(): number;
  setEngagedAt(time: number): void;
  setStatus(message: string): void;
  resetReadout(): void;
  setArmingMic(value: boolean): void;
};

let bound: SessionPorts | null = null;

export function bindRuntime(ports: SessionPorts): void {
  bound = ports;
}

export function sessionPorts(): SessionPorts {
  if (!bound) throw new Error("session runtime is not bound");
  return bound;
}
