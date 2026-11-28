import type { Meta, StoryObj } from "@storybook/react-vite";
import { Mic } from "lucide-react";
import { IconButton } from "./icon-button";

const meta = {
  title: "Shared/IconButton",
  component: IconButton,
  args: { label: "マイクを開始", onClick: () => undefined, children: <Mic /> },
} satisfies Meta<typeof IconButton>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Live: Story = { args: { live: "accent", label: "マイクを停止" } };
export const Recording: Story = { args: { live: "record", pressed: true, label: "録音を停止" } };
export const Playing: Story = { args: { live: "play", label: "再生を停止" } };
export const Disabled: Story = { args: { disabled: true } };
