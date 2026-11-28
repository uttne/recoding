import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NumberField } from "./number-field";

function Framed({
  initial,
  min,
  max,
  step = 1,
  suffix,
  align = "left",
}: {
  initial: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  align?: "left" | "right";
}) {
  const [value, setValue] = useState(initial);
  return (
    <span className="flex h-11 items-center rounded-xl border border-line bg-panel px-3 text-sm">
      <NumberField value={value} min={min} max={max} step={step} align={align} onCommit={setValue} />
      <span className="text-muted">{suffix}</span>
    </span>
  );
}

const meta = {
  title: "Shared/NumberField",
  component: NumberField,
  args: {
    value: 440,
    min: 415,
    max: 466,
    onCommit: () => undefined,
  },
} satisfies Meta<typeof NumberField>;
export default meta;

type Story = StoryObj<typeof meta>;

export const A4: Story = {
  render: () => <Framed initial={440} min={415} max={466} suffix="Hz" />,
};

export const AtMinimum: Story = {
  render: () => <Framed initial={415} min={415} max={466} suffix="Hz" />,
};

export const AtMaximum: Story = {
  render: () => <Framed initial={466} min={415} max={466} suffix="Hz" align="right" />,
};

export const OctaveWidth: Story = {
  render: () => <Framed initial={2} min={1} max={5} step={0.5} suffix="oct" />,
};
