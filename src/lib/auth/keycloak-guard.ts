/**
 * Gerbang konfigurasi Keycloak (Issue #2, butir 6 tindak lanjut review).
 *
 * Realm DIAMOND produksi masih memuat client `tanki-jene` sebagai **public
 * client tanpa PKCE wajib**. Konsekuensinya nyata: tanpa client secret, siapa
 * pun yang bisa memancing pengguna ke redirect URI yang terdaftar dapat
 * menukar authorization code menjadi token atas nama aplikasi ini.
 *
 * Perbaikannya ada di sisi Keycloak dan hanya bisa dilakukan admin PDAM
 * (`node db/keycloak_perbaiki_client.mjs`). Yang bisa dijamin dari sisi kode
 * adalah ini: aplikasi TIDAK BOLEH diam-diam berjalan dengan konfigurasi itu
 * di produksi. Ketiadaan `AUTH_KEYCLOAK_SECRET` adalah tanda paling langsung
 * bahwa client-nya public — client confidential selalu punya secret.
 *
 * Sikapnya sengaja berbeda per lingkungan:
 *   - produksi     → gagal terang-terangan. Login mati, penyebabnya tercetak.
 *   - non-produksi → jalan, dengan peringatan. Pengembangan lokal terhadap
 *                    Keycloak sekali pakai tidak perlu dihentikan.
 *
 * Murni: keputusannya diuji tanpa menyalakan NextAuth.
 */

export type KeycloakEnv = {
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  isProduction: boolean;
};

export type HasilGerbang =
  | { boleh: true; peringatan?: string }
  | { boleh: false; alasan: string };

export const PESAN_TANPA_SECRET =
  "AUTH_KEYCLOAK_SECRET kosong. Client 'tanki-jene' kemungkinan besar masih " +
  "PUBLIC di realm Keycloak — client confidential selalu punya secret. " +
  "Login operator dinonaktifkan sampai ini dibereskan; jalankan " +
  "`node db/keycloak_perbaiki_client.mjs` sebagai admin realm, lalu isi " +
  "AUTH_KEYCLOAK_SECRET dengan secret yang dicetaknya. Lihat Issue #2.";

export function evaluasiKeycloak(env: KeycloakEnv): HasilGerbang {
  const adaIssuer = Boolean(env.issuer?.trim());
  const adaClientId = Boolean(env.clientId?.trim());
  const adaSecret = Boolean(env.clientSecret?.trim());

  // Keycloak belum dipasang sama sekali (mis. uji lokal portal publik saja).
  // Itu bukan konfigurasi yang tidak aman — itu ketiadaan konfigurasi.
  if (!adaIssuer && !adaClientId) {
    return env.isProduction
      ? { boleh: false, alasan: "Keycloak belum dikonfigurasi (AUTH_KEYCLOAK_ISSUER kosong)." }
      : { boleh: true, peringatan: "Keycloak belum dikonfigurasi — login operator tidak aktif." };
  }

  if (!adaSecret) {
    return env.isProduction
      ? { boleh: false, alasan: PESAN_TANPA_SECRET }
      : { boleh: true, peringatan: PESAN_TANPA_SECRET };
  }

  return { boleh: true };
}
