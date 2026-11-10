package com.networth.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DatabaseMigrationRunner implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseMigrationRunner.class);
    private final JdbcTemplate jdbcTemplate;

    public DatabaseMigrationRunner(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(String... args) {
        try {
            jdbcTemplate.execute("ALTER TABLE access_requests ADD COLUMN actionToken VARCHAR(100) NULL");
            logger.info("DatabaseMigrationRunner: Added actionToken column to access_requests table");
        } catch (Exception e) {
            logger.debug("DatabaseMigrationRunner: actionToken column check: {}", e.getMessage());
        }

        try {
            jdbcTemplate.execute("ALTER TABLE users MODIFY COLUMN photo LONGTEXT NULL");
            logger.info("DatabaseMigrationRunner: Modified photo column in users table to LONGTEXT");
        } catch (Exception e) {
            logger.debug("DatabaseMigrationRunner: photo column check: {}", e.getMessage());
        }

        // 1. Bank Accounts table
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS bank_accounts (
                    id VARCHAR(100) NOT NULL PRIMARY KEY,
                    userId BIGINT NOT NULL,
                    bankName VARCHAR(255) NOT NULL,
                    accountType VARCHAR(50) NOT NULL,
                    accountNumberLast4 VARCHAR(20) NOT NULL,
                    holderName VARCHAR(255),
                    ifscCode VARCHAR(50),
                    branch VARCHAR(255),
                    balance DOUBLE DEFAULT 0.0,
                    isPrimary BOOLEAN DEFAULT FALSE,
                    debitCardsJson LONGTEXT,
                    creditCardsJson LONGTEXT,
                    createdAt DATETIME NULL,
                    updatedAt DATETIME NULL,
                    INDEX idx_bank_accounts_user (userId)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);
            logger.info("DatabaseMigrationRunner: Initialized bank_accounts table");
        } catch (Exception e) {
            logger.warn("DatabaseMigrationRunner: Error creating bank_accounts table: {}", e.getMessage());
        }

        // 2. Cash Wallets table
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cash_wallets (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    userId BIGINT NOT NULL UNIQUE,
                    balance DOUBLE DEFAULT 0.0,
                    notes TEXT,
                    lastUpdated DATETIME NULL,
                    INDEX idx_cash_wallets_user (userId)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);
            logger.info("DatabaseMigrationRunner: Initialized cash_wallets table");
        } catch (Exception e) {
            logger.warn("DatabaseMigrationRunner: Error creating cash_wallets table: {}", e.getMessage());
        }

        // 3. Credit Cards table
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS credit_cards (
                    id VARCHAR(100) NOT NULL PRIMARY KEY,
                    userId BIGINT NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    bank VARCHAR(255) NOT NULL,
                    network VARCHAR(50) NOT NULL,
                    cardNumber VARCHAR(255),
                    last4 VARCHAR(10) NOT NULL,
                    expiryMonth INT,
                    expiryYear INT,
                    cvv VARCHAR(10),
                    cardLimit DOUBLE NOT NULL DEFAULT 0.0,
                    billingDay INT NOT NULL DEFAULT 1,
                    dueDay INT NOT NULL DEFAULT 1,
                    gradient VARCHAR(255),
                    accent VARCHAR(50),
                    isActive BOOLEAN DEFAULT TRUE,
                    isAddon BOOLEAN DEFAULT FALSE,
                    primaryCardId VARCHAR(100),
                    holderName VARCHAR(255),
                    createdAt DATETIME NULL,
                    updatedAt DATETIME NULL,
                    INDEX idx_credit_cards_user (userId)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);
            logger.info("DatabaseMigrationRunner: Initialized credit_cards table");
        } catch (Exception e) {
            logger.warn("DatabaseMigrationRunner: Error creating credit_cards table: {}", e.getMessage());
        }

        // 4. Credit Card Transactions table
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS credit_card_transactions (
                    id VARCHAR(100) NOT NULL PRIMARY KEY,
                    cardId VARCHAR(100) NOT NULL,
                    userId BIGINT NOT NULL,
                    date VARCHAR(50) NOT NULL,
                    description VARCHAR(255) NOT NULL,
                    amount DOUBLE NOT NULL,
                    category VARCHAR(100),
                    type VARCHAR(50) DEFAULT 'DEBIT',
                    createdAt DATETIME NULL,
                    INDEX idx_cc_txs_card (cardId),
                    INDEX idx_cc_txs_user (userId)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);
            logger.info("DatabaseMigrationRunner: Initialized credit_card_transactions table");
        } catch (Exception e) {
            logger.warn("DatabaseMigrationRunner: Error creating credit_card_transactions table: {}", e.getMessage());
        }

        // 5. Loans table
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS loans (
                    id VARCHAR(100) NOT NULL PRIMARY KEY,
                    userId BIGINT NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    loanNumber VARCHAR(100),
                    lender VARCHAR(255) NOT NULL,
                    principal DOUBLE NOT NULL,
                    emiAmount DOUBLE NOT NULL,
                    remainingAmount DOUBLE NOT NULL,
                    startDate VARCHAR(50) NOT NULL,
                    endDate VARCHAR(50) NOT NULL,
                    includeInNetWorth BOOLEAN DEFAULT TRUE,
                    type VARCHAR(100),
                    interestRate DOUBLE DEFAULT 0.0,
                    tenureMonths INT DEFAULT 12,
                    paidMonths INT DEFAULT 0,
                    paidScheduleIndicesJson TEXT,
                    dueDay INT DEFAULT 5,
                    description TEXT,
                    status VARCHAR(50) DEFAULT 'active',
                    repaymentSource VARCHAR(50) DEFAULT 'bank',
                    linkedCardId VARCHAR(100),
                    linkedCardName VARCHAR(255),
                    isForSomeoneElse BOOLEAN DEFAULT FALSE,
                    borrowerName VARCHAR(255),
                    borrowerPhone VARCHAR(50),
                    borrowerNotes TEXT,
                    receivedScheduleIndicesJson TEXT,
                    createdAt DATETIME NULL,
                    updatedAt DATETIME NULL,
                    INDEX idx_loans_user (userId)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);
            logger.info("DatabaseMigrationRunner: Initialized loans table");
        } catch (Exception e) {
            logger.warn("DatabaseMigrationRunner: Error creating loans table: {}", e.getMessage());
        }

        // Add third-party loan migration columns if they do not exist
        try {
            jdbcTemplate.execute("ALTER TABLE loans ADD COLUMN isForSomeoneElse BOOLEAN DEFAULT FALSE");
        } catch (Exception ignored) {}
        try {
            jdbcTemplate.execute("ALTER TABLE loans ADD COLUMN borrowerName VARCHAR(255) NULL");
        } catch (Exception ignored) {}
        try {
            jdbcTemplate.execute("ALTER TABLE loans ADD COLUMN borrowerPhone VARCHAR(50) NULL");
        } catch (Exception ignored) {}
        try {
            jdbcTemplate.execute("ALTER TABLE loans ADD COLUMN borrowerNotes TEXT NULL");
        } catch (Exception ignored) {}
        try {
            jdbcTemplate.execute("ALTER TABLE loans ADD COLUMN receivedScheduleIndicesJson TEXT NULL");
        } catch (Exception ignored) {}

        // 6. Budgets table
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS budgets (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    userId BIGINT NOT NULL,
                    year INT NOT NULL,
                    categoryKey VARCHAR(255) NOT NULL,
                    monthlyAmountsJson TEXT NOT NULL,
                    createdAt DATETIME NULL,
                    updatedAt DATETIME NULL,
                    UNIQUE KEY uk_user_year_cat (userId, year, categoryKey)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);
            logger.info("DatabaseMigrationRunner: Initialized budgets table");
        } catch (Exception e) {
            logger.warn("DatabaseMigrationRunner: Error creating budgets table: {}", e.getMessage());
        }

        // 7. User Preferences table
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    userId BIGINT NOT NULL UNIQUE,
                    currency VARCHAR(20) DEFAULT 'INR',
                    currencyFormat VARCHAR(50) DEFAULT 'indian',
                    theme VARCHAR(50) DEFAULT 'dark',
                    defaultType VARCHAR(50) DEFAULT 'expense',
                    defaultPaymentMode VARCHAR(50) DEFAULT 'upi',
                    defaultCategory VARCHAR(100) DEFAULT 'Food & Groceries',
                    defaultCard VARCHAR(100) DEFAULT '',
                    defaultNote VARCHAR(255) DEFAULT '',
                    autoFocusAmount BOOLEAN DEFAULT TRUE,
                    soundEffects BOOLEAN DEFAULT TRUE,
                    soundTone VARCHAR(50) DEFAULT 'chime',
                    soundVolume INT DEFAULT 80,
                    createdAt DATETIME NULL,
                    updatedAt DATETIME NULL,
                    INDEX idx_user_preferences_user (userId)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);
            logger.info("DatabaseMigrationRunner: Initialized user_preferences table");
        } catch (Exception e) {
            logger.warn("DatabaseMigrationRunner: Error creating user_preferences table: {}", e.getMessage());
        }

        // 8. Ensure EOD mail is turned OFF for all existing users by default
        try {
            jdbcTemplate.execute("UPDATE user_notification_settings SET eodMail = FALSE WHERE eodMail IS TRUE");
            logger.info("DatabaseMigrationRunner: Turned off eodMail by default for all existing users");
        } catch (Exception e) {
            logger.debug("DatabaseMigrationRunner: eodMail migration check: {}", e.getMessage());
        }

        // 9. Seed default system notification settings if missing
        try {
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('NOTIF_DEFAULT_EOD_MAIL', 'false', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_CURRENCY', 'INR', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_CURRENCY_FORMAT', 'indian', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_THEME', 'dark', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_TX_TYPE', 'expense', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_PAYMENT_MODE', 'upi', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_CATEGORY', 'Food & Groceries', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_AUTOFOCUS', 'true', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_SOUND_EFFECTS', 'true', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_SOUND_TONE', 'chime', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULT_SOUND_VOLUME', '80', NOW())");
            jdbcTemplate.execute("INSERT IGNORE INTO system_settings (settingKey, settingValue, updatedAt) VALUES ('SYSTEM_DEFAULTS_VERSION', '1', NOW())");
        } catch (Exception e) {
            logger.debug("DatabaseMigrationRunner: System settings seeding check: {}", e.getMessage());
        }
    }
}
