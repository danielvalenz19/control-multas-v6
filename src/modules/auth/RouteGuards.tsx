import { Box, Button, Paper, Typography } from "@mui/material";
import LockPersonRoundedIcon from "@mui/icons-material/LockPersonRounded";
import { Link } from "react-router-dom";
export { PermissionRoute, ProtectedRoute } from "./components/ProtectedRoute";

export function NoPermissionPage() {
  return <Box className="simple-auth-page"><Paper variant="outlined" className="no-permission"><LockPersonRoundedIcon /><Typography variant="h4">Sin permiso</Typography><Typography color="text.secondary">Tu cuenta no tiene acceso a esta ruta.</Typography><Button component={Link} to="/login" variant="contained">Volver al acceso municipal</Button></Paper></Box>;
}
