import { PublicRequestForm } from "@/components/tanki/public-request-form";

const STEPS = [
  {
    title: "Ajukan",
    desc: "Masukkan nomor pelanggan, nomor HP, dan keluhan Anda. Tanpa perlu akun.",
  },
  {
    title: "Terima tiket",
    desc: "Nomor tiket dikirim ke email Anda. Simpan untuk melacak permintaan.",
  },
  {
    title: "Air diantar",
    desc: "Petugas memverifikasi, menjadwalkan armada, dan mengantar air ke lokasi.",
  },
];

export default function PublicHome() {
  return (
    <>
      {/* HERO */}
      <section className="tj-hero relative overflow-hidden text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-28 pt-12 sm:px-6 sm:pb-32 lg:grid-cols-2 lg:items-center lg:gap-12 lg:pb-40 lg:pt-20">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#7dd3fc]">
              Layanan Mobil Tangki · Makassar
            </p>
            <h1 className="tj-display text-3xl font-extrabold leading-[1.1] sm:text-4xl lg:text-5xl">
              Air bersih,
              <br className="hidden sm:block" /> diantar saat dibutuhkan.
            </h1>
            <p className="mt-5 max-w-md text-base text-[#e0f2fe]/90 sm:text-lg">
              Ajukan permintaan mobil tangki PDAM Kota Makassar cukup dengan nomor
              pelanggan Anda — lalu pantau antrian dan progres hingga air tiba.
            </p>

            <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <dt className="tj-display text-2xl font-bold text-white">9 digit</dt>
                <dd className="text-sm text-[#bae6fd]/80">cukup nomor pelanggan</dd>
              </div>
              <div>
                <dt className="tj-display text-2xl font-bold text-white">Gratis</dt>
                <dd className="text-sm text-[#bae6fd]/80">tanpa biaya pengajuan</dd>
              </div>
              <div>
                <dt className="tj-display text-2xl font-bold text-white">Real-time</dt>
                <dd className="text-sm text-[#bae6fd]/80">pantau antrian</dd>
              </div>
            </dl>
          </div>

          {/* Form card — co-star of the hero */}
          <div className="rounded-3xl bg-white p-6 text-[#0a2540] shadow-2xl ring-1 ring-black/5 sm:p-8">
            <h2 className="tj-display text-xl font-bold text-[#0a2540] sm:text-2xl">
              Ajukan Permintaan
            </h2>
            <p className="mb-6 mt-1 text-sm text-[#0a2540]/60">
              Isi data di bawah, butuh ±1 menit.
            </p>
            <PublicRequestForm />
          </div>
        </div>

        {/* Wave divider (signature) */}
        <svg
          className="tj-wave pointer-events-none absolute inset-x-0 bottom-0 h-[70px] w-full sm:h-[100px]"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            fill="#38bdf8"
            fillOpacity="0.25"
            d="M-120,70 C180,20 420,110 720,66 C1020,22 1260,104 1560,60 L1560,120 L-120,120 Z"
          />
          <path
            fill="#f0f9ff"
            d="M-120,86 C200,120 460,40 720,78 C980,116 1240,44 1560,82 L1560,120 L-120,120 Z"
          />
        </svg>
      </section>

      {/* HOW IT WORKS — a real 3-step sequence */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="tj-display text-center text-2xl font-bold text-[#0a2540] sm:text-3xl">
          Bagaimana caranya
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="relative rounded-2xl border border-[#e0f2fe] bg-white p-6 shadow-sm"
            >
              <span className="tj-display flex h-10 w-10 items-center justify-center rounded-full bg-[#0284c7] text-base font-bold text-white">
                {i + 1}
              </span>
              <h3 className="tj-display mt-4 text-lg font-bold text-[#0a2540]">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#0a2540]/65">
                {s.desc}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
