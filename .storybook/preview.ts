import type { Preview } from "@storybook/react-vite";
import "@/app/styles/index.css";

const preview: Preview = {
  parameters: {
    backgrounds: { default: "app", values: [{ name: "app", value: "#14110e" }] },
    layout: "centered",
  },
};

export default preview;
