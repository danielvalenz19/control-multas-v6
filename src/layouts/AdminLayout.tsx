"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  ButtonBase,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import AssessmentRoundedIcon from "@mui/icons-material/AssessmentRounded";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import DevicesRoundedIcon from "@mui/icons-material/DevicesRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import MenuOpenRoundedIcon from "@mui/icons-material/MenuOpenRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import PolicyRoundedIcon from "@mui/icons-material/PolicyRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import MoveToInboxRoundedIcon from "@mui/icons-material/MoveToInboxRounded";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { MunicipalBrand } from "@/src/layouts/PublicLayout";
import { useApp } from "@/src/contexts/AppContext";
import type { RoleName } from "@/src/types";
import { notificationsApi } from "@/src/modules/notifications/api/notificationsApi";

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles: RoleName[];
  count?: number;
}

const nav: { group: string; items: NavItem[] }[] = [
  {
    group: "GENERAL",
    items: [
      {
        label: "Dashboard",
        to: "/admin/dashboard",
        icon: <DashboardRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR"],
      },
      {
        label: "Bandeja de trabajo",
        to: "/admin/bandeja",
        icon: <FactCheckRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR", "PMT", "RECEPTORIA", "SOLVENCIAS"],
        count: 8,
      },
      {
        label: "Notificaciones",
        to: "/admin/notificaciones",
        icon: <NotificationsNoneRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR", "PMT", "RECEPTORIA", "SOLVENCIAS"],
      },
    ],
  },
  {
    group: "OPERACIÓN",
    items: [
      {
        label: "Infracciones",
        to: "/admin/infracciones",
        icon: <ReceiptLongRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR", "PMT"],
      },
      {
        label: "Ciudadanos y vehículos",
        to: "/admin/ciudadanos",
        icon: <DirectionsCarRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR", "PMT"],
      },
      {
        label: "Caja y pagos",
        to: "/admin/receptoria",
        icon: <PaymentsRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR", "RECEPTORIA"],
      },
      {
        label: "Solvencias",
        to: "/admin/solvencias",
        icon: <VerifiedRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR", "SOLVENCIAS"],
      },
      {
        label: "Recursos",
        to: "/admin/impugnaciones",
        icon: <GavelRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR", "PMT"],
      },
      {
        label: "Dispositivos y sync",
        to: "/admin/dispositivos",
        icon: <DevicesRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR", "PMT"],
      },
    ],
  },
  {
    group: "CONTROL",
    items: [
      {
        label: "Reportes",
        to: "/admin/reportes",
        icon: <AssessmentRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR"],
      },
      {
        label: "Auditoría",
        to: "/admin/auditoria",
        icon: <PolicyRoundedIcon />,
        roles: ["ADMIN"],
      },
    ],
  },
  {
    group: "ADMINISTRACIÓN",
    items: [
      {
        label: "Usuarios",
        to: "/admin/usuarios",
        icon: <GroupsRoundedIcon />,
        roles: ["ADMIN"],
      },
      {
        label: "Agentes PMT",
        to: "/admin/agentes",
        icon: <AccountCircleRoundedIcon />,
        roles: ["ADMIN", "SUPERVISOR"],
      },
      {
        label: "Roles y permisos",
        to: "/admin/roles",
        icon: <SecurityRoundedIcon />,
        roles: ["ADMIN"],
      },
      {
        label: "Catálogos",
        to: "/admin/catalogos",
        icon: <CategoryRoundedIcon />,
        roles: ["ADMIN"],
      },
      {
        label: "Migraciones históricas",
        to: "/admin/migraciones-historicas",
        icon: <MoveToInboxRoundedIcon />,
        roles: ["ADMIN"],
      },
      {
        label: "Configuración",
        to: "/admin/configuracion",
        icon: <SettingsRoundedIcon />,
        roles: ["ADMIN"],
      },
    ],
  },
];

const titles: Record<string, string> = {
  dashboard: "Dashboard",
  bandeja: "Bandeja de trabajo",
  infracciones: "Infracciones",
  pendientes: "Validación pendiente",
  ciudadanos: "Ciudadanos y vehículos",
  receptoria: "Caja y pagos",
  caja: "Control de caja",
  pagos: "Registrar pago",
  conciliacion: "Conciliación",
  solvencias: "Solvencias",
  impugnaciones: "Recursos e impugnaciones",
  reportes: "Reportes",
  usuarios: "Usuarios",
  agentes: "Agentes PMT",
  roles: "Roles y permisos",
  catalogos: "Catálogos",
  dispositivos: "Dispositivos y sincronización",
  auditoria: "Auditoría",
  configuracion: "Configuración",
  perfil: "Mi perfil",
  notificaciones: "Notificaciones",
  "migraciones-historicas": "Migraciones históricas",
};

export default function AdminLayout() {
  const { session, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const compactScreen = useMediaQuery("(max-width:960px)");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  useEffect(() => {
    let active = true;
    const refreshUnread = () => { void notificationsApi.unreadCount().then((result) => { if (active) setUnreadNotifications(result.data.count); }).catch(() => undefined); };
    refreshUnread();
    window.addEventListener("pmt:notifications-changed", refreshUnread);
    return () => { active = false; window.removeEventListener("pmt:notifications-changed", refreshUnread); };
  }, [location.pathname]);
  const moduleTitle = useMemo(() => {
    const segment =
      location.pathname.split("/").filter(Boolean).at(-1) ?? "dashboard";
    return titles[segment] ?? "Expediente";
  }, [location.pathname]);
  if (!session) return null;
  const sidebar = (
    <Box className={`admin-sidebar ${collapsed ? "collapsed" : ""}`}>
      <Box className="admin-brand-row">
        <MunicipalBrand light />
        {!compactScreen && (
          <Tooltip title={collapsed ? "Expandir menú" : "Plegar menú"}>
            <IconButton onClick={() => setCollapsed((current) => !current)}>
              <MenuOpenRoundedIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <List className="admin-nav">
        {nav.map((group) => {
          const items = group.items.filter((item) =>
            item.roles.includes(session.role),
          );
          if (!items.length) return null;
          return (
            <Box key={group.group}>
              <Typography>{group.group}</Typography>
              {items.map((item) => {
                const active =
                  location.pathname === item.to ||
                  (item.to !== "/admin/dashboard" &&
                    location.pathname.startsWith(`${item.to}/`));
                return (
                  <ListItemButton
                    component={NavLink}
                    to={item.to}
                    key={item.to}
                    className={active ? "active" : ""}
                    onClick={() => setMobileOpen(false)}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} />
                    {item.count && (
                      <Badge color="secondary" badgeContent={item.count} />
                    )}
                  </ListItemButton>
                );
              })}
            </Box>
          );
        })}
      </List>
      <Box className="system-health">
        <span />
        <Box>
          <Typography>Sistema disponible</Typography>
          <Typography component="small">Sincronizado ahora</Typography>
        </Box>
      </Box>
    </Box>
  );
  async function closeSession() {
    await logout();
    navigate("/", { replace: true });
  }
  return (
    <Box className={`admin-root ${collapsed ? "nav-collapsed" : ""}`}>
      <Box className="desktop-sidebar">{sidebar}</Box>
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: "#F8FAF6" } } }}
      >
        {sidebar}
      </Drawer>
      <Box className="admin-stage">
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          className="admin-appbar"
        >
          <Toolbar>
            <IconButton
              className="mobile-admin-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <MenuRoundedIcon />
            </IconButton>
            <Box className="admin-breadcrumb">
              <Typography>PMT</Typography>
              <span>/</span>
              <Typography component="strong">{moduleTitle}</Typography>
            </Box>
            <Box className="admin-toolbar-actions">
              <IconButton aria-label="Notificaciones" onClick={() => navigate("/admin/notificaciones")}>
                <Badge badgeContent={unreadNotifications} color="error" max={99}>
                  <NotificationsNoneRoundedIcon />
                </Badge>
              </IconButton>
              <Divider orientation="vertical" flexItem />
              <ButtonBase
                className="current-user"
                onClick={(event) => setProfileAnchor(event.currentTarget)}
                aria-label={`Abrir menú de ${session.name}`}
                aria-haspopup="menu"
                aria-expanded={Boolean(profileAnchor)}
              >
                <Avatar>
                  {session.name
                    .split(" ")
                    .map((word) => word[0])
                    .slice(0, 2)
                    .join("")}
                </Avatar>
                <Box>
                  <Typography>{session.name}</Typography>
                  <Typography component="small">{session.roleLabel}</Typography>
                </Box>
              </ButtonBase>
            </Box>
          </Toolbar>
        </AppBar>
        <Box component="main" className="admin-content">
          <Box
            key={location.pathname}
            className="route-stage admin-route-stage"
          >
            <Outlet />
          </Box>
        </Box>
      </Box>
      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            navigate("/admin/perfil");
            setProfileAnchor(null);
          }}
        >
          <AccountCircleRoundedIcon /> Mi perfil
        </MenuItem>
        <MenuItem onClick={closeSession}>Cerrar sesión</MenuItem>
      </Menu>
    </Box>
  );
}
