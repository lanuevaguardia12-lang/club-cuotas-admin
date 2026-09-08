"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

interface PaymentAliasCopyButtonProps {
  alias?: string | null;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export function PaymentAliasCopyButton({
  alias,
  className,
  size = "default",
  variant = "outline",
}: PaymentAliasCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const normalizedAlias = alias?.trim();

  if (!normalizedAlias) {
    return null;
  }

  async function handleCopy() {
    if (!normalizedAlias) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizedAlias);
      } else {
        copyWithFallback(normalizedAlias);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      copyWithFallback(normalizedAlias);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <Button
      type="button"
      className={className}
      onClick={handleCopy}
      size={size}
      variant={variant}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "ALIAS copiado" : "Copiar ALIAS"}
    </Button>
  );
}

function copyWithFallback(value: string) {
  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
