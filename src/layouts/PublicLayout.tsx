"use client";

import { useState } from "react";
import { AppBar, Box, Button, Container, Divider, Drawer, IconButton, List, ListItemButton, ListItemText, Toolbar, Typography } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const links = [["/", "Inicio"], ["/consulta", "Consultar multa"], ["/orden-pago", "Orden de pago"], ["/solvencia/solicitar", "Solicitar solvencia"], ["/verificar-solvencia", "Verificar"], ["/requisitos", "Requisitos"], ["/preguntas-frecuentes", "Preguntas"], ["/ayuda", "Ayuda"]];
const primaryLinks = links.slice(0, 5);

export function MunicipalBrand({ light = false }: { light?: boolean }) {
  return <Box className={`municipal-brand ${light ? "light" : ""}`}><Box className="municipal-symbol"><AccountBalanceRoundedIcon /></Box><Box><Typography component="strong">PMT San Antonio</Typography><Typography component="span">Sistema Municipal de Multas</Typography></Box></Box>;
}

export default function PublicLayout() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  return <Box className="public-root">
    <AppBar position="sticky" color="inherit" elevation={0} className="public-appbar"><Container maxWidth="xl"><Toolbar disableGutters><NavLink to="/" aria-label="Ir al inicio"><MunicipalBrand /></NavLink><Box component="nav" aria-label="Navegación ciudadana" className="public-nav">{primaryLinks.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "active" : ""}>{label}</NavLink>)}</Box><Button component={NavLink} to="/login" variant="outlined" endIcon={<ArrowForwardRoundedIcon />}>Acceso municipal</Button><IconButton className="public-menu" onClick={() => setDrawer(true)} aria-label="Abrir navegación" aria-expanded={drawer}><MenuRoundedIcon /></IconButton></Toolbar></Container></AppBar>
    <Box key={location.pathname} className="route-stage public-route-stage"><Outlet /></Box>
    <Box component="footer" className="public-site-footer"><Container maxWidth="xl"><MunicipalBrand light /><Typography>Municipalidad de San Antonio Suchitepéquez · Portal ciudadano</Typography><Box><NavLink to="/requisitos">Privacidad</NavLink><NavLink to="/ayuda">Términos</NavLink><NavLink to="/preguntas-frecuentes">Preguntas frecuentes</NavLink></Box></Container></Box>
    <Drawer anchor="right" open={drawer} onClose={() => setDrawer(false)} slotProps={{ paper: { className: "public-drawer-paper" } }}><Box className="public-drawer"><Box className="public-drawer-head"><MunicipalBrand /><IconButton onClick={() => setDrawer(false)} aria-label="Cerrar navegación"><MenuRoundedIcon /></IconButton></Box><Divider /><List component="nav" aria-label="Navegación ciudadana móvil">{links.map(([to, label]) => <ListItemButton component={NavLink} to={to} key={to} onClick={() => setDrawer(false)}><ListItemText primary={label} /></ListItemButton>)}</List><Button fullWidth variant="contained" component={NavLink} to="/login" onClick={() => setDrawer(false)}>Acceso municipal</Button></Box></Drawer>
  </Box>;
}
