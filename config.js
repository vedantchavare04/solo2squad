export const CHAT_HTTP = "https://solo2squad-chat.vedantchavare04.workers.dev";
export const CHAT_WS = CHAT_HTTP.replace(/^http/, "ws");
export const CHAT_CONFIGURED = !CHAT_HTTP.includes("YOUR-SUBDOMAIN");
