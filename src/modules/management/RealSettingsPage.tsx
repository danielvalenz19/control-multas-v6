import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import { Link } from "react-router-dom";
import { PageHeader } from "@/src/components/common";

export default function RealSettingsPage(){
  return <Box className="module-page"><PageHeader eyebrow="Parámetros del sistema" title="Configuración" description="La configuración disponible se limita a capacidades persistidas y autorizadas."/><Paper variant="outlined" sx={{p:3}}><Stack spacing={2}><Typography variant="h6">Notificaciones internas</Typography><Typography color="text.secondary">Administra la bandeja y las preferencias almacenadas en MySQL. Las plantillas requieren el permiso administrativo correspondiente.</Typography><Alert severity="info">Correo, SMS y push no están activos en TANDA 10.</Alert><Button component={Link} to="/admin/notificaciones" variant="contained" startIcon={<NotificationsRoundedIcon/>}>Abrir centro de notificaciones</Button></Stack></Paper></Box>;
}
