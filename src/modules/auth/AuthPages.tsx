"use client";

import { useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BusyButton, readableError } from "@/src/components/common";
import { MunicipalBrand } from "@/src/layouts/PublicLayout";
import { DEMO_PASSWORD, users } from "@/src/mocks/seed";
import { roleHome } from "@/src/services/mockApi";
import { useApp } from "@/src/contexts/AppContext";
import type { RoleName } from "@/src/types";

export function LoginPage() {
  const { session, login } = useApp(); const navigate = useNavigate(); const location = useLocation();
  const [email, setEmail] = useState("admin@pmt.demo"); const [password, setPassword] = useState(DEMO_PASSWORD); const [remember, setRemember] = useState(true); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (session) return <Navigate to={roleHome[session.role]} replace />;
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const user = await login(email, password); const target = (location.state as { from?: string } | null)?.from ?? roleHome[user.role]; navigate(target, { replace: true }); } catch (reason) { setError(readableError(reason)); } finally { setBusy(false); } }
  function selectRole(role: RoleName) { const user = users.find((item) => item.role === role && item.enabled); if (user) { setEmail(user.email); setPassword(DEMO_PASSWORD); setError(""); } }
  return <Box className="auth-page"><Box className="auth-brand-panel"><MunicipalBrand light /><Box><Typography className="overline">Área institucional</Typography><Typography variant="h2">Gestión municipal con permisos claros.</Typography><Typography>Valida infracciones, registra pagos y emite solvencias desde una sola plataforma web.</Typography></Box><Typography component="small">Acceso exclusivo para personal autorizado · Ambiente demostrativo</Typography></Box><Box className="auth-form-panel"><Paper elevation={0} className="auth-card"><Button component={Link} to="/" startIcon={<ArrowBackRoundedIcon />}>Volver al portal</Button><Typography className="overline">Acceso municipal</Typography><Typography variant="h4">Iniciar sesión</Typography><Typography color="text.secondary">Utiliza una cuenta de demostración según el rol que quieras probar.</Typography><form onSubmit={submit}><Stack spacing={2}><TextField label="Correo institucional" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><TextField label="Contraseña" type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShow((current) => !current)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>{show ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}</IconButton></InputAdornment> } }} /><Box className="auth-options"><FormControlLabel control={<Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)} />} label="Recordar sesión" /><Link to="/recuperar-contrasena">Recuperar contraseña</Link></Box>{error && <Alert severity="error">{error}</Alert>}<BusyButton busy={busy} type="submit" variant="contained" size="large" startIcon={<LockOutlinedIcon />}>Ingresar al sistema</BusyButton></Stack></form><Box className="demo-accounts"><Typography>CUENTAS DE DEMOSTRACIÓN</Typography><Box>{[["ADMIN", "Administrador"], ["SUPERVISOR", "Supervisor"], ["PMT", "Operador PMT"], ["RECEPTORIA", "Receptoría"], ["SOLVENCIAS", "Solvencias"]].map(([role, label]) => <Button key={role} variant={users.find((item) => item.role === role)?.email === email ? "contained" : "outlined"} onClick={() => selectRole(role as RoleName)}>{label}</Button>)}</Box><Typography component="small">Contraseña para todos: {DEMO_PASSWORD}</Typography></Box></Paper></Box></Box>;
}

export function RecoverPasswordPage() {
  const [sent, setSent] = useState(false);
  return <Box className="simple-auth-page"><Paper variant="outlined" className="auth-card"><MunicipalBrand /><Typography variant="h4">Recuperar contraseña</Typography><Typography color="text.secondary">En producción, Firebase enviará el enlace al correo institucional.</Typography>{sent ? <Alert severity="success">Solicitud simulada enviada. Revisa tu correo institucional.</Alert> : <><TextField fullWidth label="Correo institucional" defaultValue="operador@pmt.demo" /><Button fullWidth variant="contained" onClick={() => setSent(true)}>Enviar enlace</Button></>}<Button component={Link} to="/login">Volver al inicio de sesión</Button></Paper></Box>;
}
