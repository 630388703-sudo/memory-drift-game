// Zero is an explicit unknown answer, never a claim that the photo has no people.
export const COUNT_OPTIONS = [3, 4, 5, 0] as const;
// -1 means no option has been reached yet, not the explicit Not sure answer.
export const moveChoiceIndex = (index: number, direction: number) => index < 0
  ? (direction < 0 ? COUNT_OPTIONS.length - 1 : 0)
  : (index + Math.sign(direction) + COUNT_OPTIONS.length) % COUNT_OPTIONS.length;
export const moveCount = (value: number, direction: number) => COUNT_OPTIONS[moveChoiceIndex(COUNT_OPTIONS.indexOf(value as typeof COUNT_OPTIONS[number]), direction)];
export function recallLabel(value: number | string | undefined, language: "zh" | "en") {
  if (value === 0 || value === "unknown") return language === "zh" ? "记不清了" : "Not sure";
  if (value === undefined || value === "—") return "—";
  if (typeof value === "number") return language === "zh" ? `${value} 人` : `${value} people`;
  const labels: Record<string, [string, string]> = { left: ["左侧", "Left"], center: ["中央", "Center"], right: ["右侧", "Right"], blue: ["蓝色", "Blue"], white: ["白色", "White"], pink: ["粉色", "Pink"] };
  return labels[value]?.[language === "zh" ? 0 : 1] ?? "—";
}
export function comparisonState(value: number | string | undefined, source: number | string) {
  if (value === undefined) return "missing";
  if (value === 0 || value === "unknown") return "uncertain";
  return value === source ? "same" : "different";
}
