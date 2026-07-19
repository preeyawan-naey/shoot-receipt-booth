-- MySQL schema for SHOOT Receipt BOOTH tickets
-- Run: mysql -u user -p database_name < schema.mysql.sql

CREATE TABLE IF NOT EXISTS receipt_tickets (
  ticket_code CHAR(6) NOT NULL,
  status ENUM('unused', 'used') NOT NULL DEFAULT 'unused',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP NULL DEFAULT NULL,
  chosen_frame VARCHAR(64) NULL,
  print_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (ticket_code),
  CONSTRAINT ticket_code_format CHECK (ticket_code REGEXP '^[0-9]{6}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_receipt_tickets_status ON receipt_tickets (status);
