import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScaleSelect } from "./scale-select";

const meta = {
  title: "Features/ScaleSelect",
  component: ScaleSelect,
  args: { value: "chromatic", onChange: () => undefined },
} satisfies Meta<typeof ScaleSelect>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Chromatic: Story = {};
