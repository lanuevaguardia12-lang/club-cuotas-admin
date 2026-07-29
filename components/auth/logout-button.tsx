"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

export function LogoutButton() {
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
      <Button variant="outline" size="sm" onClick={handleLogout} disabled={isPending}>
        <LogOut />
        {isPending ? "Saliendo..." : "Salir"}
      </Button>
    </>
  );
}
