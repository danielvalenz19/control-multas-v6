export type VehicleStatus = "ACTIVE" | "INACTIVE";
export type Vehicle = { id: string; plate: string; registrationCard: string; vehicleType: string; brand: string; line: string; modelYear: number | null; color: string; vinChassis: string | null; engineNumber: string | null; status: VehicleStatus; currentOwner: { id: string; firstNames: string; lastNames: string } | null; createdAt: string; updatedAt: string };
export type VehicleInput = Pick<Vehicle, "plate" | "registrationCard" | "vehicleType" | "brand" | "line" | "color"> & Partial<Pick<Vehicle, "modelYear" | "vinChassis" | "engineNumber">>;
export type Ownership = { id: string; vehicleId: string; citizenId: string; citizenName: string; startedAt: string; endedAt: string | null; isCurrent: boolean; source: string; createdAt: string };
