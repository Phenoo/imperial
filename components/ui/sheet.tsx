"use client";

import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

export function SheetHeader({ children }: { children: ReactNode }) {
  return <div data-slot="sheet-header" className="sheet-header">{children}</div>;
}

export function SheetContent({
  className,
  children,
  side = "right",
  closeLabel = "Close menu",
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & { side?: "left" | "right"; closeLabel?: string }) {
  return <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay data-slot="sheet-overlay" className="sheet-overlay"/>
    <SheetPrimitive.Content data-slot="sheet-content" data-side={side} className={className ? `sheet-content ${className}` : "sheet-content"} {...props}>
      {children}
      <SheetPrimitive.Close data-slot="sheet-close" className="icon-button sheet-close">
        <X size={22} aria-hidden="true"/><span className="sr-only">{closeLabel}</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>;
}
