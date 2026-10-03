"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { passwordSchema } from "@/lib/password";

const resetSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirmá tu contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type ResetValues = z.infer<typeof resetSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverMessage, setServerMessage] = useState("");
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetValues) {
    if (!token) return;
    setLoading(true);
    setServerError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error ?? "No se pudo actualizar la contraseña");
        return;
      }

      setServerMessage(data.message ?? "Contraseña actualizada correctamente.");
      setSuccess(true);
      setTimeout(() => router.push("/auth/login"), 3000);
    } catch {
      setServerError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <XCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-2xl font-bold">Enlace inválido</h1>
        <p className="text-balance text-sm text-muted-foreground">
          El enlace de recuperación es inválido o ya fue utilizado.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link href="/auth/login">Volver al login</Link>
        </Button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <h1 className="text-2xl font-bold">¡Contraseña actualizada!</h1>
        <p className="text-balance text-sm text-muted-foreground">{serverMessage}</p>
        <p className="text-sm text-muted-foreground">
          Serás redirigido al login en unos segundos...
        </p>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Nueva contraseña</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Ingresá tu nueva contraseña para recuperar el acceso a tu cuenta.
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <PasswordInput
            id="password"
            placeholder="Mínimo 6 caracteres"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
          <PasswordInput
            id="confirmPassword"
            placeholder="Repetí la contraseña"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Guardando..." : "Guardar nueva contraseña"}
        </Button>
      </div>
      <div className="text-center text-sm">
        <Link href="/auth/login" className="underline underline-offset-4">
          Volver al login
        </Link>
      </div>
    </form>
  );
}
