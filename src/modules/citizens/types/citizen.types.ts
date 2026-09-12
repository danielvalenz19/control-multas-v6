export type CitizenStatus = "ACTIVE" | "INACTIVE";
export type Citizen = {
  id: string;
  identificationType: string;
  identificationNumber: string;
  nit?: string | null;
  firstNames: string;
  lastNames: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status: CitizenStatus;
  createdAt: string;
  updatedAt: string;
};
export type CitizenInput = Pick<Citizen, "identificationType" | "identificationNumber" | "firstNames" | "lastNames"> & Partial<Pick<Citizen, "nit" | "address" | "phone" | "email">>;
export type PageMeta = { page: number; pageSize: number; total: number; requestId: string };
