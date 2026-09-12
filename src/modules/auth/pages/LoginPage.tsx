import { useState } from "react";
import { Alert, Box, Button, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BusyButton, readableError } from "@/src/components/common";
import { MunicipalBrand } from "@/src/layouts/PublicLayout";
import { useAuth } from "../hooks/useAuth";
import { roleHome } from "../types/auth.types";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user) return <Navigate to={roleHome[user.role]} replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const authenticated = await login(identifier, password);
      const target = (location.state as { from?: string } | null)?.from ?? roleHome[authenticated.role];
      navigate(target, { replace: true });
    } catch (reason) {
      setError(readableError(reason));
    } finally {
      setBusy(false);
    }
  }

  return <Box className="auth-page"><Box className="auth-brand-panel"><MunicipalBrand light /><Box><Typography className="overline">Área institucional</Typography><Typography variant="h2">Gestión municipal con permisos claros.</Typography><Typography>Accede con tu cuenta institucional administrada por la Municipalidad.</Typography></Box><Typography component="small">Acceso exclusivo para personal autorizado</Typography></Box><Box className="auth-form-panel"><Paper elevation={0} className="auth-card"><Button component={Link} to="/" startIcon={<ArrowBackRoundedIcon />}>Volver al portal</Button><Typography className="overline">Acceso municipal</Typography><Typography variant="h4">Iniciar sesión</Typography><Typography color="text.secondary">Utiliza tu usuario o correo institucional. La sesión se protege con una cookie HttpOnly.</Typography><form onSubmit={submit}><Stack spacing={2}><TextField label="Usuario o correo" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required /><TextField label="Contraseña" type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShow((current) => !current)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>{show ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}</IconButton></InputAdornment> } }} />{error && <Alert severity="error">{error}</Alert>}<BusyButton busy={busy} type="submit" variant="contained" size="large" startIcon={<LockOutlinedIcon />}>Ingresar al sistema</BusyButton></Stack></form></Paper></Box></Box>;
}
