import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textVariants = cva("", {
  variants: {
    tone: {
      primary: "text-text-primary",
      secondary: "text-text-secondary",
      inverse: "text-text-inverse",
      brand: "text-brand-dark",
    },
    as: {
      p: "",
      span: "",
      small: "text-sm",
      lead: "text-lg",
      h1: "text-4xl font-bold",
      h2: "text-3xl font-bold",
      h3: "text-2xl font-semibold",
      h4: "text-xl font-semibold",
    },
  },
  defaultVariants: {
    tone: "primary",
    as: "p",
  },
});

export interface TextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "color">,
    VariantProps<typeof textVariants> {
  as?: "p" | "span" | "small" | "lead" | "h1" | "h2" | "h3" | "h4";
}

export function Text({ className, tone, as = "p", ...props }: TextProps) {
  const tag = as === "lead" ? "p" : as;
  const Comp = tag as React.ElementType;
  return <Comp className={cn(textVariants({ tone, as, className }))} {...props} />;
}
