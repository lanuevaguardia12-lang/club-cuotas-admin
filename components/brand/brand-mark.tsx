import Image from "next/image";

import { BRAND_LOGO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  alt?: string;
  className?: string;
  imageClassName?: string;
}

export function BrandMark({
  alt = "Escudo de La Nueva Guardia",
  className,
  imageClassName,
}: BrandMarkProps) {
  return (
    <div
      className={cn(
        "border-border bg-card grid shrink-0 place-items-center overflow-hidden rounded-md border",
        className,
      )}
    >
      <Image
        src={BRAND_LOGO_URL}
        alt={alt}
        width={96}
        height={96}
        className={cn("h-full w-full object-contain", imageClassName)}
      />
    </div>
  );
}
