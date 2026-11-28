import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RecordingFile } from "@/entities/recording/model/recordings";
import { RecordingEntries } from "./recording-entries";

const files: RecordingFile[] = [
  { id: "a", name: "朝の発声", createdAt: 1, sampleRate: 48000, frames: 48000 * 75 },
  { id: "b", name: "とても長い名前の録音ファイルで、折り返さずに省略される", createdAt: 2, sampleRate: 48000, frames: 48000 * 12 },
];

const meta = {
  title: "Widgets/RecordingEntries",
  component: RecordingEntries,
  args: { files, selectedId: "a", playingId: null, onSelect: () => undefined },
  decorators: [(Story) => <div className="h-80 w-60 border border-line">{Story()}</div>],
} satisfies Meta<typeof RecordingEntries>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Selected: Story = {};
export const Playing: Story = { args: { playingId: "a" } };
export const Empty: Story = { args: { files: [] } };
