"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Divider, FormControlLabel, Paper, Stack, Switch, Tab, Tabs, Typography } from "@mui/material";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/src/components/common";
import { notificationsApi, type NotificationItem, type Preference } from "./api/notificationsApi";

export default function NotificationsPage(){
  const [tab,setTab]=useState(0);const [items,setItems]=useState<NotificationItem[]>([]);const [preferences,setPreferences]=useState<Preference[]>([]);const [loading,setLoading]=useState(true);const [message,setMessage]=useState("");const [busyId,setBusyId]=useState<number|null>(null);const navigate=useNavigate();
  const load=()=>{setLoading(true);void Promise.all([notificationsApi.list(),notificationsApi.preferences()]).then(([inbox,prefs])=>{setItems(inbox.data);setPreferences(prefs.data);}).catch((reason:unknown)=>setMessage(reason instanceof Error?reason.message:"No se pudieron cargar las notificaciones.")).finally(()=>setLoading(false));};
  useEffect(load,[]);
  const markRead=async(item:NotificationItem,openAfter=false)=>{
    try{
      if(!item.read_at){setBusyId(item.id);await notificationsApi.read(item.id);setItems((current)=>current.map((row)=>row.id===item.id?{...row,read_at:new Date().toISOString()}:row));window.dispatchEvent(new Event("pmt:notifications-changed"));setMessage("Notificación marcada como leída.");}
      const destination=item.secure_path==="/admin"?"/admin/dashboard":item.secure_path;
      if(openAfter&&destination?.startsWith("/admin/"))navigate(destination);
    }catch(reason:unknown){setMessage(reason instanceof Error?reason.message:"No se pudo actualizar la notificación.");}finally{setBusyId(null);}
  };
  const open=(item:NotificationItem)=>void markRead(item,true);
  const readAll=async()=>{try{await notificationsApi.readAll();const readAt=new Date().toISOString();setItems((current)=>current.map((row)=>({...row,read_at:row.read_at??readAt})));window.dispatchEvent(new Event("pmt:notifications-changed"));setMessage("Todas las notificaciones están marcadas como leídas.");}catch(reason:unknown){setMessage(reason instanceof Error?reason.message:"No se pudieron actualizar las notificaciones.");}};
  const save=async()=>{await notificationsApi.savePreferences(preferences.map((item)=>({eventCode:item.event_code,internalEnabled:Boolean(item.internal_enabled)})));setMessage("Preferencias guardadas.");};
  return <Box className="module-page"><PageHeader eyebrow="Centro de avisos" title="Notificaciones" description="Bandeja personal y preferencias de avisos internos. Los canales externos permanecen deshabilitados." action={tab===0?<Button variant="outlined" startIcon={<DoneAllRoundedIcon/>} onClick={()=>void readAll()}>Marcar todas leídas</Button>:<Button variant="contained" onClick={()=>void save()}>Guardar preferencias</Button>}/><Tabs value={tab} onChange={(_,value)=>setTab(value)}><Tab label="Bandeja"/><Tab label="Preferencias"/></Tabs>{message&&<Alert className="notification-feedback" severity={message.includes("leída")||message.includes("guardadas")?"success":"error"}>{message}</Alert>}{loading?<CircularProgress/>:tab===0?<Stack className="notification-list" spacing={1.5}>{items.length===0&&<Paper variant="outlined" sx={{p:3}}>No tienes notificaciones.</Paper>}{items.map((item)=><Paper key={item.id} variant="outlined" className={`notification-item severity-${item.severity.toLowerCase()} ${item.read_at?"is-read":"is-unread"}`} onClick={()=>void open(item)}><Stack direction={{xs:"column",sm:"row"}} className="notification-item-row"><Box className="notification-item-copy"><Stack direction="row" spacing={1} sx={{alignItems:"center",flexWrap:"wrap"}}><Typography variant="h6">{item.title}</Typography><Chip size="small" label={item.read_at?"Leída":"Nueva"} color={item.read_at?"default":"primary"}/></Stack><Typography color="text.secondary">{item.body}</Typography></Box><Box className="notification-item-meta"><Typography component="small">{new Date(item.created_at).toLocaleString("es-GT")}</Typography><Button size="small" variant={item.read_at?"text":"outlined"} disabled={Boolean(item.read_at)||busyId===item.id} startIcon={<MarkEmailReadRoundedIcon/>} onClick={(event)=>{event.stopPropagation();void markRead(item)}}>{item.read_at?"Leída":"Marcar como leída"}</Button></Box></Stack></Paper>)}</Stack>:<Paper variant="outlined" sx={{p:3}}><Stack spacing={1}><Alert severity="info">Correo, SMS y push están preparados en arquitectura, pero no envían mensajes en esta tanda.</Alert>{preferences.map((item)=><Box key={item.event_code}><FormControlLabel control={<Switch checked={Boolean(item.internal_enabled)} onChange={(event)=>setPreferences((current)=>current.map((row)=>row.event_code===item.event_code?{...row,internal_enabled:event.target.checked?1:0}:row))}/>} label={item.title_template}/><Divider/></Box>)}</Stack></Paper>}</Box>;
}
