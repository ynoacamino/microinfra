import type { ClockPort } from "../../ports/clock";

export function createSystemClock(): ClockPort {
  return {
    now: () => new Date(),
    nowMs: () => Date.now(),
  };
}
