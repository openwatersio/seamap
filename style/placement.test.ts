import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MARK } from "./layers/placement.ts";

// MARK's pixel clearances encode the sprite sheet's body geometry; if bin/sprites redraws the
// bodies, these assertions say which number to retune.
const sheet: Record<string, { width: number; height: number }> = JSON.parse(
  readFileSync(new URL("./sprites/dist/freenauticalchart.json", import.meta.url), "utf8"),
);

const dims = (shapes: string[]) =>
  Object.entries(sheet)
    .filter(([name]) => shapes.some((s) => name.startsWith(`${s}/`)))
    .map(([, d]) => d);

const TALL = ["pillar", "spar", "stake", "pile", "tower"];
const SQUAT = ["can", "conical", "spherical", "barrel"];
// super-buoy and light_float are wider (32px); their labels sit a little closer to the art
const BASE_PAD = 4;

it("sizes side clearance from the body width", () => {
  const widths = dims([...TALL, ...SQUAT]).map((d) => d.width);
  expect(Math.max(...widths)).toBe((MARK.side - 4) * 2);
});

it("sizes lift and above from the tall hulls", () => {
  const tallest = Math.max(...dims(TALL).map((d) => d.height));
  expect(MARK.lift).toBe((tallest + BASE_PAD) / 2 - BASE_PAD);
  expect(MARK.above).toBe(tallest - BASE_PAD + 8);
});

it("sizes squat lift from the squat hulls", () => {
  const centres = dims(SQUAT).map((d) => (d.height + BASE_PAD) / 2 - BASE_PAD);
  expect(MARK.squatLift).toBeGreaterThanOrEqual(Math.min(...centres));
  expect(MARK.squatLift).toBeLessThanOrEqual(Math.max(...centres));
});
