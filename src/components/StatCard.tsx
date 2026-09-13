import { cn, formatINR, formatPct } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  large,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "gain" | "loss";
  large?: boolean;
}) {
  return (
    <div className={cn("card", large ? "p-5 md:p-7" : "p-5 md:p-6")}>
      <div className="text-base font-semibold text-muted">{label}</div>
      <div
        className={cn(
          "mt-2 font-[family-name:var(--font-display)] font-semibold tracking-tight",
          large ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl",
          tone === "gain" && "gain",
          tone === "loss" && "loss"
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-2 text-base text-muted">{sub}</div> : null}
    </div>
  );
}

export function Money({
  value,
  compact,
  signed,
  className,
}: {
  value: number;
  compact?: boolean;
  signed?: boolean;
  className?: string;
}) {
  const tone = value > 0 ? "gain" : value < 0 ? "loss" : "";
  const text =
    signed && value > 0 ? `+${formatINR(value, compact)}` : formatINR(value, compact);
  return <span className={cn(tone, className)}>{text}</span>;
}

export function Pct({ value, className }: { value: number; className?: string }) {
  const tone = value > 0 ? "gain" : value < 0 ? "loss" : "";
  return <span className={cn(tone, className)}>{formatPct(value)}</span>;
}

/** Plain-language up/down chip for accessibility beyond color alone */
export function ChangeBadge({
  value,
  asMoney,
}: {
  value: number;
  asMoney?: boolean;
}) {
  if (value === 0) {
    return <span className="tone-badge">No change</span>;
  }
  const up = value > 0;
  return (
    <span className={cn("tone-badge", up ? "up" : "down")}>
      {up ? "Up" : "Down"}{" "}
      {asMoney ? (
        <Money value={value} signed />
      ) : (
        formatPct(value)
      )}
    </span>
  );
}
