package com.networth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;
import java.util.Hashtable;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class ValidationService {

    private static final Logger logger = LoggerFactory.getLogger(ValidationService.class);

    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,10}$"
    );

    // List of common disposable / fake email domains to reject
    private static final Set<String> DISPOSABLE_DOMAINS = Set.of(
            "tempmail.com", "10minutemail.com", "guerrillamail.com", "mailinator.com",
            "throwawaymail.com", "trashmail.com", "temp-mail.org", "yopmail.com",
            "sharklasers.com", "getairmail.com", "dispostable.com", "fake.com",
            "fakemail.net", "dummy.com", "test.com", "example.com", "burnermail.io",
            "mytemp.email", "nada.ltd", "mohmal.com", "crazymailing.com"
    );

    // Whitelist of trusted high-traffic email providers for instant validation
    private static final Set<String> TRUSTED_DOMAINS = Set.of(
            "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
            "yahoo.com", "yahoo.co.in", "icloud.com", "proton.me", "protonmail.com",
            "zoho.com", "zoho.in", "aol.com", "mail.com", "gmx.com", "fintrack.io"
    );

    public void validateEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            throw new IllegalArgumentException("Email address is required.");
        }

        String cleanedEmail = email.trim().toLowerCase();

        if (!EMAIL_PATTERN.matcher(cleanedEmail).matches()) {
            throw new IllegalArgumentException("Invalid email format. Please enter a valid email address.");
        }

        String[] parts = cleanedEmail.split("@");
        if (parts.length != 2) {
            throw new IllegalArgumentException("Invalid email format.");
        }

        String username = parts[0];
        String domain = parts[1];

        // Reject fake username tests
        if (username.equals("test") || username.equals("fake") || username.equals("admin") || username.equals("asdf")) {
            if (!TRUSTED_DOMAINS.contains(domain)) {
                throw new IllegalArgumentException("Please use a genuine, personal or corporate email address.");
            }
        }

        // Reject known disposable domains
        if (DISPOSABLE_DOMAINS.contains(domain)) {
            throw new IllegalArgumentException("Temporary or disposable email domains are not allowed. Please use a valid email (e.g. Gmail, Outlook, Yahoo).");
        }

        // If trusted domain, fast pass
        if (TRUSTED_DOMAINS.contains(domain)) {
            return;
        }

        // Verify domain has valid DNS MX (mail exchange) records
        if (!hasMxRecord(domain)) {
            throw new IllegalArgumentException("Email domain '" + domain + "' does not appear to have valid mail servers. Please use a valid email.");
        }
    }

    public String sanitizePhone(String phone) {
        if (phone == null || phone.trim().isEmpty()) {
            throw new IllegalArgumentException("Phone number is required.");
        }

        // Strip spaces, dashes, parentheses
        String cleaned = phone.trim().replaceAll("[\\s\\-\\(\\)]", "");

        // Remove leading +91 or 91 if present for 10-digit Indian numbers
        if (cleaned.startsWith("+91") && cleaned.length() == 13) {
            cleaned = cleaned.substring(3);
        } else if (cleaned.startsWith("91") && cleaned.length() == 12) {
            cleaned = cleaned.substring(2);
        } else if (cleaned.startsWith("+")) {
            cleaned = cleaned.substring(1);
        }

        // Check if 10-digit mobile number
        if (!cleaned.matches("^[6-9][0-9]{9}$") && !cleaned.matches("^[1-9][0-9]{9,13}$")) {
            throw new IllegalArgumentException("Please enter a valid 10-digit mobile phone number.");
        }

        // Check repeated bogus numbers like 0000000000, 9999999999, 1234567890
        if (isDummyPhone(cleaned)) {
            throw new IllegalArgumentException("Please enter a real, valid phone number.");
        }

        return cleaned;
    }

    private boolean isDummyPhone(String phone) {
        if (phone.equals("1234567890") || phone.equals("9876543210") || phone.equals("0123456789")) {
            return true;
        }
        char first = phone.charAt(0);
        boolean allSame = true;
        for (int i = 1; i < phone.length(); i++) {
            if (phone.charAt(i) != first) {
                allSame = false;
                break;
            }
        }
        return allSame;
    }

    private boolean hasMxRecord(String domain) {
        try {
            Hashtable<String, String> env = new Hashtable<>();
            env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
            env.put("com.sun.jndi.dns.timeout.initial", "2000"); // 2s timeout
            env.put("com.sun.jndi.dns.timeout.retries", "1");
            DirContext ictx = new InitialDirContext(env);
            Attributes attrs = ictx.getAttributes(domain, new String[]{"MX"});
            Attribute attr = attrs.get("MX");
            if (attr != null && attr.size() > 0) {
                return true;
            }
            // Check A record as fallback (some mail servers accept direct A record)
            Attributes aAttrs = ictx.getAttributes(domain, new String[]{"A"});
            Attribute aAttr = aAttrs.get("A");
            return aAttr != null && aAttr.size() > 0;
        } catch (NamingException e) {
            logger.warn("DNS MX lookup failed for domain '{}': {}", domain, e.getMessage());
            // If domain doesn't exist in DNS, reject
            if (e.getMessage() != null && (e.getMessage().contains("DNS name not found") || e.getMessage().contains("NXDOMAIN"))) {
                return false;
            }
            // If network/timeout issue, permit if it has standard structure with valid TLD
            return domain.contains(".") && domain.substring(domain.lastIndexOf('.') + 1).length() >= 2;
        } catch (Exception e) {
            logger.warn("DNS check error: {}", e.getMessage());
            return true;
        }
    }
}
