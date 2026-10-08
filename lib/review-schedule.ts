// Shared, explainable default for notes and questions; not a fitted memory model.
export function reviewInterval(successes: number) {
  return [1, 3, 7, 14, 30][Math.min(Math.max(successes - 1, 0), 4)];
}
