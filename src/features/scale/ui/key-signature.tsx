import { useEffect, useRef } from "react";
import { BoundingBox, Clef, KeySignature, Renderer, Stave } from "vexflow/bravura";
import type { KeyAccidental } from "@/entities/pitch/model/scale";

let bravuraReady: Promise<void> | undefined;

function whenBravuraReady(): Promise<void> {
  if (!bravuraReady) {
    bravuraReady = import("vexflow/bravura").then(async () => {
      await document.fonts.load("20px Bravura");
      if (!document.fonts.check("20px Bravura")) {
        throw new Error("Bravura did not load");
      }
    });
  }
  return bravuraReady;
}

function signatureLabel(accidentals: readonly KeyAccidental[]): string {
  if (accidentals.length === 0) return "調号なし";
  const names = accidentals.map((item) => `${item.letter}${item.kind === "sharp" ? "♯" : "♭"}`);
  return `調号 ${names.join("、")}`;
}

function signatureBounds(stave: Stave): BoundingBox {
  const parts: BoundingBox[] = [];
  for (const modifier of stave.getModifiers()) {
    if (modifier instanceof Clef) parts.push(modifier.getInkBounds());
    if (modifier instanceof KeySignature) parts.push(...modifier.getInkParts());
  }
  const top = stave.getYForLine(0);
  const bottom = stave.getYForLine(stave.getNumLines() - 1);
  parts.push(new BoundingBox(stave.getX(), top, stave.getWidth(), Math.max(bottom - top, 1)));
  const first = parts[0];
  const bounds = new BoundingBox(first.getX(), first.getY(), first.getW(), first.getH());
  for (const part of parts.slice(1)) bounds.mergeWith(part);
  return bounds;
}

function drawSignature(host: HTMLDivElement, accidentals: readonly KeyAccidental[]): void {
  host.replaceChildren();
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(320, 180);
  const context = renderer.getContext();
  context.setFillStyle("currentColor");
  context.setStrokeStyle("currentColor");

  const stave = new Stave(0, 0, 300, { leftBar: false, rightBar: false });
  stave.addClef("treble");
  if (accidentals.length > 0) {
    // The constructor key is discarded. setOrdered places the accidentals from keySignature().
    const signs = accidentals.map((item) => ({
      type: item.kind === "sharp" ? "#" : "b",
      line: (8 - item.staffStep) / 2,
    }));
    stave.addModifier(new KeySignature("C").setOrdered(signs));
  }
  stave.setWidth(stave.getNoteStartX() - stave.getX() + 4);
  stave.setContext(context).draw();

  const svg = host.querySelector("svg");
  if (!svg) return;
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("stroke", "currentColor");
  const box = signatureBounds(stave);
  const pad = 2;
  svg.setAttribute("viewBox", `${box.getX() - pad} ${box.getY() - pad} ${box.getW() + pad * 2} ${box.getH() + pad * 2}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.removeProperty("width");
  svg.style.removeProperty("height");
  host.style.removeProperty("width");
  host.style.removeProperty("height");

  const glyphs = svg.querySelectorAll("text");
  accidentals.forEach((item, index) => {
    const glyph = glyphs[index + 1];
    if (!glyph) return;
    glyph.setAttribute("data-letter", item.letter);
    glyph.setAttribute("data-kind", item.kind);
    glyph.setAttribute("data-staff-step", String(item.staffStep));
  });
}

export function KeySignatureIcon({ accidentals }: { accidentals: readonly KeyAccidental[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const signatureKey = accidentals.map((item) => `${item.kind}:${item.letter}:${item.staffStep}`).join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    whenBravuraReady()
      .then(() => {
        if (!cancelled) drawSignature(host, accidentals);
      })
      .catch(() => {
        if (!cancelled) host.replaceChildren();
      });
    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [accidentals, signatureKey]);

  return (
    <div
      ref={hostRef}
      className="inline-flex h-11 shrink-0 items-center text-ink [&_svg]:h-full [&_svg]:w-auto"
      role="img"
      aria-label={signatureLabel(accidentals)}
    />
  );
}
