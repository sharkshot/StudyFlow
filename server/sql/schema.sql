-- StudyFlow MySQL Schema
-- Run: mysql -u root -p < sql/schema.sql

CREATE DATABASE IF NOT EXISTS studyflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE studyflow;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(16) NOT NULL,
  duration INT NOT NULL,
  subject VARCHAR(255),
  completed_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted TINYINT DEFAULT 0,
  INDEX idx_sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS communities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  created_by INT NOT NULL,
  invite_code VARCHAR(16) UNIQUE NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_members (
  community_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  joined_at DATETIME NOT NULL,
  PRIMARY KEY (community_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  community_id INT NOT NULL,
  proposer_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_minutes INT,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proposal_votes (
  proposal_id INT NOT NULL,
  user_id INT NOT NULL,
  vote TINYINT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (proposal_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS qr_login_tokens (
  token VARCHAR(64) PRIMARY KEY,
  user_id INT,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
