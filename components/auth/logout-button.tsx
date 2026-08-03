"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

type LogoutButtonProps = Pick<ButtonProps, "className" | "size" | "variant">;

export function LogoutButton({
  className,
  size = "sm",
  variant = "outline",
}: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      router.replace("/login");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <LoadingModal open={isPending} description="Cerrando sesión..." />
      <Button
        className={className}
        variant={variant}
        size={size}
        onClick={handleLogout}
        disabled={isPending}
      >
        <LogOut />
        {isPending ? "Saliendo..." : "Salir"}
      </Button>
    </>
  );
}
