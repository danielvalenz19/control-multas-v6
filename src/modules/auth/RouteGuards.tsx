"use client";

import { Box, Button, CircularProgress, Paper, Typography } from "@mui/material";
import LockPersonRoundedIcon from "@mui/icons-material/LockPersonRounded";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useApp } from "@/src/contexts/AppContext";
import type { RoleName } from "@/src/types";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useApp(); const location = useLocation();
  if (initializing) return <Box className="route-loader"><CircularProgress /><Typography>Recuperando sesión…</Typography></Box>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function PermissionRoute({ roles, children }: { roles: RoleName[]; children: React.ReactNode }) {
  const { session } = useApp();
  if (!session) return null;
  if (!roles.includes(session.role)) return <Paper variant="outlined" className="no-permission"><LockPersonRoundedIcon /><Typography variant="h4">Sin permiso</Typography><Typography color="text.secondary">Tu rol actual no permite abrir este módulo ni ejecutar sus acciones.</Typography><Button href="#/admin/dashboard" variant="contained">Volver al inicio</Button></Paper>;
  return children;
}

export function NoPermissionPage() {
  return <Box className="simple-auth-page"><Paper variant="outlined" className="no-permission"><LockPersonRoundedIcon /><Typography variant="h4">Sin permiso</Typography><Typography color="text.secondary">Tu cuenta no tiene acceso a esta ruta. Ingresa con otro rol o vuelve al módulo autorizado.</Typography><Button component={Link} to="/login" variant="contained">Volver al acceso municipal</Button></Paper></Box>;
}
