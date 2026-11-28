import type { ViewId } from "@/entities/session/model/session";
import { ViewIcon } from "@/shared/ui/icons";

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: "pitch", label: "音程" },
  { id: "ribbon", label: "帯" },
  { id: "loudness", label: "大きさ" },
];

export function ViewTabs({ value, onChange }: { value: ViewId; onChange: (view: ViewId) => void }) {
  return (
    <div className="flex rounded-full border border-line bg-panel p-1" role="tablist" aria-label="ピッチの表示">
      {VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-label={item.label}
          title={item.label}
          aria-selected={value === item.id}
          className={`inline-flex size-9 items-center justify-center rounded-full [&_svg]:size-5 ${value === item.id ? "bg-ink text-panel" : "text-muted hover:text-ink"}`}
          onClick={() => onChange(item.id)}
        >
          <ViewIcon id={item.id} />
        </button>
      ))}
    </div>
  );
}
