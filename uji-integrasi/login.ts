/**
 * Klien login Keycloak untuk uji lapis 3.
 *
 * Menempuh alur yang sama persis dengan browser: /api/auth/signin/keycloak →
 * authorize Keycloak (PKCE) → form login → callback → cookie sesi. Tidak ada
 * jalan pintas: tidak ada token yang ditempel manual, tidak ada sesi yang
 * dipalsukan. Yang diuji justru round-trip-nya.
 */

/**
 * Basis URL aplikasi yang diuji. Default tetap server dev di :3000, tapi bisa
 * diarahkan ke container Docker (`APP_BASE_URL=http://localhost:3100`) supaya
 * uji lapis 3 yang sama bisa dijalankan terhadap build produksi.
 */
const APP = process.env.APP_BASE_URL ?? "http://localhost:3000";

/** Cookie jar sederhana: nama → nilai. */
export class Jar {
  private jar = new Map<string, string>();

  simpan(res: Response) {
    // getSetCookie() memisahkan banyak Set-Cookie dengan benar; split(",") tidak
    // bisa dipakai karena tanggal Expires ikut memuat koma.
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      const nama = pair.slice(0, idx).trim();
      const nilai = pair.slice(idx + 1).trim();
      if (nilai === "" ) this.jar.delete(nama);
      else this.jar.set(nama, nilai);
    }
  }

  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  nama(): string[] {
    return [...this.jar.keys()];
  }

  punyaSesi(): boolean {
    return this.nama().some((n) => n.includes("session-token"));
  }

  hapusSemua() {
    this.jar.clear();
  }
}

async function ambil(jar: Jar, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.headers ?? {}),
      cookie: jar.header(),
    },
  });
  jar.simpan(res);
  return res;
}

/** Ikuti rantai redirect sampai habis, sambil merawat cookie. */
async function ikuti(jar: Jar, mulai: Response, batas = 12): Promise<Response> {
  let res = mulai;
  for (let i = 0; i < batas; i++) {
    if (res.status < 300 || res.status >= 400) return res;
    const lokasi = res.headers.get("location");
    if (!lokasi) return res;
    const tujuan = new URL(lokasi, res.url || APP).toString();
    res = await ambil(jar, tujuan);
  }
  return res;
}

export type HasilLogin = {
  jar: Jar;
  /** URL authorize yang dipakai — untuk memeriksa PKCE & response_type. */
  authorizeUrl: string;
  /** URL callback yang dipakai — untuk memeriksa authorization code. */
  callbackUrl: string;
  berhasil: boolean;
};

export async function login(username: string, password: string): Promise<HasilLogin> {
  const jar = new Jar();

  // 1. CSRF token — Auth.js mewajibkannya untuk memulai sign-in.
  const csrfRes = await ambil(jar, `${APP}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  // 2. Mulai sign-in provider keycloak → 302 ke endpoint authorize Keycloak.
  const mulai = await ambil(jar, `${APP}/api/auth/signin/keycloak`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${APP}/dashboard` }).toString(),
  });
  const authorizeUrl = mulai.headers.get("location") ?? "";

  // 3. Buka halaman login Keycloak dan ambil action form-nya.
  const halaman = await ikuti(jar, mulai);
  const html = await halaman.text();
  const m = html.match(/action="([^"]+)"/);
  if (!m) return { jar, authorizeUrl, callbackUrl: "", berhasil: false };
  const action = m[1].replace(/&amp;/g, "&");

  // 4. Kirim kredensial → Keycloak balas 302 ke callback aplikasi + kode.
  const kirim = await ambil(jar, action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password, credentialId: "" }).toString(),
  });
  const callbackUrl = kirim.headers.get("location") ?? "";

  // 5. Ikuti callback → Auth.js menukar kode jadi token dan memasang cookie sesi.
  await ikuti(jar, kirim);

  return { jar, authorizeUrl, callbackUrl, berhasil: jar.punyaSesi() };
}

/** GET dengan cookie sesi, mengikuti redirect. */
export async function bukaSebagai(jar: Jar, path: string): Promise<Response> {
  const res = await ambil(jar, `${APP}${path}`);
  return ikuti(jar, res);
}

/** GET tanpa mengikuti redirect — untuk memeriksa status mentah. */
export async function bukaMentah(jar: Jar, path: string): Promise<Response> {
  return ambil(jar, `${APP}${path}`);
}

export async function sesi(jar: Jar): Promise<Record<string, unknown> | null> {
  const res = await ambil(jar, `${APP}/api/auth/session`);
  const teks = await res.text();
  if (!teks.trim()) return null;
  try {
    const j = JSON.parse(teks);
    return Object.keys(j).length ? j : null;
  } catch {
    return null;
  }
}

export { APP };
