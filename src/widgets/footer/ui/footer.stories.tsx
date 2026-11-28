import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronLeft, ChevronRight, Circle, Download, Mic, Play, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { LibraryIcon, ViewIcon } from "@/shared/ui/icons";
import { nativeSelectClass } from "@/shared/ui/native-select";
import { Footer } from "./footer";

const VIEWS = [
  { id: "pitch", label: "音程" },
  { id: "ribbon", label: "帯" },
  { id: "loudness", label: "大きさ" },
] as const;

function Tool({ label, children, variant }: { label: string; children: ReactNode; variant?: "icon" | "play" }) {
  return (
    <Button type="button" variant={variant ?? "icon"} aria-label={label} title={label}>
      {children}
    </Button>
  );
}

function PrimaryControls() {
  return (
    <>
      <Tool label="マイク">
        <Mic />
      </Tool>
      <Tool label="録音">
        <Circle className="fill-current" />
      </Tool>
      <div className="flex rounded-full border border-line bg-panel p-1" role="tablist" aria-label="ピッチの表示">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-label={item.label}
            title={item.label}
            aria-selected={item.id === "pitch"}
            className={`inline-flex size-9 items-center justify-center rounded-full [&_svg]:size-5 ${item.id === "pitch" ? "bg-ink text-panel" : "text-muted"}`}
          >
            <ViewIcon id={item.id} />
          </button>
        ))}
      </div>
    </>
  );
}

function SecondaryControls() {
  return (
    <>
      <select aria-label="スケール" className={`${nativeSelectClass} min-w-0 md:max-w-40`} defaultValue="chromatic">
        <option value="chromatic">半音</option>
      </select>
      <select aria-label="音程の範囲" className={nativeSelectClass} defaultValue="full">
        <option value="full">全体</option>
        <option value="fixed">固定</option>
        <option value="follow">追従</option>
      </select>
      <Tool label="録音一覧">
        <LibraryIcon />
      </Tool>
      <Tool label="前の録音">
        <ChevronLeft />
      </Tool>
      <Tool label="次の録音">
        <ChevronRight />
      </Tool>
      <Tool label="再生" variant="play">
        <Play className="fill-current" />
      </Tool>
      <select aria-label="形式" className="h-10 w-[4.5rem] rounded-full border border-line bg-panel px-2 text-sm md:h-11 md:w-auto md:px-3" defaultValue="wav">
        <option value="wav">WAV</option>
        <option value="flac">FLAC</option>
        <option value="mp3">MP3</option>
      </select>
      <Tool label="ダウンロード">
        <Download />
      </Tool>
      <Tool label="削除">
        <Trash2 />
      </Tool>
    </>
  );
}

const meta = {
  title: "Widgets/Footer",
  component: Footer,
  args: { defaultOpen: false, primary: <PrimaryControls />, secondary: <SecondaryControls /> },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => {
      const frameClass = typeof context.parameters.frameClass === "string" ? context.parameters.frameClass : "max-w-sm";
      return (
        <div className="flex min-h-screen items-end bg-bg p-4">
          <div className={`flex h-[28rem] w-full flex-col ${frameClass}`}>
            <div className="min-h-0 flex-1 rounded-t-xl border border-b-0 border-dashed border-line" />
            <Story />
          </div>
        </div>
      );
    },
  ],
} satisfies Meta<typeof Footer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = { args: { defaultOpen: true } };

export const ClosedWide: Story = { parameters: { frameClass: "max-w-5xl" } };

export const OpenWide: Story = { args: { defaultOpen: true }, parameters: { frameClass: "max-w-5xl" } };
