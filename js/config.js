/**
 * API base URL — สลับอัตโนมัติตาม hostname
 * - localhost / 127.0.0.1 → backend บนเครื่อง dev
 * - อื่น ๆ (tablet, URL ออนไลน์) → Render production
 */
const PRODUCTION_API_URL = "https://shoot-receipt-backend.onrender.com";

const hostname = window.location.hostname;
const isLocalDev = hostname === "localhost" || hostname === "127.0.0.1";

const API_URL = isLocalDev ? "http://localhost:3000" : PRODUCTION_API_URL;
