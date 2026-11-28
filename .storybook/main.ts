import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";
import { fileURLToPath } from "node:url";

function flatten(plugins: PluginOption[] | undefined): PluginOption[] {
  if (!plugins) return [];
  return plugins.flatMap((plugin) => (Array.isArray(plugin) ? flatten(plugin) : [plugin]));
}

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  async viteFinal(viteConfig) {
    const plugins = flatten(viteConfig.plugins).filter((plugin) => {
      const name = plugin && typeof plugin === "object" && "name" in plugin ? plugin.name : "";
      return name !== "ort-runtime" && name !== "flac-wasm";
    });
    viteConfig.plugins = plugins;
    viteConfig.resolve ??= {};
    const alias = viteConfig.resolve.alias;
    viteConfig.resolve.alias = {
      ...(alias && !Array.isArray(alias) ? alias : {}),
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    };
    viteConfig.server = { ...viteConfig.server, headers: {} };
    return viteConfig;
  },
};

export default config;
