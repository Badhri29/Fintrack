package com.networth.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);

    @Autowired(required = false)
    private JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String mailFrom;

    public boolean isConfigured() {
        return mailSender != null && mailFrom != null && !mailFrom.trim().isEmpty();
    }

    public boolean sendOtpEmail(String toEmail, String otpCode, String purpose) {
        String subject = "FinTrack - Your Verification OTP: " + otpCode;
        String htmlContent = buildOtpHtml(toEmail, otpCode, purpose);

        // If mailSender is available and username is configured, attempt real email
        if (mailSender != null && mailFrom != null && !mailFrom.trim().isEmpty()) {
            try {
                MimeMessage message = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
                helper.setFrom(mailFrom, "FinTrack Intelligence");
                helper.setTo(toEmail);
                helper.setSubject(subject);
                helper.setText(htmlContent, true);

                mailSender.send(message);
                logger.info("Successfully sent OTP email to {}", toEmail);
                return true;
            } catch (Exception e) {
                logger.warn("Could not deliver email to {} via SMTP ({}). Logging OTP to console.", toEmail, e.getMessage());
            }
        }

        // Fallback / Dev logger
        logOtpToConsole("EMAIL", toEmail, otpCode, purpose);
        return true;
    }

    private void logOtpToConsole(String channel, String target, String otp, String purpose) {
        logger.info("\n"
                + "================================================================================\n"
                + ">>> FINTRACK " + channel + " OTP NOTIFICATION <<<\n"
                + "Target : " + target + "\n"
                + "Purpose: " + purpose + "\n"
                + "OTP    : [ " + otp + " ]\n"
                + "Expires: 5 Minutes\n"
                + "================================================================================");
    }

    private String buildOtpHtml(String email, String otpCode, String purpose) {
        return "<!DOCTYPE html>"
                + "<html>"
                + "<head><meta charset='UTF-8'></head>"
                + "<body style='margin:0;padding:24px;background-color:#0B0E14;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#F8FAFC;'>"
                + "  <div style='max-width:480px;margin:0 auto;background:#131824;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;box-shadow:0 12px 30px rgba(0,0,0,0.5);'>"
                + "    <div style='text-align:center;margin-bottom:24px;'>"
                + "      <div style='display:inline-block;width:48px;height:48px;line-height:48px;border-radius:12px;background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#fff;font-size:24px;font-weight:bold;'>₹</div>"
                + "      <h2 style='margin:12px 0 4px;font-size:22px;color:#F8FAFC;'>FinTrack Intelligence</h2>"
                + "      <p style='margin:0;font-size:13px;color:#94A3B8;'>Security & Account Verification</p>"
                + "    </div>"
                + "    <div style='background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;'>"
                + "      <p style='margin:0 0 12px;font-size:14px;color:#CBD5E1;'>Your One-Time Password (OTP) for <strong>" + purpose + "</strong> is:</p>"
                + "      <div style='display:inline-block;letter-spacing:8px;font-size:32px;font-weight:800;color:#6366F1;background:rgba(99,102,241,0.12);padding:12px 24px;border-radius:10px;border:1px dashed #6366F1;'>"
                + otpCode
                + "      </div>"
                + "      <p style='margin:12px 0 0;font-size:12px;color:#EF4444;'>Valid for 5 minutes. Do not share this code with anyone.</p>"
                + "    </div>"
                + "    <p style='font-size:12px;color:#64748B;line-height:1.6;margin:0;text-align:center;'>"
                + "      If you did not request this OTP, please ignore this email.<br/>FinTrack Net Worth Tracker"
                + "    </p>"
                + "  </div>"
                + "</body>"
                + "</html>";
    }
}
