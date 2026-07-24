import type { PropsWithChildren } from "react";

type Tone = "green" | "red" | "amber" | "blue" | "purple" | "grey";

const toneFor = (value: string): Tone => {
  const normalized = value.toLowerCase();
  if (/approved|active|complete|compliant|verified|low|available/.test(normalized)) return "green";
  if (/rejected|disabled|overdue|critical|failed|high/.test(normalized)) return "red";
  if (/pending|review|minor|medium|due/.test(normalized)) return "amber";
  if (/progress|submitted|scheduled|api/.test(normalized)) return "blue";
  if (/admin|configuration|shared/.test(normalized)) return "purple";
  return "grey";
};

export function Badge({ children, tone }: PropsWithChildren<{ tone?: Tone }>) {
  const value = String(children ?? "");
  return <span className={`badge badge-${tone ?? toneFor(value)}`}>{children}</span>;
}
