import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full border text-sm disabled:cursor-default disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-5",
  {
    variants: {
      variant: {
        ghost: "h-11 border-line bg-panel px-3 hover:border-ink/40",
        icon: "size-10 border-line bg-panel hover:border-ink/40 md:size-11",
        accent: "size-10 border-transparent bg-accent text-[#2a1608] md:size-11",
        record: "size-10 border-transparent bg-record text-[#2a100e] md:size-11",
        play: "size-10 border-transparent bg-play text-[#10211f] md:size-11",
      },
    },
    defaultVariants: { variant: "ghost" },
  },
);

function Button({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export { Button, buttonVariants };
