"use client";

import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Props = { data: { label: string; total: number }[] };

export function LaporanStatusChart({ data }: Props) {
  const options: ApexOptions = {
    chart: { type: "bar", fontFamily: "inherit", toolbar: { show: false } },
    colors: ["#5750F1"],
    plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: "60%" } },
    dataLabels: { enabled: true },
    xaxis: {
      categories: data.map((d) => d.label),
      // Jumlah tiket selalu bilangan bulat — tanpa ini sumbu bisa menampilkan
      // 0.5 saat totalnya kecil.
      labels: { formatter: (v) => String(Math.round(Number(v))) },
    },
    grid: { strokeDashArray: 4 },
    legend: { show: false },
    tooltip: { y: { formatter: (v) => `${v} permintaan` } },
  };

  return (
    <Chart
      options={options}
      series={[{ name: "Permintaan", data: data.map((d) => d.total) }]}
      type="bar"
      height={320}
    />
  );
}
