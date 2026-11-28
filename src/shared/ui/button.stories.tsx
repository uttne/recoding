import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta = { title: "Shared/Button", component: Button } satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Ghost: Story = { args: { children: "グラフを消去" } };
export const Accent: Story = { args: { variant: "accent", children: "マイク" } };
export const Record: Story = { args: { variant: "record", children: "録音" } };
export const Play: Story = { args: { variant: "play", children: "再生" } };
export const Disabled: Story = { args: { disabled: true, children: "削除" } };
