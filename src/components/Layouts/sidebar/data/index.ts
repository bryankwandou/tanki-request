import * as Icons from "../icons";

export const NAV_DATA = [
  {
    label: "MENU UTAMA",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: Icons.HomeIcon,
        items: [],
      },
      {
        title: "Permintaan",
        url: "/dashboard/permintaan",
        icon: Icons.Table,
        items: [],
      },
      {
        title: "Dispatch / Armada",
        icon: Icons.FourCircle,
        items: [
          {
            title: "Kendaraan",
            url: "/dashboard/dispatch/kendaraan",
          },
          {
            title: "Sopir",
            url: "/dashboard/dispatch/sopir",
          },
          {
            title: "Penugasan",
            url: "/dashboard/dispatch/penugasan",
          },
        ],
      },
      {
        title: "Laporan",
        url: "/dashboard/laporan",
        icon: Icons.PieChart,
        items: [],
      },
      {
        title: "Pencarian Pelanggan",
        url: "/dashboard/pelanggan",
        icon: Icons.User,
        items: [],
      },
    ],
  },
  {
    label: "ADMIN",
    items: [
      {
        title: "Konfigurasi",
        url: "/dashboard/konfigurasi",
        icon: Icons.Alphabet,
        items: [],
      },
    ],
  },
];
