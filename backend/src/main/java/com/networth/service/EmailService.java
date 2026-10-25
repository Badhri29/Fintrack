package com.networth.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);
    private static final String DEFAULT_MAIL_FROM = "fintracktool@gmail.com";
    private static final Set<String> EXCLUDED_RECIPIENTS = Set.of(
            "demo@fintrack.io"
    );

    @Autowired(required = false)
    private JavaMailSender mailSender;

    @Autowired
    private com.networth.repository.UserRepository userRepository;

    @Value("${spring.mail.username:fintracktool@gmail.com}")
    private String mailFrom;

    @Value("${spring.mail.password:}")
    private String mailPassword;

    public boolean isConfigured() {
        return mailSender != null
                && mailFrom != null && !mailFrom.trim().isEmpty()
                && mailPassword != null && !mailPassword.trim().isEmpty();
    }

    private boolean sendHtmlEmail(String toEmail, String subject, String htmlContent, boolean allowUnverified) {
        return sendHtmlEmailWithAttachment(toEmail, null, subject, htmlContent, null, null, null, allowUnverified);
    }

    private boolean sendHtmlEmail(String toEmail, String subject, String htmlContent) {
        return sendHtmlEmailWithAttachment(toEmail, null, subject, htmlContent, null, null, null, false);
    }

    public boolean sendHtmlEmailWithAttachment(String toEmail,
                                               String subject,
                                               String htmlContent,
                                               String attachmentFilename,
                                               byte[] attachmentBytes,
                                               String mimeType,
                                               boolean allowUnverified) {
        return sendHtmlEmailWithAttachment(toEmail, null, subject, htmlContent, attachmentFilename, attachmentBytes, mimeType, allowUnverified);
    }

    public boolean sendHtmlEmailWithAttachment(String toEmail,
                                               String replyToEmail,
                                               String subject,
                                               String htmlContent,
                                               String attachmentFilename,
                                               byte[] attachmentBytes,
                                               String mimeType,
                                               boolean allowUnverified) {
        if (toEmail == null || toEmail.trim().isEmpty()) {
            return false;
        }

        String normalizedEmail = toEmail.trim().toLowerCase();

        // 1. Exclude reserved administrator accounts
        if (EXCLUDED_RECIPIENTS.contains(normalizedEmail)) {
            logger.info("Skipped email delivery to excluded administrative account: {}", normalizedEmail);
            return true;
        }

        // 2. Ensure recipient is a verified user in database (unless onboarding / verification OTP)
        if (!allowUnverified) {
            Optional<com.networth.entity.User> userOpt = userRepository.findByEmail(normalizedEmail);
            if (userOpt.isEmpty() || !Boolean.TRUE.equals(userOpt.get().getIsVerified())) {
                logger.info("Skipped email to {}: recipient is not a verified user in the database.", normalizedEmail);
                return false;
            }
        }

        String fromAddress = (mailFrom != null && !mailFrom.trim().isEmpty()) ? mailFrom.trim() : DEFAULT_MAIL_FROM;

        if (isConfigured()) {
            try {
                MimeMessage message = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
                helper.setFrom(fromAddress, "FinTrack Intelligence");
                helper.setTo(normalizedEmail);
                if (replyToEmail != null && !replyToEmail.trim().isEmpty()) {
                    helper.setReplyTo(replyToEmail.trim());
                }
                helper.setSubject(subject);
                helper.setText(htmlContent, true);

                if (attachmentBytes != null && attachmentBytes.length > 0 && attachmentFilename != null) {
                    helper.addAttachment(attachmentFilename, new ByteArrayResource(attachmentBytes), mimeType != null ? mimeType : "application/pdf");
                }

                mailSender.send(message);
                logger.info("Successfully delivered email from {} to {} (Reply-To: {}, Attachment: {})", fromAddress, normalizedEmail, replyToEmail, attachmentFilename != null ? attachmentFilename : "None");
                return true;
            } catch (Exception e) {
                logger.warn("Could not deliver email to {} via SMTP ({}).", normalizedEmail, e.getMessage());
                return false;
            }
        }
        logger.info("\n>>> FINTRACK EMAIL SIMULATION (From: {}) TO {}: {}\nSubject: {}\nAttachment: {}\n", fromAddress, normalizedEmail, subject, attachmentFilename != null ? attachmentFilename : "None");
        return true;
    }

    public boolean sendOtpEmail(String toEmail, String otpCode, String purpose) {
        String subject = "FinTrack - Your Verification OTP: " + otpCode;
        String htmlContent = buildOtpHtml(toEmail, otpCode, purpose);
        boolean isVerificationFlow = purpose != null &&
                (purpose.toLowerCase().contains("registration") || purpose.toLowerCase().contains("verification"));
        return sendHtmlEmail(toEmail, subject, htmlContent, isVerificationFlow);
    }

    public boolean sendLoginAlertEmail(String toEmail, String name, String ip, String time) {
        String subject = "FinTrack Security Alert: New Sign-in Detected";
        String html = "<!DOCTYPE html><html><body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "<div style='max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 8px 24px rgba(0,0,0,0.04);overflow:hidden;'>"
                + "  <div style='background:linear-gradient(135deg,#1E1B4B 0%,#4338CA 100%);padding:24px 28px;color:#FFFFFF;'>"
                + "    <div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#C7D2FE;'>Security Notification</div>"
                + "    <h2 style='margin:8px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;'>New Sign-in Detected</h2>"
                + "  </div>"
                + "  <div style='padding:28px;'>"
                + "    <p style='font-size:15px;margin:0 0 14px;color:#334155;'>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "    <p style='font-size:14px;line-height:1.6;color:#64748B;margin:0 0 20px;'>Your account was successfully signed into at <strong>" + time + "</strong>.</p>"
                + (ip != null ? "    <div style='background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 16px;font-size:13px;color:#475569;margin-bottom:20px;'><strong>IP Address:</strong> " + ip + "</div>" : "")
                + "    <p style='font-size:12px;color:#94A3B8;line-height:1.6;margin:0 0 20px;'>If this was not you, please log in immediately and change your account password.</p>"
                + "    <div style='border-top:1px solid #E2E8F0;padding-top:16px;font-size:11px;color:#94A3B8;text-align:center;'>FinTrack Technologies Inc. • Automated Security Desk</div>"
                + "  </div>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendLogoutAlertEmail(String toEmail, String name, String time) {
        String subject = "FinTrack: Account Session Ended";
        String html = "<!DOCTYPE html><html><body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "<div style='max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 8px 24px rgba(0,0,0,0.04);overflow:hidden;'>"
                + "  <div style='background:linear-gradient(135deg,#1E1B4B 0%,#3B82F6 100%);padding:24px 28px;color:#FFFFFF;'>"
                + "    <div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#BFDBFE;'>Session Update</div>"
                + "    <h2 style='margin:8px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;'>Session Signed Out</h2>"
                + "  </div>"
                + "  <div style='padding:28px;'>"
                + "    <p style='font-size:15px;margin:0 0 14px;color:#334155;'>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "    <p style='font-size:14px;line-height:1.6;color:#64748B;margin:0 0 20px;'>Your FinTrack session ended at <strong>" + time + "</strong>. All active tokens have been cleared.</p>"
                + "    <p style='font-size:12px;color:#94A3B8;line-height:1.6;margin:0 0 20px;'>You can log back in securely at any time.</p>"
                + "    <div style='border-top:1px solid #E2E8F0;padding-top:16px;font-size:11px;color:#94A3B8;text-align:center;'>FinTrack Technologies Inc.</div>"
                + "  </div>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendPasswordResetEmail(String toEmail, String name) {
        String subject = "FinTrack Security: Password Successfully Changed";
        String html = "<!DOCTYPE html><html><body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "<div style='max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 8px 24px rgba(0,0,0,0.04);overflow:hidden;'>"
                + "  <div style='background:linear-gradient(135deg,#064E3B 0%,#059669 100%);padding:24px 28px;color:#FFFFFF;'>"
                + "    <div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#A7F3D0;'>Security Update</div>"
                + "    <h2 style='margin:8px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;'>Password Successfully Changed</h2>"
                + "  </div>"
                + "  <div style='padding:28px;'>"
                + "    <p style='font-size:15px;margin:0 0 14px;color:#334155;'>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "    <p style='font-size:14px;line-height:1.6;color:#64748B;margin:0 0 20px;'>Your account password was updated successfully. All other active sessions have been terminated for security.</p>"
                + "    <div style='background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:12px 16px;font-size:12px;color:#991B1B;margin-bottom:20px;'><strong>Warning:</strong> If you did not initiate this change, contact administrator desk at admin@fintrack.app immediately.</div>"
                + "    <div style='border-top:1px solid #E2E8F0;padding-top:16px;font-size:11px;color:#94A3B8;text-align:center;'>FinTrack Technologies Inc. • Automated Security Desk</div>"
                + "  </div>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

        public boolean sendAdminAccessRequestNotificationEmail(String toEmail,
                                                           String requesterName,
                                                           String requesterEmail,
                                                           String requestType,
                                                           String details,
                                                           String actionToken,
                                                           String baseUrl) {
        String effectiveBaseUrl = (baseUrl != null && !baseUrl.isBlank()) ? baseUrl : "http://localhost:8081";
        if (effectiveBaseUrl.endsWith("/")) effectiveBaseUrl = effectiveBaseUrl.substring(0, effectiveBaseUrl.length() - 1);

        String approveUrl = effectiveBaseUrl + "/api/public/access-requests/action?token=" + actionToken + "&action=APPROVE";
        String rejectUrl = effectiveBaseUrl + "/api/public/access-requests/action?token=" + actionToken + "&action=REJECT";

        String subject = "[FinTrack Request] New Access Request from " + (requesterName != null ? requesterName : requesterEmail);

        String html = "<!DOCTYPE html><html><body style='margin:0;padding:24px;background-color:#0A0D14;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#F8FAFC;'>"
                + "<div style='max-width:540px;margin:0 auto;background:#0F131D;border-radius:16px;border:1px solid #1E2638;box-shadow:0 12px 36px rgba(0,0,0,0.6);overflow:hidden;'>"
                + "  <div style='background:linear-gradient(135deg, #4338CA 0%, #6366F1 100%);padding:24px 28px;color:#FFFFFF;'>"
                + "    <div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#C7D2FE;'>Administrative Action Required</div>"
                + "    <h2 style='margin:8px 0 0;font-size:22px;font-weight:800;color:#FFFFFF;'>New Access Request</h2>"
                + "  </div>"
                + "  <div style='padding:28px;'>"
                + "    <p style='font-size:14px;color:#94A3B8;margin:0 0 16px;'>A user has submitted an access / upgrade request that requires your administrative review:</p>"
                + "    <div style='background:#131824;border:1px solid #232D42;border-radius:12px;padding:18px;margin-bottom:24px;'>"
                + "      <div style='margin-bottom:10px;'><span style='color:#64748B;font-size:12px;font-weight:600;'>USER:</span> <strong style='color:#FFFFFF;font-size:14px;margin-left:6px;'>" + (requesterName != null ? requesterName : "User") + "</strong> <span style='color:#818CF8;'>(" + requesterEmail + ")</span></div>"
                + "      <div style='margin-bottom:10px;'><span style='color:#64748B;font-size:12px;font-weight:600;'>REQUEST TYPE:</span> <span style='background:rgba(99,102,241,0.2);color:#A5B4FC;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;margin-left:6px;border:1px solid rgba(99,102,241,0.4);'>" + requestType + "</span></div>"
                + "      <div><span style='color:#64748B;font-size:12px;font-weight:600;'>DETAILS:</span> <div style='color:#CBD5E1;font-size:13px;margin-top:4px;background:#0A0D14;padding:10px 12px;border-radius:8px;border:1px solid #1E2638;line-height:1.5;'>" + (details != null ? details : "Requested upgrade / access") + "</div></div>"
                + "    </div>"
                + "    <div style='text-align:center;margin-bottom:24px;'>"
                + "      <div style='font-size:13px;font-weight:700;color:#E2E8F0;margin-bottom:14px;'>Direct 1-Click Action from this Email:</div>"
                + "      <div style='display:inline-flex;gap:16px;'>"
                + "        <a href='" + approveUrl + "' style='display:inline-block;padding:12px 26px;border-radius:10px;background:#10B981;color:#FFFFFF;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 4px 14px rgba(16,185,129,0.35);'>Approve Request</a>"
                + "        <a href='" + rejectUrl + "' style='display:inline-block;padding:12px 26px;border-radius:10px;background:#EF4444;color:#FFFFFF;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 4px 14px rgba(239,68,68,0.35);margin-left:12px;'>Reject Request</a>"
                + "      </div>"
                + "    </div>"
                + "    <p style='font-size:12px;color:#64748B;text-align:center;line-height:1.5;margin:0;'>Clicking either button above instantly applies your decision and notifies the user automatically without requiring login.</p>"
                + "    <div style='border-top:1px solid #1E2638;padding-top:16px;margin-top:20px;font-size:11px;color:#64748B;text-align:center;'>FinTrack Technologies Inc. • Automated Governance Desk</div>"
                + "  </div>"
                + "</div></body></html>";

        return sendHtmlEmailWithAttachment(toEmail, requesterEmail, subject, html, null, null, null, true);
    }

    public boolean sendAccessRequestStatusEmail(String toEmail, String name, String requestType, String status, String adminNote) {
        boolean isApproved = "APPROVED".equalsIgnoreCase(status);
        String subject = "FinTrack Access Request: " + (isApproved ? "Approved" : "Reviewed");
        String bannerBg = isApproved ? "linear-gradient(135deg,#064E3B 0%,#059669 100%)" : "linear-gradient(135deg,#7F1D1D 0%,#DC2626 100%)";
        String html = "<!DOCTYPE html><html><body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "<div style='max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 8px 24px rgba(0,0,0,0.04);overflow:hidden;'>"
                + "  <div style='background:" + bannerBg + ";padding:24px 28px;color:#FFFFFF;'>"
                + "    <div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;'>Access Governance</div>"
                + "    <h2 style='margin:8px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;'>Access Request " + status + "</h2>"
                + "  </div>"
                + "  <div style='padding:28px;'>"
                + "    <p style='font-size:15px;margin:0 0 14px;color:#334155;'>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "    <p style='font-size:14px;line-height:1.6;color:#64748B;margin:0 0 20px;'>Your request for <strong>" + requestType + "</strong> has been <strong>" + status + "</strong> by the administrator.</p>"
                + (adminNote != null && !adminNote.isBlank() ? "    <div style='background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 16px;font-size:13px;color:#475569;margin-bottom:20px;'><strong>Admin Note:</strong> " + adminNote + "</div>" : "")
                + "    <p style='font-size:13px;color:#64748B;line-height:1.6;'>Please refresh your dashboard to apply your updated privileges.</p>"
                + "    <div style='border-top:1px solid #E2E8F0;padding-top:16px;margin-top:20px;font-size:11px;color:#94A3B8;text-align:center;'>FinTrack Technologies Inc. • Administration Portal</div>"
                + "  </div>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendEodSummaryEmail(String toEmail,
                                       String name,
                                       String dateStr,
                                       double income,
                                       double expense,
                                       double savings,
                                       List<Map<String, Object>> categories,
                                       byte[] pdfBytes) {
        String subject = "FinTrack End of Day Financial Digest - " + dateStr;
        String html = buildEodSummaryHtml(name, dateStr, income, expense, savings, categories);

        if (pdfBytes != null && pdfBytes.length > 0) {
            String filename = "FinTrack_Daily_Statement_" + dateStr + ".pdf";
            return sendHtmlEmailWithAttachment(toEmail, subject, html, filename, pdfBytes, "application/pdf", false);
        } else {
            return sendHtmlEmail(toEmail, subject, html, false);
        }
    }

    public boolean sendEodSummaryEmail(String toEmail,
                                       String name,
                                       String dateStr,
                                       double income,
                                       double expense,
                                       double savings,
                                       List<Map<String, Object>> categories) {
        return sendEodSummaryEmail(toEmail, name, dateStr, income, expense, savings, categories, null);
    }

    private String buildEodSummaryHtml(String name,
                                       String dateStr,
                                       double income,
                                       double expense,
                                       double savings,
                                       List<Map<String, Object>> categories) {
        StringBuilder catHtml = new StringBuilder();
        if (categories != null && !categories.isEmpty()) {
            catHtml.append("<div style='margin-bottom:24px;'>");
            catHtml.append("<div style='font-size:13px;font-weight:700;color:#334155;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;'>Daily Category Distribution</div>");
            catHtml.append("<table style='width:100%;border-collapse:collapse;font-size:13px;'>");
            catHtml.append("<tr style='border-bottom:1px solid #E2E8F0;color:#64748B;'><th style='text-align:left;padding:8px 0;'>Category</th><th style='text-align:right;padding:8px 0;'>Amount</th></tr>");
            for (Map<String, Object> cat : categories) {
                catHtml.append("<tr style='border-bottom:1px solid #F1F5F9;'>")
                        .append("<td style='padding:8px 0;color:#334155;'>").append(cat.get("name")).append("</td>")
                        .append("<td style='padding:8px 0;text-align:right;font-weight:600;color:#0F172A;'>₹ ").append(cat.get("amount")).append("</td>")
                        .append("</tr>");
            }
            catHtml.append("</table></div>");
        }

        return "<!DOCTYPE html><html>"
                + "<head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'></head>"
                + "<body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "  <div style='max-width:620px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 10px 25px rgba(0,0,0,0.05);overflow:hidden;'>"
                + "    <div style='background:linear-gradient(135deg, #1E1B4B 0%, #4338CA 100%);padding:32px 36px;color:#FFFFFF;'>"
                + "      <div style='display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.18);font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;'>Official Daily Statement</div>"
                + "      <h1 style='margin:12px 0 4px;font-size:24px;font-weight:800;color:#FFFFFF;'>FinTrack Intelligence</h1>"
                + "      <p style='margin:0;font-size:13px;color:#C7D2FE;'>End of Day Financial Summary • " + dateStr + "</p>"
                + "    </div>"
                + "    <div style='padding:32px 36px;'>"
                + "      <p style='font-size:15px;line-height:1.6;margin:0 0 14px;color:#334155;'>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "      <p style='font-size:14px;line-height:1.6;color:#64748B;margin:0 0 24px;'>Here is your verified daily financial summary for <strong>" + dateStr + "</strong>. Your complete itemized transaction ledger and statement audit have been compiled into the attached official PDF document.</p>"
                + "      <table style='width:100%;border-collapse:separate;border-spacing:10px;margin:0 -10px 24px;'>"
                + "        <tr>"
                + "          <td style='width:33.33%;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:14px;text-align:center;'>"
                + "            <div style='font-size:10.5px;font-weight:bold;color:#047857;letter-spacing:0.5px;'>TOTAL INFLOW</div>"
                + "            <div style='font-size:18px;font-weight:800;color:#065F46;margin-top:4px;'>₹ " + String.format("%.2f", income) + "</div>"
                + "          </td>"
                + "          <td style='width:33.33%;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px;text-align:center;'>"
                + "            <div style='font-size:10.5px;font-weight:bold;color:#B91C1C;letter-spacing:0.5px;'>TOTAL OUTFLOW</div>"
                + "            <div style='font-size:18px;font-weight:800;color:#991B1B;margin-top:4px;'>₹ " + String.format("%.2f", expense) + "</div>"
                + "          </td>"
                + "          <td style='width:33.33%;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:12px;padding:14px;text-align:center;'>"
                + "            <div style='font-size:10.5px;font-weight:bold;color:#4338CA;letter-spacing:0.5px;'>NET BALANCE</div>"
                + "            <div style='font-size:18px;font-weight:800;color:#3730A3;margin-top:4px;'>₹ " + String.format("%.2f", savings) + "</div>"
                + "          </td>"
                + "        </tr>"
                + "      </table>"
                + catHtml.toString()
                + "      <div style='background:#F0FDF4;border:1px dashed #22C55E;border-radius:12px;padding:16px 20px;margin:24px 0;'>"
                + "        <div style='font-size:14px;font-weight:bold;color:#15803D;'>📎 Official Statement PDF Attached</div>"
                + "        <div style='font-size:12px;color:#166534;margin-top:3px;'>FinTrack_Daily_Statement_" + dateStr + ".pdf • Contains complete itemized records, timestamps, payment modes, category breakdowns, and administrative audit details.</div>"
                + "      </div>"
                + "      <div style='background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:12px;color:#64748B;line-height:1.6;'>"
                + "        <div style='font-weight:bold;color:#334155;margin-bottom:4px;'>ISSUED BY & ADMINISTRATIVE SUPPORT</div>"
                + "        <div>FinTrack Technologies Inc. • Automated Dispatch from <strong>fintracktool@gmail.com</strong></div>"
                + "        <div>Administrative Desk: <a href='mailto:admin@fintrack.app' style='color:#4F46E5;text-decoration:none;'>admin@fintrack.app</a></div>"
                + "      </div>"
                + "      <div style='border-top:1px solid #E2E8F0;padding-top:20px;text-align:center;font-size:11.5px;color:#94A3B8;line-height:1.6;'>"
                + "        FinTrack Net Worth Tracker • Intelligent Wealth Management<br/>"
                + "        You received this notification because daily EOD digest is enabled in your account settings."
                + "      </div>"
                + "    </div>"
                + "  </div>"
                + "</body></html>";
    }

    public boolean sendMaintenanceAlertEmail(String toEmail, String name, String messageText, String scheduledWindow) {
        String subject = "FinTrack Notice: Scheduled Maintenance Window";
        String html = "<!DOCTYPE html><html><body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "<div style='max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 8px 24px rgba(0,0,0,0.04);overflow:hidden;'>"
                + "  <div style='background:linear-gradient(135deg,#92400E 0%,#D97706 100%);padding:24px 28px;color:#FFFFFF;'>"
                + "    <div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;'>Infrastructure Alert</div>"
                + "    <h2 style='margin:8px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;'>System Maintenance Notice</h2>"
                + "  </div>"
                + "  <div style='padding:28px;'>"
                + "    <p style='font-size:15px;margin:0 0 14px;color:#334155;'>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "    <p style='font-size:14px;line-height:1.6;color:#64748B;margin:0 0 20px;'>" + messageText + "</p>"
                + (scheduledWindow != null ? "    <div style='background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;font-size:13px;color:#B45309;margin-bottom:20px;'><strong>Scheduled Window:</strong> " + scheduledWindow + "</div>" : "")
                + "    <p style='font-size:12px;color:#94A3B8;line-height:1.6;'>During this window, user logins and account updates will be temporarily restricted.</p>"
                + "    <div style='border-top:1px solid #E2E8F0;padding-top:16px;margin-top:20px;font-size:11px;color:#94A3B8;text-align:center;'>FinTrack Operations Team</div>"
                + "  </div>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendTemporaryPasswordEmail(String toEmail, String name, String tempPassword, int durationMinutes, String expiresAtStr) {
        String subject = "FinTrack: Temporary Password for Account Access";
        String html = "<!DOCTYPE html><html><body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "<div style='max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 8px 24px rgba(0,0,0,0.04);overflow:hidden;'>"
                + "  <div style='background:linear-gradient(135deg,#1E1B4B 0%,#4338CA 100%);padding:24px 28px;color:#FFFFFF;'>"
                + "    <div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#C7D2FE;'>Account Recovery</div>"
                + "    <h2 style='margin:8px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;'>Temporary Password Issued</h2>"
                + "  </div>"
                + "  <div style='padding:28px;'>"
                + "    <p style='font-size:15px;margin:0 0 14px;color:#334155;'>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "    <p style='font-size:14px;line-height:1.6;color:#64748B;margin:0 0 20px;'>An administrator has generated a single-use temporary password for your account:</p>"
                + "    <div style='background:#EEF2FF;border:1px dashed #6366F1;border-radius:10px;padding:16px;text-align:center;margin:20px 0;'>"
                + "      <span style='font-size:24px;font-weight:bold;letter-spacing:4px;color:#4338CA;font-family:monospace;'>" + tempPassword + "</span>"
                + "      <div style='font-size:12px;color:#DC2626;margin-top:8px;'>Valid for <strong>" + durationMinutes + " minutes</strong> (until " + expiresAtStr + ")</div>"
                + "    </div>"
                + "    <p style='font-size:13px;color:#475569;line-height:1.6;'><strong>Important:</strong> Upon logging in, you will be immediately prompted to set your new permanent password.</p>"
                + "    <div style='border-top:1px solid #E2E8F0;padding-top:16px;margin-top:20px;font-size:11px;color:#94A3B8;text-align:center;'>FinTrack Administrative Desk • admin@fintrack.app</div>"
                + "  </div>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    public boolean sendLoanEmiReminderEmail(String toEmail, String name, String loanName, String lender, String loanNumber, double emiAmount, int dueDay, double remainingAmount) {
        String subject = "FinTrack Alert: Upcoming EMI Due for " + loanName;
        String html = "<!DOCTYPE html><html><body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "<div style='max-width:540px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 8px 24px rgba(0,0,0,0.05);overflow:hidden;'>"
                + "  <div style='background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:28px 32px;color:#FFFFFF;'>"
                + "    <div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#C7D2FE;'>FinTrack Loan Reminder</div>"
                + "    <h2 style='margin:8px 0 0;font-size:22px;font-weight:800;color:#FFFFFF;'>Upcoming EMI Payment Due</h2>"
                + "    <p style='margin:4px 0 0;font-size:13px;color:#E0E7FF;'>Scheduled auto-debit and debt repayment notice</p>"
                + "  </div>"
                + "  <div style='padding:28px 32px;'>"
                + "    <p style='font-size:15px;margin:0 0 14px;color:#334155;'>Hello <strong>" + (name != null ? name : "User") + "</strong>,</p>"
                + "    <p style='font-size:14px;line-height:1.6;color:#64748B;margin:0 0 20px;'>This is a scheduled notification regarding your upcoming monthly loan EMI payment:</p>"
                + "    <div style='background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:20px;'>"
                + "      <div style='display:flex;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #E2E8F0;padding-bottom:10px;'>"
                + "        <span style='font-size:13px;color:#64748B;'>Loan Account</span>"
                + "        <strong style='font-size:14px;color:#1E293B;'>" + loanName + "</strong>"
                + "      </div>"
                + (loanNumber != null && !loanNumber.isEmpty() ? "      <div style='display:flex;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #E2E8F0;padding-bottom:10px;'><span style='font-size:13px;color:#64748B;'>Loan Number</span><strong style='font-size:13px;color:#4338CA;font-family:monospace;'>" + loanNumber + "</strong></div>" : "")
                + "      <div style='display:flex;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #E2E8F0;padding-bottom:10px;'>"
                + "        <span style='font-size:13px;color:#64748B;'>Lender / Bank</span>"
                + "        <strong style='font-size:14px;color:#1E293B;'>" + (lender != null ? lender : "Bank") + "</strong>"
                + "      </div>"
                + "      <div style='display:flex;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #E2E8F0;padding-bottom:10px;'>"
                + "        <span style='font-size:13px;color:#64748B;'>Monthly Due Day</span>"
                + "        <strong style='font-size:14px;color:#EF4444;'>" + dueDay + "th of this month</strong>"
                + "      </div>"
                + "      <div style='display:flex;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #E2E8F0;padding-bottom:10px;'>"
                + "        <span style='font-size:13px;color:#64748B;'>Monthly EMI Amount</span>"
                + "        <strong style='font-size:16px;color:#4338CA;'>₹ " + String.format("%.2f", emiAmount) + "</strong>"
                + "      </div>"
                + "      <div style='display:flex;justify-content:space-between;'>"
                + "        <span style='font-size:13px;color:#64748B;'>Outstanding Principal</span>"
                + "        <strong style='font-size:14px;color:#64748B;'>₹ " + String.format("%.2f", remainingAmount) + "</strong>"
                + "      </div>"
                + "    </div>"
                + "    <p style='font-size:13px;color:#64748B;line-height:1.6;margin:0 0 20px;'>Please ensure sufficient funds in your linked bank account to avoid auto-debit bounce fees or credit score impact.</p>"
                + "    <div style='border-top:1px solid #E2E8F0;padding-top:16px;margin-top:20px;font-size:11px;color:#94A3B8;text-align:center;'>FinTrack Automated Notifications Desk • fintracktool@gmail.com</div>"
                + "  </div>"
                + "</div></body></html>";
        return sendHtmlEmail(toEmail, subject, html);
    }

    private String buildOtpHtml(String email, String otpCode, String purpose) {
        return "<!DOCTYPE html><html>"
                + "<head><meta charset='UTF-8'></head>"
                + "<body style='margin:0;padding:24px;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1E293B;'>"
                + "  <div style='max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;padding:32px;box-shadow:0 10px 25px rgba(0,0,0,0.04);'>"
                + "    <div style='text-align:center;margin-bottom:24px;'>"
                + "      <div style='display:inline-block;width:48px;height:48px;line-height:48px;border-radius:12px;background:linear-gradient(135deg,#6366F1,#4338CA);color:#fff;font-size:24px;font-weight:bold;'>₹</div>"
                + "      <h2 style='margin:12px 0 4px;font-size:22px;color:#1E293B;'>FinTrack Intelligence</h2>"
                + "      <p style='margin:0;font-size:13px;color:#64748B;'>Security & Account Verification</p>"
                + "    </div>"
                + "    <div style='background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;'>"
                + "      <p style='margin:0 0 12px;font-size:14px;color:#475569;'>Your One-Time Password (OTP) for <strong>" + purpose + "</strong> is:</p>"
                + "      <div style='display:inline-block;letter-spacing:8px;font-size:32px;font-weight:800;color:#4338CA;background:#EEF2FF;padding:12px 24px;border-radius:10px;border:1px dashed #6366F1;'>"
                + otpCode
                + "      </div>"
                + "      <p style='margin:12px 0 0;font-size:12px;color:#DC2626;'>Valid for 5 minutes. Do not share this code with anyone.</p>"
                + "    </div>"
                + "    <p style='font-size:12px;color:#94A3B8;line-height:1.6;margin:0;text-align:center;'>"
                + "      If you did not request this OTP, please ignore this email.<br/>FinTrack Net Worth Tracker"
                + "    </p>"
                + "  </div>"
                + "</body></html>";
    }
}
