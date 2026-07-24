CREATE TABLE IF NOT EXISTS pelanggan (
  nosamb    CHAR(9)      NOT NULL,
  nama      VARCHAR(150) NOT NULL,
  alamat    VARCHAR(255) NULL,
  koderayon VARCHAR(7)   NULL,
  wil       CHAR(2)      NULL,
  PRIMARY KEY (nosamb),
  KEY idx_pelanggan_nama (nama),
  KEY idx_pelanggan_koderayon (koderayon),
  KEY idx_pelanggan_wil (wil)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
