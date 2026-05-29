import axios from 'axios';

// On Vercel we proxy `/api/*` to the Railway API via vercel.json rewrites,
// keeping cookies first-party. For local dev Vite proxies the same path.
// Override with VITE_API_BASE_URL when running against a different host
// (e.g. previewing FE against a staging API or self-hosted backend).
const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
