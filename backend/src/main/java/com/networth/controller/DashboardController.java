package com.networth.controller;

import com.networth.entity.Asset;
import com.networth.entity.Liability;
import com.networth.entity.Transaction;
import com.networth.repository.AssetRepository;
import com.networth.repository.LiabilityRepository;
import com.networth.repository.TransactionRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private LiabilityRepository liabilityRepository;

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> getSummary(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        List<Transaction> transactions = transactionRepository.findByUserIdOrderByDateDesc(principal.getId());
        List<Asset> assets = assetRepository.findByUserId(principal.getId());
        List<Liability> liabilities = liabilityRepository.findByUserId(principal.getId());

        double totalIncome = transactions.stream()
                .filter(t -> "income".equalsIgnoreCase(t.getType()))
                .mapToDouble(Transaction::getAmount).sum();
        double totalExpenses = transactions.stream()
                .filter(t -> "expense".equalsIgnoreCase(t.getType()))
                .mapToDouble(Transaction::getAmount).sum();
        double cashFlow = totalIncome - totalExpenses;
        double totalSavings = Math.max(0, cashFlow);

        double totalAssets = assets.stream().mapToDouble(Asset::getValue).sum();
        double totalLiabilities = liabilities.stream().mapToDouble(Liability::getValue).sum();
        double netWorth = totalAssets - totalLiabilities;

        double savingsRate = (totalIncome > 0) ? Math.round((totalSavings / totalIncome) * 100.0) : 0;
        int healthScore = calculateHealthScore(totalIncome, totalExpenses, totalAssets, totalLiabilities);

        Map<String, Object> data = new HashMap<>();
        data.put("totalIncome", totalIncome);
        data.put("totalExpenses", totalExpenses);
        data.put("totalSavings", totalSavings);
        data.put("cashFlow", cashFlow);
        data.put("budgetRemaining", Math.max(0, cashFlow));
        data.put("netWorth", netWorth);
        data.put("totalAssets", totalAssets);
        data.put("totalLiabilities", totalLiabilities);
        data.put("savingsRate", savingsRate);
        data.put("healthScore", healthScore);

        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }

    @GetMapping("/monthly")
    public ResponseEntity<Map<String, Object>> getMonthly(@AuthenticationPrincipal UserPrincipal principal,
                                                          @RequestParam(required = false) Integer year) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        int targetYear = (year != null) ? year : LocalDate.now().getYear();
        List<Transaction> transactions = transactionRepository.findByUserIdOrderByDateDesc(principal.getId());

        List<Map<String, Object>> monthlyData = new ArrayList<>();
        String[] months = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

        for (int m = 1; m <= 12; m++) {
            final int monthIdx = m;
            double inc = transactions.stream()
                    .filter(t -> t.getDate().getYear() == targetYear && t.getDate().getMonthValue() == monthIdx && "income".equalsIgnoreCase(t.getType()))
                    .mapToDouble(Transaction::getAmount).sum();
            double exp = transactions.stream()
                    .filter(t -> t.getDate().getYear() == targetYear && t.getDate().getMonthValue() == monthIdx && "expense".equalsIgnoreCase(t.getType()))
                    .mapToDouble(Transaction::getAmount).sum();

            Map<String, Object> monthMap = new HashMap<>();
            monthMap.put("month", months[m - 1]);
            monthMap.put("income", inc);
            monthMap.put("expense", exp);
            monthMap.put("savings", Math.max(0, inc - exp));
            monthlyData.add(monthMap);
        }

        return ResponseEntity.ok(Map.of("success", true, "year", targetYear, "data", monthlyData));
    }

    @GetMapping("/top-categories")
    public ResponseEntity<Map<String, Object>> getTopCategories(@AuthenticationPrincipal UserPrincipal principal,
                                                                @RequestParam(required = false, defaultValue = "5") int limit) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        List<Transaction> expenses = transactionRepository.findByUserIdOrderByDateDesc(principal.getId()).stream()
                .filter(t -> "expense".equalsIgnoreCase(t.getType()))
                .collect(Collectors.toList());

        Map<String, Double> categoryTotals = new HashMap<>();
        for (Transaction t : expenses) {
            String cat = (t.getCategory() != null && !t.getCategory().isEmpty()) ? t.getCategory() : "Uncategorized";
            categoryTotals.put(cat, categoryTotals.getOrDefault(cat, 0.0) + t.getAmount());
        }

        List<Map<String, Object>> sorted = categoryTotals.entrySet().stream()
                .sorted((e1, e2) -> Double.compare(e2.getValue(), e1.getValue()))
                .limit(limit)
                .map(e -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("category", e.getKey());
                    map.put("amount", e.getValue());
                    return map;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(Map.of("success", true, "data", sorted));
    }

    private int calculateHealthScore(double inc, double exp, double assets, double liab) {
        int score = 50; // base score
        if (inc > 0 && (inc - exp) > 0) score += 20;
        if (assets >= liab) score += 20;
        if (inc > 0 && ((inc - exp) / inc) >= 0.20) score += 10;
        return Math.min(100, Math.max(0, score));
    }
}
