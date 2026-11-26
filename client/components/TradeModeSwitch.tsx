type TradeMode = "buy" | "sell";

export function TradeModeSwitch({
  value,
  onChange,
  disabled,
}: {
  value: TradeMode;
  onChange: (value: TradeMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Trade type"
      data-mode={value}
      className="trade-mode relative isolate grid grid-cols-2 rounded-lg bg-muted p-1"
    >
      {(["buy", "sell"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          disabled={disabled}
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className="relative rounded-md py-1.5 text-sm font-semibold text-muted-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 aria-pressed:text-foreground"
        >
          {mode === "buy" ? "Buy" : "Sell"}
        </button>
      ))}
    </div>
  );
}
