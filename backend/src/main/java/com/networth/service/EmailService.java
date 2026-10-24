package com.networth.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

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

    private boolean sendHtmlEmail(String toEmail, String subject, String htmlContent) {
        if (isConfigured()) {
            try {
                MimeMessage message = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
                helper.setFrom(mailFrom, "FinTrack Intelligence");
                helper.setTo(toEmail);
                helper.setSubject(subject);
                helper.setText(htmlContent, true);

                mailSender.send(message);
                logger.info("Successfully delivered email to {}", toEmail);
                return true;
            } catch (Exception e) {
                logger.warn("Could not deliver email to {} via SMTP ({}).", toEmail, e.getMessage());
            }
        }
        logger.info("\n>>> FINTRACK EMAIL SIMULATION TO {}: {}\nSubject: {}\n", toEmail, subject);
        return true;
    }

    public boolean sendOtpEmail(String toEmail, String otpCode, String purpose) {
        String subject = "FinTrack - Your Verification OTP: " + otpCode;
        String htmlContent = buildOtpHtml(toEmail, otpCode, purpose);
        return sendHtmlEmail(toEmail, subject, htmlContent);
    }

    public boolean sendLoginAlertEmail(String toEmail, String name, String ip, String time) {
        String subject = "FinTrack Security Alert: New Sign-in Detected";
        String html = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0B0E14;color:#F8FAFC;padding:24px;'>"
                + "<div style='max-width:480px;margin:0 auto;background:#131824;border-radius:12px;padding:28px;border:1px solid #334155;'>"
                + "<h2 style='color:#6366F1;margin-top:0;'>FinTrack Security Alert</h2>"
                + "<p>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "<p>Your account was successfully signed into at <strong>" + time + "</strong>.</p>"
                + (ip != null ? "<p style='color:#94A3B8;font-size:13px;'>IP Address: " + ip + "</p>" : "")
                + "<p style='color:#94A3B8;font-size:12px;'>If this was not you, please log in immediately and update your password.</p>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendLogoutAlertEmail(String toEmail, String name, String time) {
        String subject = "FinTrack: Account Session Ended";
        String html = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0B0E14;color:#F8FAFC;padding:24px;'>"
                + "<div style='max-width:480px;margin:0 auto;background:#131824;border-radius:12px;padding:28px;border:1px solid #334155;'>"
                + "<h2 style='color:#3B82F6;margin-top:0;'>Session Signed Out</h2>"
                + "<p>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "<p>Your FinTrack session has ended at <strong>" + time + "</strong>.</p>"
                + "<p style='color:#94A3B8;font-size:12px;'>You can log back in securely at any time.</p>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendPasswordResetEmail(String toEmail, String name) {
        String subject = "FinTrack Security: Password Successfully Changed";
        String html = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0B0E14;color:#F8FAFC;padding:24px;'>"
                + "<div style='max-width:480px;margin:0 auto;background:#131824;border-radius:12px;padding:28px;border:1px solid #334155;'>"
                + "<h2 style='color:#10B981;margin-top:0;'>Password Updated</h2>"
                + "<p>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "<p>Your account password was successfully updated. All other active sessions have been terminated.</p>"
                + "<p style='color:#EF4444;font-size:12px;'>If you did not make this change, please contact your administrator immediately.</p>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendAccessRequestStatusEmail(String toEmail, String name, String requestType, String status, String adminNote) {
        boolean isApproved = "APPROVED".equalsIgnoreCase(status);
        String subject = "FinTrack Access Request: " + (isApproved ? "Approved" : "Reviewed");
        String color = isApproved ? "#10B981" : "#EF4444";
        String html = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0B0E14;color:#F8FAFC;padding:24px;'>"
                + "<div style='max-width:480px;margin:0 auto;background:#131824;border-radius:12px;padding:28px;border:1px solid #334155;'>"
                + "<h2 style='color:" + color + ";margin-top:0;'>Access Request " + status + "</h2>"
                + "<p>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "<p>Your request for <strong>" + requestType + "</strong> has been <strong>" + status + "</strong> by the administrator.</p>"
                + (adminNote != null && !adminNote.isBlank() ? "<p style='background:rgba(255,255,255,0.05);padding:10px 14px;border-radius:8px;font-size:13px;'>Admin Note: " + adminNote + "</p>" : "")
                + "<p style='font-size:13px;color:#94A3B8;'>Please refresh your dashboard to apply updated permissions.</p>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendEodSummaryEmail(String toEmail, String name, String dateStr, double income, double expense, double savings, List<Map<String, Object>> categories) {
        String subject = "FinTrack End of Day Financial Digest - " + dateStr;
        StringBuilder catHtml = new StringBuilder();
        if (categories != null && !categories.isEmpty()) {
            catHtml.append("<table style='width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;'>");
            catHtml.append("<tr style='border-bottom:1px solid #334155;color:#94A3B8;'><th style='text-align:left;padding:8px;'>Category</th><th style='text-align:right;padding:8px;'>Total Amount</th></tr>");
            for (Map<String, Object> cat : categories) {
                catHtml.append("<tr style='border-bottom:1px solid rgba(255,255,255,0.05);'>")
                        .append("<td style='padding:8px;color:#F8FAFC;'>").append(cat.get("name")).append("</td>")
                        .append("<td style='padding:8px;text-align:right;color:#CBD5E1;'>₹ ").append(cat.get("amount")).append("</td>")
                        .append("</tr>");
            }
            catHtml.append("</table>");
        }

        String html = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0B0E14;color:#F8FAFC;padding:24px;'>"
                + "<div style='max-width:560px;margin:0 auto;background:#131824;border-radius:12px;padding:28px;border:1px solid #334155;'>"
                + "<div style='display:flex;align-items:center;margin-bottom:16px;'>"
                + "<div style='font-size:20px;font-weight:bold;color:#6366F1;'>FinTrack EOD Digest</div>"
                + "</div>"
                + "<p>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "<p style='color:#94A3B8;font-size:13px;'>Here is your financial digest summary for <strong>" + dateStr + "</strong>:</p>"
                + "<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:20px 0;'>"
                + "  <div style='background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);padding:12px;border-radius:8px;text-align:center;'>"
                + "    <div style='font-size:11px;color:#10B981;font-weight:bold;'>INCOME</div>"
                + "    <div style='font-size:16px;font-weight:bold;color:#F8FAFC;'>₹ " + String.format("%.2f", income) + "</div>"
                + "  </div>"
                + "  <div style='background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);padding:12px;border-radius:8px;text-align:center;'>"
                + "    <div style='font-size:11px;color:#EF4444;font-weight:bold;'>EXPENSE</div>"
                + "    <div style='font-size:16px;font-weight:bold;color:#F8FAFC;'>₹ " + String.format("%.2f", expense) + "</div>"
                + "  </div>"
                + "  <div style='background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);padding:12px;border-radius:8px;text-align:center;'>"
                + "    <div style='font-size:11px;color:#3B82F6;font-weight:bold;'>NET SAVINGS</div>"
                + "    <div style='font-size:16px;font-weight:bold;color:#F8FAFC;'>₹ " + String.format("%.2f", savings) + "</div>"
                + "  </div>"
                + "</div>"
                + catHtml.toString()
                + "<p style='font-size:11px;color:#64748B;margin-top:24px;text-align:center;'>You can customize the frequency of this digest in your FinTrack Notification Settings.</p>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendMaintenanceAlertEmail(String toEmail, String name, String messageText, String scheduledWindow) {
        String subject = "FinTrack Notice: Scheduled Maintenance Window";
        String html = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0B0E14;color:#F8FAFC;padding:24px;'>"
                + "<div style='max-width:480px;margin:0 auto;background:#131824;border-radius:12px;padding:28px;border:1px solid #F59E0B;'>"
                + "<h2 style='color:#F59E0B;margin-top:0;'>System Maintenance Notice</h2>"
                + "<p>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "<p>" + messageText + "</p>"
                + (scheduledWindow != null ? "<p style='background:rgba(245,158,11,0.1);padding:12px;border-radius:8px;font-size:13px;color:#FCD34D;'>Scheduled Window: <strong>" + scheduledWindow + "</strong></p>" : "")
                + "<p style='font-size:12px;color:#94A3B8;'>During this window, user logins and account updates will be temporarily restricted.</p>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendTemporaryPasswordEmail(String toEmail, String name, String tempPassword, int durationMinutes, String expiresAtStr) {
        String subject = "FinTrack: Temporary Password for Account Access";
        String html = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0B0E14;color:#F8FAFC;padding:24px;'>"
                + "<div style='max-width:480px;margin:0 auto;background:#131824;border-radius:12px;padding:28px;border:1px solid #6366F1;'>"
                + "<div style='text-align:center;margin-bottom:20px;'>"
                + "<h2 style='color:#6366F1;margin:0;'>Temporary Password Issued</h2>"
                + "<p style='color:#94A3B8;font-size:13px;'>An administrator has generated a single-use temporary password for your account.</p>"
                + "</div>"
                + "<p>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "<p>You can use this temporary password to log into your account:</p>"
                + "<div style='background:rgba(99,102,241,0.12);border:1px dashed #6366F1;border-radius:10px;padding:16px;text-align:center;margin:20px 0;'>"
                + "<span style='font-size:24px;font-weight:bold;letter-spacing:4px;color:#818CF8;font-family:monospace;'>" + tempPassword + "</span>"
                + "<div style='font-size:12px;color:#EF4444;margin-top:8px;'>Valid for <strong>" + durationMinutes + " minutes</strong> (until " + expiresAtStr + ")</div>"
                + "</div>"
                + "<p style='font-size:13px;color:#CBD5E1;'><strong>Important:</strong> Upon logging in with this temporary password, you will be immediately prompted to set your new permanent password before proceeding.</p>"
                + "<p style='font-size:11px;color:#64748B;margin-top:24px;'>If you did not request this temporary password, please contact your administrator immediately.</p>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
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
