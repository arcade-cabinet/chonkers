/**
 * Resolve an absolute asset path (e.g. "/assets/hdri/background.exr")
 * against Vite's BASE_URL so the same path works in dev (`/`),
 * production GH Pages (`/chonkers/`), and Capacitor native (`/`).
 *
 * three.js loaders bypass Vite's import system, so they need
 * BASE_URL applied manually when given a path from the ASSETS
 * manifest.
 */
export function assetUrl(path: string): string {
	const base = import.meta.env.BASE_URL.replace(/\/$/, "");
	const normalised = path.startsWith("/") ? path : `/${path}`;
	return `${base}${normalised}`;
}
