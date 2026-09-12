import { useState } from "react";
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, MenuItem, Paper, Stack, Switch, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, Tabs, TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import DevicesRoundedIcon from "@mui/icons-material/DevicesRounded";
import {
  ConfirmDialog, EmptyState, PageHeader, StatCard, StatusChip,
} from "@/src/components/common";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import {
  administrationApi, type AdminUser, type Agent, type CatalogRow, type Device,
  type Permission, type Role,
} from "../api/administrationApi";
import { useRemoteData } from "../hooks/useRemoteData";

const pageSizes = [5, 10, 25];

function State({ loading, error, empty, children }: {
  loading: boolean; error: string; empty: boolean; children: React.ReactNode;
}) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (loading) return <Alert severity="info">Cargando información municipal…</Alert>;
  if (empty) return <EmptyState title="Sin registros" description="No hay información que coincida con los filtros." />;
  return children;
}

function Notice({ message, clear }: { message: string; clear: () => void }) {
  return message ? (
    <Alert severity={message.startsWith("Error") ? "error" : "success"} onClose={clear} sx={{ mb: 2 }}>
      {message}
    </Alert>
  ) : null;
}

function Pager({ page, pageSize, total, onPage, onPageSize }: {
  page: number; pageSize: number; total: number;
  onPage: (page: number) => void; onPageSize: (pageSize: number) => void;
}) {
  return (
    <TablePagination
      component="div"
      count={total}
      page={page - 1}
      rowsPerPage={pageSize}
      rowsPerPageOptions={pageSizes}
      labelRowsPerPage="Filas por página"
      onPageChange={(_, next) => onPage(next + 1)}
      onRowsPerPageChange={(event) => onPageSize(Number(event.target.value))}
    />
  );
}

function errorMessage(error: unknown) {
  return `Error: ${error instanceof Error ? error.message : "No se pudo completar la operación."}`;
}

type UserForm = {
  username: string; email: string; password: string; firstName: string; lastName: string;
  phone: string; employeeCode: string; departmentId: string; roleIds: number[];
};
const emptyUser: UserForm = {
  username: "", email: "", password: "", firstName: "", lastName: "", phone: "",
  employeeCode: "", departmentId: "", roleIds: [],
};

export function UsersPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const remote = useRemoteData(
    () => administrationApi.users.list({ search, status, page, pageSize }),
    [search, status, page, pageSize],
  );
  const rolesRemote = useRemoteData(() => administrationApi.roles.list(), []);
  const lookups = useRemoteData(() => administrationApi.catalogs.lookups(), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<UserForm>(emptyUser);
  const [pending, setPending] = useState<{ row: AdminUser; kind: "status" | "sessions" } | null>(null);
  const rows = remote.data?.data ?? [];
  const roles = rolesRemote.data?.data.roles ?? [];

  function openUser(row?: AdminUser) {
    setEditing(row ?? null);
    setForm(row ? {
      username: row.username, email: row.email ?? "", password: "", firstName: row.firstName,
      lastName: row.lastName, phone: row.phone ?? "", employeeCode: row.employeeCode ?? "",
      departmentId: row.departmentId ?? "",
      roleIds: roles.filter((role) => row.roles.some((assigned) => assigned.code === role.code)).map((role) => role.id),
    } : emptyUser);
    setOpen(true);
  }

  async function save() {
    try {
      const payload = {
        username: form.username, email: form.email || null, firstName: form.firstName,
        lastName: form.lastName, phone: form.phone || null, employeeCode: form.employeeCode || null,
        departmentId: form.departmentId || null,
      };
      if (editing) {
        await administrationApi.users.update(editing.id, payload);
        await administrationApi.users.roles(editing.id, form.roleIds);
      } else {
        await administrationApi.users.create({ ...payload, password: form.password, roleIds: form.roleIds });
      }
      setOpen(false);
      setMessage("Usuario guardado correctamente.");
      await remote.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function confirmUserAction() {
    if (!pending) return;
    try {
      if (pending.kind === "status") {
        await administrationApi.users.status(pending.row.id, pending.row.status !== "ACTIVE");
        setMessage(pending.row.status === "ACTIVE" ? "Usuario desactivado y sesiones revocadas." : "Usuario activado.");
      } else {
        await administrationApi.users.revoke(pending.row.id);
        setMessage("Sesiones revocadas.");
      }
      setPending(null);
      await remote.refresh();
    } catch (error) {
      setPending(null);
      setMessage(errorMessage(error));
    }
  }

  return (
    <Box className="module-page">
      <PageHeader
        eyebrow="Administración de acceso"
        title="Usuarios"
        description="Cuentas institucionales reales, roles, estado y revocación de sesiones."
        action={hasPermission("users.create") ? <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openUser()}>Nuevo usuario</Button> : undefined}
      />
      <Notice message={message} clear={() => setMessage("")} />
      <Grid container spacing={2} className="stats-grid">
        <Grid size={{ xs: 12, md: 4 }}><StatCard label="Usuarios" value={String(remote.data?.meta.total ?? 0)} helper="Registros MySQL" /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><StatCard label="Activos en página" value={String(rows.filter((row) => row.status === "ACTIVE").length)} helper="Con acceso habilitado" tone="success" /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><StatCard label="Roles" value={String(roles.length)} helper="Roles institucionales" /></Grid>
      </Grid>
      <Paper variant="outlined" className="filter-bar">
        <TextField className="filter-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Usuario, correo, nombre o código" />
        <TextField select label="Estado" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="DISABLED">Desactivado</MenuItem><MenuItem value="LOCKED">Bloqueado</MenuItem>
        </TextField>
      </Paper>
      <State loading={remote.loading} error={remote.error} empty={!rows.length}>
        <Paper variant="outlined" className="data-table-card">
          <TableContainer><Table><TableHead><TableRow>
            <TableCell>Usuario</TableCell><TableCell>Roles</TableCell><TableCell>Dependencia</TableCell><TableCell>Estado</TableCell><TableCell align="right">Acciones</TableCell>
          </TableRow></TableHead><TableBody>{rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell><strong>{row.firstName} {row.lastName}</strong><Typography component="small" sx={{ display: "block" }}>{row.username} · {row.email ?? "Sin correo"}</Typography></TableCell>
              <TableCell>{row.roles.map((role) => role.name).join(", ") || "Sin rol"}</TableCell>
              <TableCell>{row.departmentName ?? "—"}</TableCell><TableCell><StatusChip status={row.status} /></TableCell>
              <TableCell align="right">
                {hasPermission("users.update") && <Button onClick={() => openUser(row)}>Editar</Button>}
                {hasPermission("users.change_status") && <Button color={row.status === "ACTIVE" ? "error" : "primary"} onClick={() => setPending({ row, kind: "status" })}>{row.status === "ACTIVE" ? "Desactivar" : "Activar"}</Button>}
                {hasPermission("users.change_status") && <Button onClick={() => setPending({ row, kind: "sessions" })}>Revocar sesiones</Button>}
              </TableCell>
            </TableRow>
          ))}</TableBody></Table></TableContainer>
          <Pager page={page} pageSize={pageSize} total={remote.data?.meta.total ?? 0} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
        </Paper>
      </State>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Editar usuario" : "Crear usuario"}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Usuario" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <TextField label="Nombres" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          <TextField label="Apellidos" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          <TextField label="Correo" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <TextField label="Teléfono" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          <TextField label="Código de empleado" value={form.employeeCode} onChange={(event) => setForm({ ...form, employeeCode: event.target.value })} />
          <TextField select label="Dependencia" value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>
            <MenuItem value="">Sin dependencia</MenuItem>{(lookups.data?.data.departments ?? []).map((department) => <MenuItem key={department.id} value={String(department.id)}>{String(department.name)}</MenuItem>)}
          </TextField>
          {!editing && <TextField label="Contraseña inicial" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} helperText="Mínimo 12 caracteres, mayúscula, minúscula, número y símbolo." />}
          <Typography sx={{ fontWeight: 700 }}>Roles</Typography>
          {roles.map((role) => <FormControlLabel key={role.id} control={<Checkbox checked={form.roleIds.includes(role.id)} onChange={(_, checked) => setForm({ ...form, roleIds: checked ? [...form.roleIds, role.id] : form.roleIds.filter((id) => id !== role.id) })} />} label={role.name} />)}
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" onClick={() => void save()}>Guardar</Button></DialogActions>
      </Dialog>
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.kind === "sessions" ? "Revocar sesiones" : pending?.row.status === "ACTIVE" ? "Desactivar usuario" : "Activar usuario"}
        description={pending?.kind === "sessions" ? "Se cerrarán todas las sesiones activas de esta cuenta." : "El cambio de acceso quedará registrado en auditoría."}
        confirmLabel="Confirmar"
        danger={pending?.kind === "sessions" || pending?.row.status === "ACTIVE"}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmUserAction()}
      />
    </Box>
  );
}

export function RolesPage() {
  const { hasPermission } = useAuth();
  const remote = useRemoteData(() => administrationApi.roles.list(), []);
  const [selected, setSelected] = useState<Role | null>(null);
  const [permissionIds, setPermissionIds] = useState<number[]>([]);
  const [editing, setEditing] = useState<Role | null | undefined>(undefined);
  const [roleForm, setRoleForm] = useState({ code: "", name: "", description: "" });
  const [message, setMessage] = useState("");
  const roles = remote.data?.data.roles ?? [];
  const permissions = remote.data?.data.permissions ?? [];

  function openRole(role: Role | null) {
    setEditing(role);
    setRoleForm(role ? { code: role.code, name: role.name, description: role.description ?? "" } : { code: "", name: "", description: "" });
  }

  async function saveRole() {
    try {
      if (editing) await administrationApi.roles.update(editing.id, roleForm);
      else await administrationApi.roles.create(roleForm);
      setEditing(undefined); setMessage("Rol guardado correctamente."); await remote.refresh();
    } catch (error) { setMessage(errorMessage(error)); }
  }

  return (
    <Box className="module-page">
      <PageHeader eyebrow="RBAC" title="Roles y permisos" description="Matriz institucional persistida en MySQL." action={hasPermission("roles.manage") ? <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openRole(null)}>Nuevo rol</Button> : undefined} />
      <Notice message={message} clear={() => setMessage("")} />
      <State loading={remote.loading} error={remote.error} empty={!roles.length}>
        <Grid container spacing={2}>{roles.map((role) => <Grid size={{ xs: 12, md: 6, lg: 4 }} key={role.id}>
          <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}>
            <Typography variant="h6">{role.name}</Typography><Typography color="text.secondary">{role.code} · {role.permission_count} permisos · {role.user_count} usuarios</Typography><StatusChip status={role.is_active ? "ACTIVE" : "INACTIVE"} />
            {hasPermission("roles.manage") && <Stack direction="row" sx={{ flexWrap: "wrap" }}><Button onClick={() => openRole(role)}>Editar</Button><Button onClick={() => { setSelected(role); setPermissionIds(role.permission_ids?.split(",").map(Number) ?? []); }}>Administrar permisos</Button></Stack>}
          </Stack></Paper>
        </Grid>)}</Grid>
      </State>
      <Dialog open={editing !== undefined} onClose={() => setEditing(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Editar rol" : "Crear rol"}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Código" value={roleForm.code} onChange={(event) => setRoleForm({ ...roleForm, code: event.target.value })} />
          <TextField label="Nombre" value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} />
          <TextField label="Descripción" multiline minRows={2} value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} />
        </Stack></DialogContent><DialogActions><Button onClick={() => setEditing(undefined)}>Cancelar</Button><Button variant="contained" onClick={() => void saveRole()}>Guardar</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md">
        <DialogTitle>Permisos · {selected?.name}</DialogTitle><DialogContent><Stack>{Object.entries(permissions.reduce<Record<string, Permission[]>>((groups, item) => { (groups[item.module] ??= []).push(item); return groups; }, {})).map(([module, items]) => <Box key={module} sx={{ mb: 2 }}><Typography sx={{ fontWeight: 700 }}>{module}</Typography>{items.map((item) => <FormControlLabel key={item.id} control={<Checkbox checked={permissionIds.includes(item.id)} onChange={(_, checked) => setPermissionIds(checked ? [...permissionIds, item.id] : permissionIds.filter((id) => id !== item.id))} />} label={item.code} />)}</Box>)}</Stack></DialogContent>
        <DialogActions><Button onClick={() => setSelected(null)}>Cancelar</Button><Button variant="contained" onClick={() => selected && void administrationApi.roles.permissions(selected.id, permissionIds).then(async () => { setSelected(null); setMessage("Permisos actualizados."); await remote.refresh(); }).catch((error) => setMessage(errorMessage(error)))}>Guardar permisos</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

type AgentForm = { userId: string; badgeNumber: string; hiredAt: string };
export function AgentsPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const remote = useRemoteData(() => administrationApi.agents.list({ search, status, page, pageSize }), [search, status, page, pageSize]);
  const users = useRemoteData(() => administrationApi.users.list({ pageSize: 100, status: "ACTIVE" }), []);
  const [editing, setEditing] = useState<Agent | null | undefined>(undefined);
  const [form, setForm] = useState<AgentForm>({ userId: "", badgeNumber: "", hiredAt: "" });
  const [pending, setPending] = useState<Agent | null>(null); const [message, setMessage] = useState("");
  const rows = remote.data?.data ?? [];

  function openAgent(row: Agent | null) { setEditing(row); setForm(row ? { userId: String(row.user_id), badgeNumber: row.badge_number, hiredAt: row.hired_at?.slice(0, 10) ?? "" } : { userId: "", badgeNumber: "", hiredAt: "" }); }
  async function save() { try { const body = { ...form, hiredAt: form.hiredAt || null }; if (editing) await administrationApi.agents.update(editing.id, body); else await administrationApi.agents.create(body); setEditing(undefined); setMessage("Agente guardado correctamente."); await remote.refresh(); } catch (error) { setMessage(errorMessage(error)); } }
  async function changeStatus() { if (!pending) return; try { await administrationApi.agents.status(pending.id, pending.status !== "ACTIVE"); setPending(null); await remote.refresh(); } catch (error) { setPending(null); setMessage(errorMessage(error)); } }

  return <Box className="module-page">
    <PageHeader eyebrow="Personal operativo" title="Agentes PMT" description="Agentes relacionados con cuentas institucionales y número único." action={hasPermission("users.create") ? <Button variant="contained" startIcon={<AssignmentIndRoundedIcon />} onClick={() => openAgent(null)}>Nuevo agente</Button> : undefined} />
    <Notice message={message} clear={() => setMessage("")} />
    <Paper variant="outlined" className="filter-bar"><TextField className="filter-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Número, usuario o nombre" /><TextField select label="Estado" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} sx={{ minWidth: 180 }}><MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="SUSPENDED">Suspendido</MenuItem><MenuItem value="INACTIVE">Inactivo</MenuItem></TextField></Paper>
    <State loading={remote.loading} error={remote.error} empty={!rows.length}><Paper variant="outlined" className="data-table-card"><TableContainer><Table><TableHead><TableRow><TableCell>Número</TableCell><TableCell>Agente</TableCell><TableCell>Usuario</TableCell><TableCell>Estado</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><strong>{row.badge_number}</strong></TableCell><TableCell>{row.first_name} {row.last_name}</TableCell><TableCell>{row.username}</TableCell><TableCell><StatusChip status={row.status} /></TableCell><TableCell align="right">{hasPermission("users.update") && <Button onClick={() => openAgent(row)}>Editar</Button>}{hasPermission("users.change_status") && <Button color={row.status === "ACTIVE" ? "error" : "primary"} onClick={() => setPending(row)}>{row.status === "ACTIVE" ? "Desactivar" : "Activar"}</Button>}</TableCell></TableRow>)}</TableBody></Table></TableContainer><Pager page={page} pageSize={pageSize} total={remote.data?.meta.total ?? 0} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} /></Paper></State>
    <Dialog open={editing !== undefined} onClose={() => setEditing(undefined)} fullWidth maxWidth="sm"><DialogTitle>{editing ? "Editar agente" : "Registrar agente"}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField select label="Usuario activo" value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}>{(users.data?.data ?? []).map((user) => <MenuItem key={user.id} value={user.id}>{user.firstName} {user.lastName} · {user.username}</MenuItem>)}</TextField><TextField label="Número institucional" value={form.badgeNumber} onChange={(event) => setForm({ ...form, badgeNumber: event.target.value })} /><TextField type="date" label="Fecha de contratación" value={form.hiredAt} onChange={(event) => setForm({ ...form, hiredAt: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Stack></DialogContent><DialogActions><Button onClick={() => setEditing(undefined)}>Cancelar</Button><Button variant="contained" onClick={() => void save()}>Guardar</Button></DialogActions></Dialog>
    <ConfirmDialog open={Boolean(pending)} title={pending?.status === "ACTIVE" ? "Desactivar agente" : "Activar agente"} description="El estado operativo determina si el agente puede emitir boletas." confirmLabel="Confirmar" danger={pending?.status === "ACTIVE"} onCancel={() => setPending(null)} onConfirm={() => void changeStatus()} />
  </Box>;
}

type DeviceForm = { deviceUuid: string; institutionalCode: string; deviceType: string; platform: string; model: string; operatingSystem: string; appVersion: string };
const emptyDevice: DeviceForm = { deviceUuid: "", institutionalCode: "", deviceType: "MOBILE", platform: "Android", model: "", operatingSystem: "", appVersion: "" };
export function DevicesPage() {
  const { hasPermission } = useAuth(); const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const remote = useRemoteData(() => administrationApi.devices.list({ search, status, page, pageSize }), [search, status, page, pageSize]);
  const users = useRemoteData(() => administrationApi.users.list({ pageSize: 100, status: "ACTIVE" }), []);
  const [editing, setEditing] = useState<Device | null | undefined>(undefined); const [assigning, setAssigning] = useState<Device | null>(null);
  const [userId, setUserId] = useState(""); const [form, setForm] = useState<DeviceForm>(emptyDevice);
  const [pending, setPending] = useState<{ row: Device; kind: "assignment" | "block" } | null>(null); const [message, setMessage] = useState("");
  const rows = remote.data?.data ?? [];
  function openDevice(row: Device | null) { setEditing(row); setForm(row ? { deviceUuid: row.device_uuid, institutionalCode: row.institutional_code, deviceType: row.device_type, platform: row.platform, model: row.model ?? "", operatingSystem: row.operating_system ?? "", appVersion: row.app_version ?? "" } : emptyDevice); }
  async function save() { try { if (editing) await administrationApi.devices.update(editing.id, form); else await administrationApi.devices.create(form); setEditing(undefined); setMessage("Dispositivo guardado correctamente."); await remote.refresh(); } catch (error) { setMessage(errorMessage(error)); } }
  async function criticalAction() { if (!pending) return; try { if (pending.kind === "assignment") await administrationApi.devices.unassign(pending.row.id, "Fin de asignación administrativa"); else await administrationApi.devices.block(pending.row.id, pending.row.status !== "BLOCKED"); setPending(null); await remote.refresh(); } catch (error) { setPending(null); setMessage(errorMessage(error)); } }
  return <Box className="module-page">
    <PageHeader eyebrow="Equipos autorizados" title="Dispositivos" description="Registro, asignación histórica y bloqueo de sincronización." action={hasPermission("devices.manage") ? <Button variant="contained" startIcon={<DevicesRoundedIcon />} onClick={() => openDevice(null)}>Registrar dispositivo</Button> : undefined} />
    <Notice message={message} clear={() => setMessage("")} />
    <Paper variant="outlined" className="filter-bar"><TextField className="filter-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Código, UUID o modelo" /><TextField select label="Estado" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} sx={{ minWidth: 180 }}><MenuItem value="">Todos</MenuItem><MenuItem value="PENDING">Pendiente</MenuItem><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="BLOCKED">Bloqueado</MenuItem><MenuItem value="RETIRED">Retirado</MenuItem></TextField></Paper>
    <State loading={remote.loading} error={remote.error} empty={!rows.length}><Paper variant="outlined"><Grid container spacing={2} sx={{ p: 2 }}>{rows.map((row) => <Grid size={{ xs: 12, md: 6, lg: 4 }} key={row.id}><Paper variant="outlined" className="device-card"><Typography variant="h6">{row.institutional_code}</Typography><Typography color="text.secondary">{row.device_type} · {row.platform} · {row.model ?? "Sin modelo"}</Typography><StatusChip status={row.status} /><Typography>Responsable: <strong>{row.username ?? "Sin asignar"}</strong></Typography><Stack direction="row" sx={{ flexWrap: "wrap" }}>{hasPermission("devices.manage") && <Button onClick={() => openDevice(row)}>Editar</Button>}{hasPermission("devices.assign") && !row.assignment_id && <Button onClick={() => { setUserId(""); setAssigning(row); }}>Asignar</Button>}{hasPermission("devices.assign") && row.assignment_id && <Button onClick={() => setPending({ row, kind: "assignment" })}>Desasignar</Button>}{hasPermission("devices.manage") && row.status !== "RETIRED" && <Button color={row.status === "BLOCKED" ? "primary" : "error"} onClick={() => setPending({ row, kind: "block" })}>{row.status === "BLOCKED" ? "Desbloquear" : "Bloquear"}</Button>}</Stack></Paper></Grid>)}</Grid><Pager page={page} pageSize={pageSize} total={remote.data?.meta.total ?? 0} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} /></Paper></State>
    <Dialog open={editing !== undefined} onClose={() => setEditing(undefined)} fullWidth maxWidth="sm"><DialogTitle>{editing ? "Editar dispositivo" : "Registrar dispositivo"}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="Código institucional" value={form.institutionalCode} onChange={(event) => setForm({ ...form, institutionalCode: event.target.value })} /><TextField label="UUID" value={form.deviceUuid} onChange={(event) => setForm({ ...form, deviceUuid: event.target.value })} /><TextField label="Plataforma" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })} /><TextField label="Modelo" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /><TextField label="Sistema operativo" value={form.operatingSystem} onChange={(event) => setForm({ ...form, operatingSystem: event.target.value })} /><TextField label="Versión de aplicación" value={form.appVersion} onChange={(event) => setForm({ ...form, appVersion: event.target.value })} /><TextField select label="Tipo" value={form.deviceType} onChange={(event) => setForm({ ...form, deviceType: event.target.value })}><MenuItem value="MOBILE">Móvil</MenuItem><MenuItem value="WEB_STATION">Estación web</MenuItem></TextField></Stack></DialogContent><DialogActions><Button onClick={() => setEditing(undefined)}>Cancelar</Button><Button variant="contained" onClick={() => void save()}>Guardar</Button></DialogActions></Dialog>
    <Dialog open={Boolean(assigning)} onClose={() => setAssigning(null)} fullWidth maxWidth="xs"><DialogTitle>Asignar {assigning?.institutional_code}</DialogTitle><DialogContent><TextField select fullWidth sx={{ mt: 1 }} label="Responsable" value={userId} onChange={(event) => setUserId(event.target.value)}>{(users.data?.data ?? []).map((user) => <MenuItem key={user.id} value={user.id}>{user.firstName} {user.lastName}</MenuItem>)}</TextField></DialogContent><DialogActions><Button onClick={() => setAssigning(null)}>Cancelar</Button><Button variant="contained" disabled={!userId} onClick={() => assigning && void administrationApi.devices.assign(assigning.id, userId).then(async () => { setAssigning(null); setMessage("Dispositivo asignado."); await remote.refresh(); }).catch((error) => setMessage(errorMessage(error)))}>Asignar</Button></DialogActions></Dialog>
    <ConfirmDialog open={Boolean(pending)} title={pending?.kind === "assignment" ? "Desasignar dispositivo" : pending?.row.status === "BLOCKED" ? "Desbloquear dispositivo" : "Bloquear dispositivo"} description={pending?.kind === "assignment" ? "La asignación finalizará, pero su historial se conservará." : "El cambio controla si el equipo puede sincronizar."} confirmLabel="Confirmar" danger={pending?.kind === "assignment" || pending?.row.status !== "BLOCKED"} onCancel={() => setPending(null)} onConfirm={() => void criticalAction()} />
  </Box>;
}

const catalogTabs = [
  { path: "infraction-types", label: "Tipos de infracción" }, { path: "infraction-rate-versions", label: "Tarifas" },
  { path: "action-reasons", label: "Motivos" }, { path: "departments", label: "Dependencias" },
  { path: "frequent-locations", label: "Ubicaciones" }, { path: "document-sequences", label: "Correlativos" },
] as const;
type CatalogPath = (typeof catalogTabs)[number]["path"];
type CatalogForm = Record<string, string | boolean>;
function blankCatalog(): CatalogForm { return { code: "", name: "", legalBasis: "", description: "", isActive: true, requiresDriverData: false, requiresEvidence: true, amount: "", infractionTypeId: "", effectiveFrom: "", changeReason: "", legalReference: "", approvedBy: "", category: "INFRACTION_RETURN", requiresComment: true, siteId: "", documentType: "INFRACTION", sequenceYear: String(new Date().getFullYear()), prefix: "", nextNumber: "1", paddingLength: "6", zoneId: "", address: "", latitude: "", longitude: "" }; }

export function CatalogsPage() {
  const { hasPermission } = useAuth(); const [tab, setTab] = useState(0); const config = catalogTabs[tab];
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const remote = useRemoteData(() => config.path === "infraction-rate-versions" ? administrationApi.catalogs.rates({ search, page, pageSize }) : config.path === "document-sequences" ? administrationApi.catalogs.sequences({ search, page, pageSize }) : administrationApi.catalogs.list(config.path, { search, page, pageSize }), [config.path, search, page, pageSize]);
  const types = useRemoteData(() => administrationApi.catalogs.list("infraction-types", { pageSize: 100 }), []);
  const lookups = useRemoteData(() => administrationApi.catalogs.lookups(), []);
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<CatalogRow | null>(null); const [message, setMessage] = useState(""); const [form, setForm] = useState<CatalogForm>(blankCatalog());
  const [pendingStatus, setPendingStatus] = useState<CatalogRow | null>(null); const rows = remote.data?.data ?? [];

  function openCatalog(row: CatalogRow | null) {
    setEditing(row); const next = blankCatalog();
    if (row) Object.assign(next, { code: String(row.code ?? ""), name: String(row.name ?? ""), legalBasis: String(row.legal_basis ?? ""), description: String(row.description ?? ""), isActive: Boolean(row.is_active), requiresDriverData: Boolean(row.requires_driver_data), requiresEvidence: Boolean(row.requires_evidence), category: String(row.category ?? "INFRACTION_RETURN"), requiresComment: Boolean(row.requires_comment), zoneId: String(row.zone_id ?? ""), address: String(row.address ?? ""), latitude: String(row.latitude ?? ""), longitude: String(row.longitude ?? ""), siteId: String(row.site_id ?? ""), documentType: String(row.document_type ?? "INFRACTION"), sequenceYear: String(row.sequence_year ?? new Date().getFullYear()), prefix: String(row.prefix ?? ""), nextNumber: String(row.next_number ?? 1), paddingLength: String(row.padding_length ?? 6) });
    setForm(next); setOpen(true);
  }

  function cleanPayload(path: CatalogPath, source: CatalogForm) {
    if (path === "infraction-types") return { code: source.code, name: source.name, legalBasis: source.legalBasis, description: source.description || null, requiresDriverData: source.requiresDriverData, requiresEvidence: source.requiresEvidence, isActive: source.isActive };
    if (path === "action-reasons") return { category: source.category, code: source.code, name: source.name, description: source.description || null, requiresComment: source.requiresComment, requiresEvidence: source.requiresEvidence, isActive: source.isActive };
    if (path === "departments") return { code: source.code, name: source.name, isActive: source.isActive };
    if (path === "frequent-locations") return { zoneId: source.zoneId, code: source.code, name: source.name, address: source.address || null, latitude: source.latitude || null, longitude: source.longitude || null, isActive: source.isActive };
    if (path === "document-sequences") return { siteId: source.siteId, documentType: source.documentType, sequenceYear: source.sequenceYear, prefix: source.prefix, nextNumber: source.nextNumber, paddingLength: source.paddingLength };
    return { infractionTypeId: source.infractionTypeId, amount: source.amount, effectiveFrom: source.effectiveFrom, legalReference: source.legalReference || null, changeReason: source.changeReason, approvedBy: source.approvedBy || null };
  }

  async function save() { try { const payload = cleanPayload(config.path, form); if (editing) { if (config.path === "document-sequences") await administrationApi.catalogs.updateSequence(editing.id, payload); else await administrationApi.catalogs.update(config.path, editing.id, payload); } else if (config.path === "infraction-rate-versions") await administrationApi.catalogs.createRate(payload); else if (config.path === "document-sequences") await administrationApi.catalogs.createSequence(payload); else await administrationApi.catalogs.create(config.path, payload); setOpen(false); setMessage(config.path === "infraction-rate-versions" ? "Nueva versión de tarifa creada; el monto histórico se conservó." : "Registro guardado correctamente."); await remote.refresh(); } catch (error) { setMessage(errorMessage(error)); } }
  async function changeCatalogStatus() { if (!pendingStatus) return; try { await administrationApi.catalogs.update(config.path, pendingStatus.id, { isActive: pendingStatus.is_active !== 1 }); setPendingStatus(null); await remote.refresh(); } catch (error) { setPendingStatus(null); setMessage(errorMessage(error)); } }

  return <Box className="module-page">
    <PageHeader eyebrow="Datos maestros" title="Catálogos" description="Catálogos reales, tarifas históricas inmutables y correlativos transaccionales." action={hasPermission("catalogs.manage") ? <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openCatalog(null)}>{config.path === "infraction-rate-versions" ? "Nueva versión" : "Nuevo registro"}</Button> : undefined} />
    <Notice message={message} clear={() => setMessage("")} />
    <Paper variant="outlined" sx={{ mb: 2 }}><Tabs value={tab} onChange={(_, value: number) => { setTab(value); setPage(1); setSearch(""); }} variant="scrollable">{catalogTabs.map((item) => <Tab key={item.path} label={item.label} />)}</Tabs></Paper>
    <Paper variant="outlined" className="filter-bar"><TextField className="filter-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={`Buscar en ${config.label.toLowerCase()}`} /></Paper>
    <State loading={remote.loading} error={remote.error} empty={!rows.length}><Paper variant="outlined" className="data-table-card"><TableContainer><Table><TableHead><TableRow><TableCell>Código/ID</TableCell><TableCell>Nombre o tipo</TableCell><TableCell>Detalle</TableCell><TableCell>Estado/vigencia</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><strong>{String(row.code ?? row.id)}</strong></TableCell><TableCell>{String(row.name ?? row.document_type ?? "Versión de tarifa")}</TableCell><TableCell>{String(row.legal_basis ?? row.description ?? row.amount ?? row.prefix ?? "—")}</TableCell><TableCell><StatusChip status={row.is_active === 0 ? "INACTIVE" : String(row.effective_from ?? "ACTIVE")} /></TableCell><TableCell align="right">{config.path !== "infraction-rate-versions" && hasPermission("catalogs.manage") && <Button onClick={() => openCatalog(row)}>Editar</Button>}{!["infraction-rate-versions", "document-sequences"].includes(config.path) && hasPermission("catalogs.manage") && <Button color={row.is_active ? "error" : "primary"} onClick={() => setPendingStatus(row)}>{row.is_active ? "Desactivar" : "Activar"}</Button>}{config.path === "document-sequences" && hasPermission("catalogs.manage") && <Button onClick={() => void administrationApi.catalogs.next(row.id).then((result) => setMessage(`Número generado: ${result.data.number}`)).catch((error) => setMessage(errorMessage(error)))}>Generar siguiente</Button>}</TableCell></TableRow>)}</TableBody></Table></TableContainer><Pager page={page} pageSize={pageSize} total={remote.data?.meta.total ?? 0} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} /></Paper></State>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? "Editar" : "Nuevo"} · {config.label}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><CatalogFields path={config.path} form={form} setForm={setForm} types={types.data?.data ?? []} sites={lookups.data?.data.sites ?? []} zones={lookups.data?.data.zones ?? []} /></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" onClick={() => void save()}>Guardar</Button></DialogActions></Dialog>
    <ConfirmDialog open={Boolean(pendingStatus)} title={pendingStatus?.is_active ? "Desactivar registro" : "Activar registro"} description="El registro no se eliminará físicamente y su historial permanecerá disponible." confirmLabel="Confirmar" danger={!!pendingStatus?.is_active} onCancel={() => setPendingStatus(null)} onConfirm={() => void changeCatalogStatus()} />
  </Box>;
}

function CatalogFields({ path, form, setForm, types, sites, zones }: { path: CatalogPath; form: CatalogForm; setForm: (form: CatalogForm) => void; types: CatalogRow[]; sites: CatalogRow[]; zones: CatalogRow[] }) {
  const field = (key: string, value: string | boolean) => setForm({ ...form, [key]: value });
  if (path === "infraction-rate-versions") return <><TextField select label="Tipo de infracción" value={String(form.infractionTypeId)} onChange={(event) => field("infractionTypeId", event.target.value)}>{types.filter((type) => type.is_active).map((type) => <MenuItem key={type.id} value={String(type.id)}>{String(type.code)} · {String(type.name)}</MenuItem>)}</TextField><TextField label="Monto" type="number" value={String(form.amount)} onChange={(event) => field("amount", event.target.value)} slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }} /><TextField label="Vigente desde" type="date" value={String(form.effectiveFrom)} onChange={(event) => field("effectiveFrom", event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="Referencia legal" value={String(form.legalReference)} onChange={(event) => field("legalReference", event.target.value)} /><TextField label="Motivo del cambio" value={String(form.changeReason)} onChange={(event) => field("changeReason", event.target.value)} /><TextField label="Aprobado por" value={String(form.approvedBy)} onChange={(event) => field("approvedBy", event.target.value)} /></>;
  if (path === "document-sequences") return <><TextField select label="Sede" value={String(form.siteId)} onChange={(event) => field("siteId", event.target.value)}>{sites.map((site) => <MenuItem key={site.id} value={String(site.id)}>{String(site.code)} · {String(site.name)}</MenuItem>)}</TextField><TextField select label="Tipo documental" value={String(form.documentType)} onChange={(event) => field("documentType", event.target.value)}>{["INFRACTION", "CASE_FILE"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField label="Año" type="number" value={String(form.sequenceYear)} onChange={(event) => field("sequenceYear", event.target.value)} /><TextField label="Prefijo" value={String(form.prefix)} onChange={(event) => field("prefix", event.target.value)} /><TextField label="Siguiente número" type="number" value={String(form.nextNumber)} onChange={(event) => field("nextNumber", event.target.value)} /><TextField label="Longitud" type="number" value={String(form.paddingLength)} onChange={(event) => field("paddingLength", event.target.value)} /></>;
  return <>{path === "frequent-locations" && <TextField select label="Zona" value={String(form.zoneId)} onChange={(event) => field("zoneId", event.target.value)}>{zones.map((zone) => <MenuItem key={zone.id} value={String(zone.id)}>{String(zone.code)} · {String(zone.name)}</MenuItem>)}</TextField>}{path === "action-reasons" && <TextField select label="Categoría" value={String(form.category)} onChange={(event) => field("category", event.target.value)}>{["INFRACTION_RETURN", "INFRACTION_REJECT", "INFRACTION_CANCEL", "DEVICE_BLOCK", "USER_DISABLE"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>}<TextField label="Código" value={String(form.code)} onChange={(event) => field("code", event.target.value)} /><TextField label="Nombre" value={String(form.name)} onChange={(event) => field("name", event.target.value)} />{path === "infraction-types" && <TextField label="Base legal" value={String(form.legalBasis)} onChange={(event) => field("legalBasis", event.target.value)} />}{path === "frequent-locations" && <><TextField label="Dirección" value={String(form.address)} onChange={(event) => field("address", event.target.value)} /><Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField label="Latitud" type="number" value={String(form.latitude)} onChange={(event) => field("latitude", event.target.value)} /><TextField label="Longitud" type="number" value={String(form.longitude)} onChange={(event) => field("longitude", event.target.value)} /></Stack></>} {path !== "departments" && path !== "frequent-locations" && <TextField label="Descripción" value={String(form.description)} onChange={(event) => field("description", event.target.value)} />}{path === "infraction-types" && <><FormControlLabel control={<Switch checked={Boolean(form.requiresDriverData)} onChange={(_, checked) => field("requiresDriverData", checked)} />} label="Requiere datos del conductor" /><FormControlLabel control={<Switch checked={Boolean(form.requiresEvidence)} onChange={(_, checked) => field("requiresEvidence", checked)} />} label="Requiere evidencia" /></>}{path === "action-reasons" && <FormControlLabel control={<Switch checked={Boolean(form.requiresComment)} onChange={(_, checked) => field("requiresComment", checked)} />} label="Requiere comentario" />}<FormControlLabel control={<Switch checked={Boolean(form.isActive)} onChange={(_, checked) => field("isActive", checked)} />} label="Activo" /></>;
}
