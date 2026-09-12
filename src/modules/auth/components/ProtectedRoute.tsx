import { Box, Button, Paper, Typography } from "@mui/material";
import LockPersonRoundedIcon from "@mui/icons-material/LockPersonRounded";
import { Link, Navigate, useLocation } from "react-router-dom";
import { LoadingState } from "@/src/components/common";
import { useAuth } from "../hooks/useAuth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <Box className="route-loader"><LoadingState rows={4} /></Box>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function PermissionRoute({ roles, permission, children }: { roles?: string[]; permission?: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  const allowedByRole = !roles || roles.some((role) => user.roles.includes(role) || user.role === role);
  const allowedByPermission = !permission || user.permissions.includes(permission);
  if (!allowedByRole || !allowedByPermission) {
    return <Paper variant="outlined" className="no-permission"><LockPersonRoundedIcon /><Typography variant="h4">Sin permiso</Typography><Typography color="text.secondary">Tu cuenta no tiene autorización para abrir este módulo.</Typography><Button component={Link} to="/admin/perfil" variant="contained">Volver a mi perfil</Button></Paper>;
  }
  return children;
}
