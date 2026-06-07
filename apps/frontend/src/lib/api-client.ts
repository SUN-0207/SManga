import axios from 'axios';

// `/api/*` is proxied to the NestJS api container by Caddy in prod (see
// deploy/home/Caddyfile) and by Vite's dev proxy locally. Override with
// VITE_API_BASE_URL when previewing the FE against a different API host.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
