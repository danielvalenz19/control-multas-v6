import { Box, Container, Paper, Stack, Typography } from "@mui/material";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";

export function InformationPage({ type }: { type: "requirements" | "help" | "faq" }) {
  const content = {
    requirements: {
      title: "Requisitos y trámites",
      intro: "Información confirmada para utilizar las funciones actualmente disponibles.",
      items: [
        ["Consulta de multa", "Número completo de boleta y placa del vehículo."],
        ["Orden de pago", "Primero realiza una consulta válida; la orden no es recibo ni acredita pago."],
        ["Pagos y solvencias", "Puedes pagar con checkout alojado, generar un enlace Visa o acudir a receptoría; la solvencia solo se emite tras confirmar el pago."],
      ],
    },
    help: {
      title: "Ayuda ciudadana",
      intro: "Orientación sobre consulta y orden de pago.",
      items: [
        ["Consulta no encontrada", "Verifica que la boleta completa y la placa coincidan exactamente."],
        ["Orden expirada", "Regresa al resultado de consulta para solicitar una orden vigente."],
        ["Atención municipal", "Consulta los canales y horarios publicados oficialmente por la municipalidad."],
      ],
    },
    faq: {
      title: "Preguntas frecuentes",
      intro: "Respuestas sobre los servicios habilitados en esta fase.",
      items: [
        ["¿Puedo consultar solo con la placa?", "No. Se exige boleta y placa para reducir la enumeración de datos."],
        ["¿La orden confirma un pago?", "No. Es una instrucción temporal y siempre está rotulada como no recibo."],
        ["¿Puedo pagar en línea?", "Sí, si la municipalidad tiene habilitado el proveedor. La tarjeta se captura en una página alojada y el sistema espera una confirmación firmada."],
      ],
    },
  }[type];
  return <Container maxWidth="md" className="public-page"><Box className="section-heading centered"><Typography className="overline">Información municipal</Typography><Typography variant="h2">{content.title}</Typography><Typography color="text.secondary">{content.intro}</Typography></Box><Stack spacing={1.5}>{content.items.map(([title, description], index) => <Paper variant="outlined" className="information-row" key={title}><Box>{type === "requirements" ? <FactCheckRoundedIcon /> : type === "help" ? <PaymentsOutlinedIcon /> : <HelpOutlineRoundedIcon />}</Box><Box><Typography variant="h6">{index + 1}. {title}</Typography><Typography color="text.secondary">{description}</Typography></Box></Paper>)}</Stack></Container>;
}
