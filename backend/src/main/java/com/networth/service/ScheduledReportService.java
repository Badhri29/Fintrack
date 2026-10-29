package com.networth.service;

import com.networth.entity.Transaction;
import com.networth.entity.User;
import com.networth.entity.UserActivityLog;
import com.networth.entity.UserNotificationSetting;
import com.networth.repository.TransactionRepository;
import com.networth.repository.UserActivityLogRepository;
import com.networth.repository.UserNotificationSettingRepository;
import com.networth.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class ScheduledReportService {

    private static final Logger logger = LoggerFactory.getLogger(ScheduledReportService.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private EmailService emailService;

    @Autowired
    private PdfStatementService pdfStatementService;

    @Autowired
    private UserActivityLogRepository userActivityLogRepository;

    @Autowired
    private UserNotificationSettingRepository userNotificationSettingRepository;

    /**
     * Automatic End-of-Day Financial Summary Dispatcher.
     * Scheduled to run every day at 23:55 (End of day).
     * Dispatches customized daily reports to ALL registered users based on their transactions,
     * even if they had no transactions for that day.
     */
    @Scheduled(cron = "0 55 23 * * ?")
    public void scheduleDailyEodSummary() {
        logger.info("[EOD-CRON] Triggering automated End-of-Day financial digest for all registered users...");
        sendDailyEodSummaryToAllUsers();
    }

    public Map<String, Object> sendDailyEodSummaryToAllUsers() {
        List<User> users = userRepository.findAll();
        LocalDate today = LocalDate.now();
        int totalDispatched = 0;
        int failed = 0;
        List<String> recipients = new ArrayList<>();

        for (User user : users) {
            if (user.getEmail() == null || user.getEmail().trim().isEmpty()) {
                continue;
            }

            // Verify notification setting if present
            boolean enabled = true;
            Optional<UserNotificationSetting> settingOpt = userNotificationSettingRepository.findByUserId(user.getId());
            if (settingOpt.isPresent()) {
                enabled = settingOpt.get().getEodMail() != null ? settingOpt.get().getEodMail() : true;
            }

            if (!enabled) {
                logger.info("[EOD-CRON] Skipping user {} (EOD email notification disabled in user settings)", user.getEmail());
                continue;
            }

            boolean ok = sendEodForUser(user, today);
            if (ok) {
                totalDispatched++;
                recipients.add(user.getEmail());
            } else {
                failed++;
            }
        }

        logger.info("[EOD-CRON] End of Day reports completed: {} dispatched, {} failed.", totalDispatched, failed);
        return Map.of(
                "success", true,
                "dispatchedCount", totalDispatched,
                "failedCount", failed,
                "recipients", recipients,
                "date", today.toString()
        );
    }

    public Map<String, Object> sendDailyEodSummaryToSingleUser(Long userId, LocalDate date) {
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return Map.of("success", false, "message", "User not found");
        }

        User user = userOpt.get();
        if (user.getEmail() == null || user.getEmail().trim().isEmpty()) {
            return Map.of("success", false, "message", "User does not have an email address configured");
        }

        LocalDate targetDate = date != null ? date : LocalDate.now();
        boolean sent = sendEodForUser(user, targetDate);

        return Map.of(
                "success", sent,
                "email", user.getEmail(),
                "date", targetDate.toString(),
                "message", sent ? "End-of-day digest sent successfully to " + user.getEmail() : "Failed to deliver email"
        );
    }

    private boolean sendEodForUser(User user, LocalDate date) {
        try {
            List<Transaction> txs = transactionRepository.findByUserIdAndDate(user.getId(), date);
            if (txs == null) {
                txs = Collections.emptyList();
            }

            double totalIncome = 0;
            double totalExpense = 0;
            double totalSavings = 0;
            Map<String, Double> catMap = new LinkedHashMap<>();

            for (Transaction t : txs) {
                double amt = t.getAmount() != null ? t.getAmount() : 0;
                String type = t.getType() != null ? t.getType().toLowerCase() : "expense";
                if ("income".equals(type)) {
                    totalIncome += amt;
                } else if ("savings".equals(type)) {
                    totalSavings += amt;
                } else {
                    totalExpense += amt;
                }

                String cat = t.getCategory() != null && !t.getCategory().isBlank() ? t.getCategory() : "General";
                catMap.put(cat, catMap.getOrDefault(cat, 0.0) + amt);
            }

            double netSavings = totalIncome - totalExpense;

            List<Map<String, Object>> categoriesList = new ArrayList<>();
            for (Map.Entry<String, Double> entry : catMap.entrySet()) {
                categoriesList.add(Map.of(
                        "name", entry.getKey(),
                        "amount", String.format("%.2f", entry.getValue())
                ));
            }

            String dateStr = date.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));

            // Generate official PDF statement
            byte[] pdfBytes = null;
            try {
                pdfBytes = pdfStatementService.generateDailyEodStatementPdf(
                        user,
                        dateStr,
                        totalIncome,
                        totalExpense,
                        netSavings,
                        categoriesList,
                        txs
                );
            } catch (Exception pdfEx) {
                logger.warn("[EOD] Could not generate statement PDF for {}: {}", user.getEmail(), pdfEx.getMessage());
            }

            boolean sent = emailService.sendEodSummaryEmail(
                    user.getEmail(),
                    user.getName() != null && !user.getName().isBlank() ? user.getName() : user.getEmail().split("@")[0],
                    dateStr,
                    totalIncome,
                    totalExpense,
                    netSavings,
                    categoriesList,
                    pdfBytes
            );

            if (sent) {
                try {
                    userActivityLogRepository.save(UserActivityLog.builder()
                            .userId(user.getId())
                            .userEmail(user.getEmail())
                            .action("EOD_REPORT_DISPATCHED")
                            .details("Automated End of Day financial digest for " + dateStr + " dispatched to " + user.getEmail()
                                    + " (Tx Count: " + txs.size() + ", Inflow: " + totalIncome + ", Outflow: " + totalExpense + ")")
                            .build());
                } catch (Exception logEx) {
                    // non-blocking
                }
            }

            return sent;
        } catch (Exception e) {
            logger.error("[EOD] Error compiling daily digest for user {}: {}", user.getEmail(), e.getMessage(), e);
            return false;
        }
    }
}
