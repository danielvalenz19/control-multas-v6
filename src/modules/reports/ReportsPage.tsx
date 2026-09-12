"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField } from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import { PageHeader } from "@/src/components/common";
import { analyticsApi, type ReportResponse } from "@/src/modules/analytics/api/analyticsApi";

const options = [
  ["infractions","Infracciones"], ["collection","Recaudación"], ["cash","Caja"],
  ["payments-reversals","Pagos y reversos"], ["reconciliation","Conciliación"],
  ["aging","Antigüedad de saldos"], ["adjustments-exemptions","Ajustes y exoneraciones"],
  ["appeals","Impugnaciones"], ["solvencies","Solvencias"],
  ["agent-activity","Actividad de agentes"], ["audit","Auditoría"],
] as const;
const today = new Date();
const defaultTo = today.toISOString().slice(0,10);
const start = new Date(today);
start.setDate(start.getDate()-29);
const defaultFrom = start.toISOString().slice(0,10);

export default function ReportsPage({ initialType="infractions" }: { initialType?: string }) {
  const [type,setType]=useState(initialType);
  const [from,setFrom]=useState(defaultFrom);
  const [to,setTo]=useState(defaultTo);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [page,setPage]=useState(0);
  const [pageSize,setPageSize]=useState(25);
  const [result,setResult]=useState<ReportResponse|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setLoading(true);
    setError("");
    void analyticsApi.report(type,query(from,to,page+1,pageSize,status,search))
      .then((value)=>{if(active)setResult(value);})
      .catch((reason:unknown)=>{if(active)setError(reason instanceof Error?reason.message:"No se pudo cargar el reporte.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[type,from,to,page,pageSize,status,search]);
  const exportCsv=()=>{const params=query(from,to,1,pageSize,status,search);void analyticsApi.download(`/reports/${type}/export.csv?${params.toString()}`,`${type}-${from}-${to}.csv`).catch(showError(setError));};
  const exportPdf=()=>{const params=new URLSearchParams({from,to});void analyticsApi.download(`/reports/dashboard-summary.pdf?${params.toString()}`,`resumen-${from}-${to}.pdf`).catch(showError(setError));};
  return <Box className="module-page">
    <PageHeader eyebrow="Análisis institucional" title={initialType==="audit"?"Auditoría":"Reportes operativos y financieros"} description="Datos paginados desde MySQL. Las exportaciones conservan el rango y filtros seleccionados." action={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<DownloadRoundedIcon/>} onClick={exportCsv}>CSV UTF-8</Button><Button variant="outlined" startIcon={<PictureAsPdfRoundedIcon/>} onClick={exportPdf}>Resumen PDF</Button></Stack>}/>
    <Paper variant="outlined" className="filter-bar">
      <FormControl><InputLabel>Reporte</InputLabel><Select label="Reporte" value={type} onChange={(event)=>{setType(event.target.value);setPage(0);}}>{options.map(([value,name])=><MenuItem key={value} value={value}>{name}</MenuItem>)}</Select></FormControl>
      <TextField type="date" label="Desde" value={from} onChange={(event)=>{setFrom(event.target.value);setPage(0);}} slotProps={{inputLabel:{shrink:true}}}/>
      <TextField type="date" label="Hasta" value={to} onChange={(event)=>{setTo(event.target.value);setPage(0);}} slotProps={{inputLabel:{shrink:true}}}/>
      <TextField label="Estado" value={status} onChange={(event)=>{setStatus(event.target.value);setPage(0);}}/>
      <TextField label="Buscar" value={search} onChange={(event)=>{setSearch(event.target.value);setPage(0);}}/>
    </Paper>
    {error&&<Alert severity="error">{error}</Alert>}
    {loading?<Box sx={{display:"grid",placeItems:"center",height:240}}><CircularProgress/></Box>:<Paper variant="outlined" className="data-table-card">
      <TableContainer><Table size="small"><TableHead><TableRow>{result?.meta.columns.map((column)=><TableCell key={column}>{label(column)}</TableCell>)}</TableRow></TableHead><TableBody>
        {result?.data.map((row,index)=><TableRow key={String(row.id??row.boleta??row.pago??index)} hover>{result.meta.columns.map((column)=><TableCell key={column}>{format(row[column])}</TableCell>)}</TableRow>)}
        {result?.data.length===0&&<TableRow><TableCell colSpan={result.meta.columns.length||1}>No hay registros para los filtros seleccionados.</TableCell></TableRow>}
      </TableBody></Table></TableContainer>
      <TablePagination component="div" count={result?.meta.total??0} page={page} onPageChange={(_,value)=>setPage(value)} rowsPerPage={pageSize} onRowsPerPageChange={(event)=>{setPageSize(Number(event.target.value));setPage(0);}} rowsPerPageOptions={[10,25,50,100]}/>
    </Paper>}
  </Box>;
}

function query(from:string,to:string,page:number,pageSize:number,status:string,search:string) {
  const params=new URLSearchParams({from,to,page:String(page),pageSize:String(pageSize)});
  if(status) params.set("status",status);
  if(search) params.set("search",search);
  return params;
}
function label(value:string){return value.replaceAll("_"," ").replace(/^./,(letter)=>letter.toUpperCase());}
function format(value:unknown){if(value===null||value===undefined||value==="")return "—";if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(value))return new Date(value).toLocaleString("es-GT");return typeof value==="object"?JSON.stringify(value):String(value);}
function showError(setError:(message:string)=>void){return(reason:unknown)=>setError(reason instanceof Error?reason.message:"No se pudo exportar.");}
