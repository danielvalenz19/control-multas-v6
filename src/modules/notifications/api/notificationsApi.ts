import { httpRequest } from "@/src/services/httpClient";

export type NotificationItem={id:number;event_code:string;title:string;body:string;severity:"INFO"|"SUCCESS"|"WARNING"|"CRITICAL";secure_path:string|null;read_at:string|null;created_at:string};
export type Preference={event_code:string;title_template:string;internal_enabled:number;email_enabled:number;sms_enabled:number;push_enabled:number};
export const notificationsApi={
  list:(status="all")=>httpRequest<{data:NotificationItem[];meta:{total:number}}>(`/notifications?status=${status}&pageSize=100`),
  unreadCount:()=>httpRequest<{data:{count:number}}>(`/notifications/unread-count`),
  read:(id:number)=>httpRequest<void>(`/notifications/${id}/read`,{method:"PATCH"}),
  readAll:()=>httpRequest<{data:{updated:number}}>(`/notifications/read-all`,{method:"POST"}),
  preferences:()=>httpRequest<{data:Preference[];meta:{externalChannelsEnabled:boolean}}>(`/notifications/preferences`),
  savePreferences:(preferences:{eventCode:string;internalEnabled:boolean}[])=>httpRequest<void>(`/notifications/preferences`,{method:"PUT",body:{preferences}}),
};
