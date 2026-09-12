"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Divider, FormControlLabel, Paper, Stack, Switch, Tab, Tabs, Typography } from "@mui/material";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/src/components/common";
import { notificationsApi, type NotificationItem, type Preference } from "./api/notificationsApi";

export default function NotificationsPage(){
  const [tab,setTab]=useState(0);const [items,setItems]=useState<NotificationItem[]>([]);const [preferences,setPreferences]=useState<Preference[]>([]);const [loading,setLoading]=useState(true);const [message,setMessage]=useState("");const navigate=useNavigate();
  const load=()=>{setLoading(true);void Promise.all([notificationsApi.list(),notificationsApi.preferences()]).then(([inbox,prefs])=>{setItems(inbox.data);setPreferences(prefs.data);}).catch((reason:unknown)=>setMessage(reason instanceof Error?reason.message:"No se pudieron cargar las notificaciones.")).finally(()=>setLoading(false));};
  useEffect(load,[]);
  const open=async(item:NotificationItem)=>{if(!item.read_at)await notificationsApi.read(item.id);if(item.secure_path?.startsWith("/admin/"))navigate(item.secure_path);else load();};
  const readAll=async()=>{await notificationsApi.readAll();load();};
  const save=async()=>{await notificationsApi.savePreferences(preferences.map((item)=>({eventCode:item.event_code,internalEnabled:Boolean(item.internal_enabled)})));setMessage("Preferencias guardadas.");};
  return <Box className="module-page"><PageHeader eyebrow="Centro de avisos" title="Notificaciones" description="Bandeja personal y preferencias de avisos internos. Los canales externos permanecen deshabilitados." action={tab===0?<Button variant="outlined" startIcon={<DoneAllRoundedIcon/>} onClick={()=>void readAll()}>Marcar todas leídas</Button>:<Button variant="contained" onClick={()=>void save()}>Guardar preferencias</Button>}/><Tabs value={tab} onChange={(_,value)=>setTab(value)}><Tab label="Bandeja"/><Tab label="Preferencias"/></Tabs>{message&&<Alert severity={message.includes("guardadas")?"success":"error"}>{message}</Alert>}{loading?<CircularProgress/>:tab===0?<Stack spacing={1.5}>{items.length===0&&<Paper variant="outlined" sx={{p:3}}>No tienes notificaciones.</Paper>}{items.map((item)=><Paper key={item.id} variant="outlined" sx={{p:2,cursor:item.secure_path?"pointer":"default",borderLeft:4,borderLeftColor:item.severity==="CRITICAL"?"error.main":item.severity==="WARNING"?"warning.main":"primary.main",opacity:item.read_at?0.72:1}} onClick={()=>void open(item)}><Stack direction={{xs:"column",sm:"row"}} sx={{justifyContent:"space-between"}}><Box><Typography variant="h6">{item.title}</Typography><Typography color="text.secondary">{item.body}</Typography></Box><Typography component="small">{new Date(item.created_at).toLocaleString("es-GT")}</Typography></Stack></Paper>)}</Stack>:<Paper variant="outlined" sx={{p:3}}><Stack spacing={1}><Alert severity="info">Correo, SMS y push están preparados en arquitectura, pero no envían mensajes en esta tanda.</Alert>{preferences.map((item)=><Box key={item.event_code}><FormControlLabel control={<Switch checked={Boolean(item.internal_enabled)} onChange={(event)=>setPreferences((current)=>current.map((row)=>row.event_code===item.event_code?{...row,internal_enabled:event.target.checked?1:0}:row))}/>} label={item.title_template}/><Divider/></Box>)}</Stack></Paper>}</Box>;
}
