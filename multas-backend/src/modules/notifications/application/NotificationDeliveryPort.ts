export type ExternalNotificationChannel = "EMAIL" | "SMS" | "PUSH";

export type ExternalNotificationMessage = {
  notificationId: string;
  channel: ExternalNotificationChannel;
  deduplicationKey: string;
};

export type NotificationDeliveryPort = {
  deliver(message: ExternalNotificationMessage): Promise<void>;
};

/** Frontera explícita de TANDA 10: ningún proveedor externo está habilitado. */
export class DisabledNotificationDeliveryAdapter implements NotificationDeliveryPort {
  public deliver(message: ExternalNotificationMessage): Promise<void> {
    void message;
    return Promise.reject(new Error("Los canales externos no están habilitados."));
  }
}
