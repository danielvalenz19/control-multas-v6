import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import { MunicipalBrand } from "@/src/layouts/PublicLayout";

export function RecoverPasswordPage() {
  return <Box className="simple-auth-page"><Paper variant="outlined" className="auth-card"><Stack spacing={2}><MunicipalBrand /><Typography variant="h4">Recuperar contraseña</Typography><Alert severity="info">El restablecimiento es administrado por personal autorizado. Comunícate con la administración municipal.</Alert><Button component={Link} to="/login">Volver al inicio de sesión</Button></Stack></Paper></Box>;
}
