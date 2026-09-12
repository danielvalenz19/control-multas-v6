import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Container, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BusyButton, ErrorState, StatusChip, readableError } from "@/src/components/common";
import { solvenciesApi, type PublicSolvency } from "@/src/modules/solvencies/api/solvenciesApi";

const referencePattern = /^[a-f0-9]{40}$/;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-GT", {
  dateStyle: "long",
  timeStyle: "short",
}).format(new Date(value));

export function PublicSolvencyVerifyPage() {
  const { codigo = "" } = useParams();
  const navigate = useNavigate();
  const [reference, setReference] = useState(codigo.toLowerCase());
  const [result, setResult] = useState<PublicSolvency | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const verify = useCallback(async (value: string) => {
    if (!referencePattern.test(value)) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult((await solvenciesApi.verify(value)).data);
    } catch (reason) {
      setError(readableError(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (referencePattern.test(codigo)) void verify(codigo);
  }, [codigo, verify]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!referencePattern.test(reference)) return;
    if (codigo === reference) void verify(reference);
    else navigate(`/solvencia/${reference}`);
  }

  return <Container maxWidth="md" className="public-page">
    <Box className="section-heading centered">
      <Typography className="overline">Consulta pública oficial</Typography>
      <Typography variant="h2">Verifica una solvencia</Typography>
      <Typography color="text.secondary">Comprueba la autenticidad y vigencia del documento mediante su referencia pública de 40 caracteres.</Typography>
    </Box>
    <Paper variant="outlined" className="public-form-card">
      <form onSubmit={submit}>
        <Stack spacing={2}>
          <TextField
            label="Referencia pública"
            value={reference}
            onChange={(event) => setReference(event.target.value.trim().toLowerCase())}
            slotProps={{ htmlInput: { maxLength: 40 } }}
            autoComplete="off"
            helperText={`${reference.length}/40 caracteres`}
            error={reference.length > 0 && !referencePattern.test(reference)}
          />
          <BusyButton busy={busy} type="submit" variant="contained" size="large" startIcon={<SearchRoundedIcon />} disabled={!referencePattern.test(reference)}>
            Verificar documento
          </BusyButton>
        </Stack>
      </form>
      {error && <Box sx={{ mt: 3 }}><ErrorState message={error} onRetry={() => void verify(reference)} /></Box>}
      {result && <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <VerifiedUserRoundedIcon color={result.valid ? "success" : "error"} />
              <Typography variant="h5">{result.valid ? "Documento vigente" : "Documento no vigente"}</Typography>
            </Box>
            <StatusChip status={result.status} size="medium" />
          </Box>
          <Alert severity={result.valid ? "success" : "warning"}>{result.notice}</Alert>
          <Divider />
          <Typography><strong>Solvencia:</strong> {result.solvencyNumber}</Typography>
          <Typography><strong>Emitida:</strong> {formatDate(result.issuedAt)}</Typography>
          <Typography><strong>Vence:</strong> {formatDate(result.expiresAt)}</Typography>
          <Typography variant="caption" color="text.secondary">Por protección de datos, esta consulta no publica propietario, identificación ni placa.</Typography>
        </Stack>
      </Paper>}
    </Paper>
  </Container>;
}

export function PublicSolvencyRequestInfoPage() {
  return <Container maxWidth="md" className="public-page">
    <Paper variant="outlined" className="public-form-card">
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography className="overline">Trámite municipal</Typography>
        <Typography variant="h2">Solicitud de solvencia</Typography>
        <Alert severity="info">La solicitud requiere validar la identidad y la titularidad del vehículo. Se registra en el área municipal autorizada; no se reciben solicitudes anónimas desde este portal.</Alert>
        <Typography color="text.secondary">Antes de emitir, el sistema vuelve a comprobar saldo cero, pagos confirmados y ausencia de impugnaciones abiertas. La aprobación nunca es automática.</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button component={Link} to="/verificar-solvencia" variant="contained">Verificar una solvencia</Button>
          <Button component={Link} to="/requisitos" variant="outlined">Consultar requisitos</Button>
        </Stack>
      </Stack>
    </Paper>
  </Container>;
}
