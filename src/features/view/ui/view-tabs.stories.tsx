import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewTabs } from "./view-tabs";

const meta = {
  title: "Features/ViewTabs",
  component: ViewTabs,
  args: { value: "pitch", onChange: () => undefined },
} satisfies Meta<typeof ViewTabs>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Pitch: Story = {};
export const Ribbon: Story = { args: { value: "ribbon" } };
export const Loudness: Story = { args: { value: "loudness" } };
