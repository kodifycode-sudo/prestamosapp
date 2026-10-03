"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { passwordSchema } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrengthMeter } from "@/components/ui/password-strength-meter";
import { Label } from "@/components/ui/label";

const registroSchema = z
  .object({
    empresaNombre: z.string().min(1, "El nombre de la empresa es obligatorio"),
    nombre: z.string().min(1, "El nombre es obligatorio"),
    email: z.string().email("Email inválido"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type RegistroValues = z.infer<typeof registroSchema>;

export function RegistroForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegistroValues>({
    resolver: zodResolver(registroSchema),
    defaultValues: { empresaNombre: "", nombre: "", email: "", password: "", confirmPassword: "" },
  });

  const password = watch("password");

  async function onSubmit(values: RegistroValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "No se pudo crear la cuenta");
        return;
      }

      toast.success("Empresa y cuenta creadas. Ya podés ingresar.");
      router.push("/auth/login");
    } catch {
      toast.error("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit(onSubmit)}
      {...props}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Creá tu empresa</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Vas a ser el administrador de tu propia empresa en el sistema
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="empresaNombre">Nombre de tu empresa</Label>
          <Input id="empresaNombre" placeholder="Mi Empresa S.A." {...register("empresaNombre")} />
          {errors.empresaNombre && (
            <p className="text-sm text-destructive">{errors.empresaNombre.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nombre">Tu nombre</Label>
          <Input id="nombre" placeholder="Nombre y apellido" {...register("nombre")} />
          {errors.nombre && (
            <p className="text-sm text-destructive">{errors.nombre.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="tu@email.com"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <PasswordInput id="password" {...register("password")} />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
          <PasswordStrengthMeter password={password ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
          <PasswordInput id="confirmPassword" {...register("confirmPassword")} />
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </Button>
      </div>
      <div className="text-center text-sm">
        ¿Ya tenés cuenta?{" "}
        <Link href="/auth/login" className="underline underline-offset-4">
          Ingresá
        </Link>
      </div>
    </form>
  );
}
