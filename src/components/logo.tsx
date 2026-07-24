import Image from "next/image";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/images/logo/pdam-makassar.png"
        width={40}
        height={40}
        alt="PDAM Kota Makassar"
        className="h-9 w-9 shrink-0 object-contain"
        quality={100}
      />
      <span className="text-lg font-bold tracking-tight text-dark dark:text-white">
        Tanki Je&apos;ne&apos;
      </span>
    </div>
  );
}
