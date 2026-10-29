package com.networth.controller;

import com.networth.entity.User;
import com.networth.repository.UserRepository;
import com.networth.security.UserPrincipal;
import com.networth.service.EmailService;
import com.networth.service.ScheduledReportService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ReportController {

    @Autowired
    private ScheduledReportService scheduledReportService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EmailService emailService;

    /**
     * Send End of Day daily report to the authenticated user.
     * Can specify optional date (YYYY-MM-DD), defaults to today.
     */
    @PostMapping("/reports/send-daily-eod-summary")
    public ResponseEntity<?> sendMyEodSummary(@AuthenticationPrincipal UserPrincipal principal,
                                              @RequestBody(required = false) Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        LocalDate date = LocalDate.now();
        if (body != null && body.containsKey("date")) {
            try {
                date = LocalDate.parse(body.get("date").toString().substring(0, 10));
            } catch (Exception ignored) {}
        }

        Map<String, Object> result = scheduledReportService.sendDailyEodSummaryToSingleUser(principal.getId(), date);
        return ResponseEntity.ok(result);
    }

    /**
     * Admin endpoint: trigger automatic EOD report dispatch to ALL registered users.
     */
    @PostMapping("/reports/send-all-eod-summaries")
    public ResponseEntity<?> sendAllEodSummaries(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "Admin access required"));
        }

        Map<String, Object> result = scheduledReportService.sendDailyEodSummaryToAllUsers();
        return ResponseEntity.ok(result);
    }

    /**
     * Trigger credit card due reminder email for the user.
     * Must only be sent when due amount > 0.
     */
    @PostMapping("/notifications/card-due-alert")
    public ResponseEntity<?> sendCardDueAlertEmail(@AuthenticationPrincipal UserPrincipal principal,
                                                   @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        String cardName = (String) body.getOrDefault("cardName", "Credit Card");
        String bank = (String) body.getOrDefault("bank", "Bank");
        int dueDay = body.containsKey("dueDay") ? Integer.parseInt(body.get("dueDay").toString()) : 1;
        double dueAmount = body.containsKey("dueAmount") ? Double.parseDouble(body.get("dueAmount").toString()) : 0.0;
        int daysRemaining = body.containsKey("daysRemaining") ? Integer.parseInt(body.get("daysRemaining").toString()) : 0;

        if (dueAmount <= 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "No notification sent: Card due amount is 0 or negative"
            ));
        }

        String toEmail = principal.getEmail();
        String name = principal.getUser() != null ? principal.getUser().getName() : "Cardholder";

        boolean sent = emailService.sendCreditCardDueReminderEmail(
                toEmail,
                name != null ? name : "Cardholder",
                cardName,
                bank,
                dueDay,
                dueAmount,
                daysRemaining
        );

        return ResponseEntity.ok(Map.of(
                "success", sent,
                "email", toEmail,
                "message", sent ? "Credit card due notification email delivered successfully" : "Email delivery failed"
        ));
    }

    /**
     * Trigger loan EMI due reminder email for the user.
     */
    @PostMapping("/notifications/loan-due-alert")
    public ResponseEntity<?> sendLoanDueAlertEmail(@AuthenticationPrincipal UserPrincipal principal,
                                                   @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        String loanName = (String) body.getOrDefault("loanName", "Loan Account");
        String lender = (String) body.getOrDefault("lender", "Lender Bank");
        String loanNumber = (String) body.getOrDefault("loanNumber", "");
        double emiAmount = body.containsKey("emiAmount") ? Double.parseDouble(body.get("emiAmount").toString()) : 0.0;
        int dueDay = body.containsKey("dueDay") ? Integer.parseInt(body.get("dueDay").toString()) : 1;
        double remainingAmount = body.containsKey("remainingAmount") ? Double.parseDouble(body.get("remainingAmount").toString()) : 0.0;

        if (emiAmount <= 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "No notification sent: EMI amount is 0"
            ));
        }

        String toEmail = principal.getEmail();
        String name = principal.getUser() != null ? principal.getUser().getName() : "Borrower";

        boolean sent = emailService.sendLoanEmiReminderEmail(
                toEmail,
                name != null ? name : "Borrower",
                loanName,
                lender,
                loanNumber,
                emiAmount,
                dueDay,
                remainingAmount
        );

        return ResponseEntity.ok(Map.of(
                "success", sent,
                "email", toEmail,
                "message", sent ? "Loan EMI reminder email delivered successfully" : "Email delivery failed"
        ));
    }
}
