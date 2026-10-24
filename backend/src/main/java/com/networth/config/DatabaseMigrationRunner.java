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
    }
}
