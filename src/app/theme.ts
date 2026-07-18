import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#5A6A3D", dark: "#35452B", light: "#A3B18A", contrastText: "#FFFFFF" },
    secondary: { main: "#D5A739" },
    background: { default: "#F5F7F3", paper: "#FFFFFF" },
    text: { primary: "#283126", secondary: "#667064" },
    divider: "#DDE3D8",
    success: { main: "#3F7654" },
    warning: { main: "#A76A17" },
    error: { main: "#A9463D" },
    info: { main: "#386F8E" },
  },
  typography: {
    fontFamily: "var(--font-geist-sans), Inter, Arial, sans-serif",
    h1: { fontWeight: 750, letterSpacing: "-0.04em" },
    h2: { fontWeight: 720, letterSpacing: "-0.025em" },
    h3: { fontWeight: 700, letterSpacing: "-0.015em" },
    button: { textTransform: "none", fontWeight: 700 },
  },
  shape: { borderRadius: 18 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 44, borderRadius: 999, paddingInline: 20 } } },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 999 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none", borderRadius: 22 } } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiOutlinedInput: { styleOverrides: { root: { minHeight: 46, borderRadius: 15, background: "#FFFFFF" } } },
    MuiTableCell: { styleOverrides: { root: { borderColor: "#E7EBE4" }, head: { color: "#667064", background: "#F8F9F7", fontSize: 12, fontWeight: 750 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 700 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 16 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 24 } } },
  },
});
