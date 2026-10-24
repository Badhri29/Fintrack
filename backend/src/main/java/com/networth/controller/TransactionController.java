package com.networth.controller;

import com.networth.entity.Transaction;
import com.networth.repository.TransactionRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/transactions")
public class TransactionController {

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private com.networth.repository.UserActivityLogRepository userActivityLogRepository;

    private LocalDate parseLocalDate(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) {
            return LocalDate.now();
        }
        String s = dateStr.trim();
        if (s.length() > 10) {
            s = s.substring(0, 10);
        }
        try {
            if (s.matches("^\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}$")) {
                String[] p = s.split("[-/]");
                return LocalDate.of(Integer.parseInt(p[0]), Integer.parseInt(p[1]), Integer.parseInt(p[2]));
            } else if (s.matches("^\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}$")) {
                String[] p = s.split("[-/]");
                return LocalDate.of(Integer.parseInt(p[2]), Integer.parseInt(p[1]), Integer.parseInt(p[0]));
            }
            return LocalDate.parse(s);
        } catch (Exception e) {
            return LocalDate.now();
        }
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createTransaction(@AuthenticationPrincipal UserPrincipal principal,
                                                                 @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot create transactions"));
        }

        String dateStr = (String) body.get("date");
        String type = (String) body.get("type");
        String category = (String) body.get("category");
        String subcategory = (String) body.get("subcategory");
        String details = (String) body.get("details");
        if (details == null) details = (String) body.get("description");
        Object amtObj = body.get("amount");
        String paymentMode = (String) body.get("paymentMode");
        String card = (String) body.get("card");

        if (dateStr == null || type == null || amtObj == null || paymentMode == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("success", false, "message", "date, type, amount, and paymentMode are required"));
        }

        Double amount;
        try {
            amount = Double.valueOf(amtObj.toString());
        } catch (NumberFormatException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("success", false, "message", "Amount must be a valid number"));
        }

        // Normalize type if category belongs to savings
        if (("expense".equalsIgnoreCase(type) || type == null || type.trim().isEmpty()) && category != null) {
            String cat = category.trim();
            if (cat.equalsIgnoreCase("Investments") || cat.equalsIgnoreCase("Savings")
                    || cat.equalsIgnoreCase("Mutual Funds") || cat.equalsIgnoreCase("Emergency Fund")) {
                type = "savings";
            }
        }

        Transaction transaction = Transaction.builder()
                .date(parseLocalDate(dateStr))
                .type(type)
                .category(category)
                .subcategory(subcategory)
                .description(details)
                .amount(amount)
                .paymentMode(paymentMode)
                .card("credit".equalsIgnoreCase(paymentMode) ? card : null)
                .userId(principal.getId())
                .build();

        transaction = transactionRepository.save(transaction);

        try {
            userActivityLogRepository.save(com.networth.entity.UserActivityLog.builder()
                    .userId(principal.getId())
                    .userEmail(principal.getEmail())
                    .action("TRANSACTION_ADDED")
                    .details("Added " + (transaction.getType() != null ? transaction.getType().toUpperCase() : "TRANSACTION") + " of ₹" + transaction.getAmount() + " in " + (transaction.getCategory() != null ? transaction.getCategory() : "General"))
                    .build());
        } catch (Exception ignored) {}

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", transaction));
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getTransactions(@AuthenticationPrincipal UserPrincipal principal,
                                                               @RequestParam(required = false) Integer limit) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        List<Transaction> transactions = transactionRepository.findByUserIdOrderByUpdatedAtDesc(principal.getId());
        for (Transaction t : transactions) {
            if ("expense".equalsIgnoreCase(t.getType()) && t.getCategory() != null) {
                String cat = t.getCategory().trim();
                if (cat.equalsIgnoreCase("Investments") || cat.equalsIgnoreCase("Savings")
                        || cat.equalsIgnoreCase("Mutual Funds") || cat.equalsIgnoreCase("Emergency Fund")) {
                    t.setType("savings");
                    transactionRepository.save(t);
                }
            }
        }
        if (limit != null && limit > 0 && limit < transactions.size()) {
            transactions = transactions.stream().limit(limit).collect(Collectors.toList());
        }

        return ResponseEntity.ok(Map.of("success", true, "data", transactions));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteTransaction(@AuthenticationPrincipal UserPrincipal principal,
                                                                 @PathVariable Long id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot delete transactions"));
        }

        var opt = transactionRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("success", false, "message", "Transaction not found"));
        }

        var existing = opt.get();
        transactionRepository.deleteByIdAndUserId(id, principal.getId());

        try {
            userActivityLogRepository.save(com.networth.entity.UserActivityLog.builder()
                    .userId(principal.getId())
                    .userEmail(principal.getEmail())
                    .action("TRANSACTION_DELETED")
                    .details("Deleted " + existing.getType() + " of ₹" + existing.getAmount())
                    .build());
        } catch (Exception ignored) {}

        return ResponseEntity.ok(Map.of("success", true));
    }

    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> updateTransaction(@AuthenticationPrincipal UserPrincipal principal,
                                                                 @PathVariable Long id,
                                                                 @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot edit transactions"));
        }

        var opt = transactionRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("success", false, "message", "Transaction not found"));
        }

        Transaction transaction = opt.get();

        if (body.containsKey("date")) {
            String dateStr = (String) body.get("date");
            if (dateStr != null && !dateStr.trim().isEmpty()) {
                transaction.setDate(parseLocalDate(dateStr));
            }
        }
        if (body.containsKey("type")) {
            transaction.setType((String) body.get("type"));
        }
        if (body.containsKey("category")) {
            transaction.setCategory((String) body.get("category"));
        }
        if (body.containsKey("subcategory")) {
            transaction.setSubcategory((String) body.get("subcategory"));
        }
        if (body.containsKey("details") || body.containsKey("description")) {
            String details = (String) body.get("details");
            if (details == null) details = (String) body.get("description");
            transaction.setDescription(details);
        }
        if (body.containsKey("amount")) {
            Object amtObj = body.get("amount");
            if (amtObj != null) {
                try {
                    transaction.setAmount(Double.valueOf(amtObj.toString()));
                } catch (NumberFormatException e) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("success", false, "message", "Amount must be a valid number"));
                }
            }
        }
        if (body.containsKey("paymentMode")) {
            String paymentMode = (String) body.get("paymentMode");
            transaction.setPaymentMode(paymentMode);
            String card = (String) body.get("card");
            transaction.setCard("credit".equalsIgnoreCase(paymentMode) ? card : null);
        }

        transaction = transactionRepository.save(transaction);
        return ResponseEntity.ok(Map.of("success", true, "data", transaction));
    }
}