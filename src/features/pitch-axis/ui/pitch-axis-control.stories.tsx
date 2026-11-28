import type { Meta, StoryObj } from "@storybook/react-vite";
import { PitchAxisControl } from "./pitch-axis-control";

const meta = {
  title: "Features/PitchAxis",
  component: PitchAxisControl,
  args: {
    mode: "full",
    low: 48,
    high: 72,
    octaves: 2,
    resetDisabled: true,
    onMode: () => undefined,
    onLow: () => undefined,
    onHigh: () => undefined,
    onOctaves: () => undefined,
    onReset: () => undefined,
  },
} satisfies Meta<typeof PitchAxisControl>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Fixed: Story = { args: { mode: "fixed", resetDisabled: false, low: 60, high: 72 } };
export const Follow: Story = { args: { mode: "follow", octaves: 2 } };
