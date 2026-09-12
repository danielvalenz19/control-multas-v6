import { useContext } from "react";
import { AuthContext } from "../context/AuthProvider";

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
}
