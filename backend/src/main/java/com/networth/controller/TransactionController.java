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

    @PostMapping
    public ResponseEntity<Map<String, Object>> createTransaction(@AuthenticationPrincipal UserPrincipal principal,
                                                                 @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
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

        Transaction transaction = Transaction.builder()
                .date(LocalDate.parse(dateStr.substring(0, 10)))
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

        var opt = transactionRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("success", false, "message", "Transaction not found"));
        }

        transactionRepository.deleteByIdAndUserId(id, principal.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }
}
