import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "@/shared/ui/dialog";
import { SettingsForm } from "./settings-form";

const meta = {
  title: "Widgets/SettingsForm",
  component: SettingsForm,
  args: {
    micId: "built-in",
    mics: [
      { id: "built-in", label: "内蔵マイク" },
      { id: "usb", label: "USB マイク" },
    ],
    micDisabled: false,
    detector: "acf-basic",
    detectors: [
      { id: "acf-basic", label: "ACF2+ → Basic" },
      { id: "acf2", label: "ACF2+" },
      { id: "mpm", label: "MPM" },
      { id: "pyin", label: "pYIN" },
      { id: "swiftf0", label: "SwiftF0" },
      { id: "crepe", label: "Tiny-CREPE" },
      { id: "basic-mono", label: "Basic Pitch 単音" },
      { id: "basic-poly", label: "Basic Pitch 重音" },
    ],
    a4: 440,
    levelFloor: -40,
    ceilings: {
      acf2: 4500,
      swiftf0: 2094,
      mpm: 4500,
      pyin: 2000,
      crepe: 2004,
      "basic-mono": 4186,
    },
    ceilingFields: [
      { id: "acf2", label: "ACF2+", min: 100, max: 8000 },
      { id: "swiftf0", label: "SwiftF0", min: 100, max: 8000 },
      { id: "mpm", label: "MPM", min: 100, max: 8000 },
      { id: "pyin", label: "pYIN", min: 100, max: 8000 },
      { id: "crepe", label: "Tiny-CREPE", min: 100, max: 2100 },
      { id: "basic-mono", label: "Basic Pitch", min: 100, max: 4500 },
    ],
    distinguish: false,
    pending: false,
    guides: true,
    csvDisabled: true,
    onMic: () => undefined,
    onDetector: () => undefined,
    onA4: () => undefined,
    onLevelFloor: () => undefined,
    onCeiling: () => undefined,
    onDistinguish: () => undefined,
    onPending: () => undefined,
    onGuides: () => undefined,
    onSaveCsv: () => undefined,
    onClearGraph: () => undefined,
  },
  decorators: [
    (Story) => (
      <Dialog open onOpenChange={() => undefined}>
        {Story()}
      </Dialog>
    ),
  ],
} satisfies Meta<typeof SettingsForm>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};
