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
export const EMajor: Story = { args: { value: "major:4" } };
export const EMinor: Story = { args: { value: "minor:4" } };
export const FMajor: Story = { args: { value: "major:5" } };
