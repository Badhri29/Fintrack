package com.networth.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.networth.entity.Budget;
import com.networth.repository.BudgetRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/budgets")
public class BudgetController {

    @Autowired
    private BudgetRepository budgetRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping
    public ResponseEntity<Map<String, Object>> getBudgets(@AuthenticationPrincipal UserPrincipal principal,
                                                          @RequestParam(required = false) Integer year) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        int targetYear = year != null ? year : java.time.LocalDate.now().getYear();
        List<Budget> budgetList = budgetRepository.findByUserIdAndYear(principal.getId(), targetYear);

        Map<String, Object> budgetMap = new HashMap<>();
        for (Budget b : budgetList) {
            try {
                Object parsed = objectMapper.readValue(b.getMonthlyAmountsJson(), Object.class);
                budgetMap.put(b.getCategoryKey(), parsed);
            } catch (Exception e) {
                budgetMap.put(b.getCategoryKey(), b.getMonthlyAmountsJson());
            }
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "year", targetYear,
                "data", budgetMap
        ));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> saveBudgetCategory(@AuthenticationPrincipal UserPrincipal principal,
                                                                  @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot edit budget"));
        }

        Integer year = body.get("year") != null ? Integer.valueOf(body.get("year").toString()) : java.time.LocalDate.now().getYear();
        String categoryKey = (String) body.get("categoryKey");
        if (categoryKey == null || categoryKey.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "categoryKey is required"));
        }

        String monthlyAmountsJson;
        try {
            monthlyAmountsJson = objectMapper.writeValueAsString(body.get("monthlyAmounts"));
        } catch (Exception e) {
            monthlyAmountsJson = "[]";
        }

        Optional<Budget> existingOpt = budgetRepository.findByUserIdAndYearAndCategoryKey(principal.getId(), year, categoryKey);
        Budget budget;
        if (existingOpt.isPresent()) {
            budget = existingOpt.get();
            budget.setMonthlyAmountsJson(monthlyAmountsJson);
        } else {
            budget = Budget.builder()
                    .userId(principal.getId())
                    .year(year)
                    .categoryKey(categoryKey)
                    .monthlyAmountsJson(monthlyAmountsJson)
                    .build();
        }

        budget = budgetRepository.save(budget);
        return ResponseEntity.ok(Map.of("success", true, "data", budget));
    }

    @PostMapping("/sync")
    @Transactional
    public ResponseEntity<Map<String, Object>> syncBudget(@AuthenticationPrincipal UserPrincipal principal,
                                                          @RequestBody Map<String, Object> payload) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot sync budget"));
        }

        Integer year = payload.get("year") != null ? Integer.valueOf(payload.get("year").toString()) : java.time.LocalDate.now().getYear();
        Object rawBudgets = payload.get("budgets");

        if (!(rawBudgets instanceof Map<?, ?> budgetMap)) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "budgets map required"));
        }

        List<Budget> toSave = new ArrayList<>();
        for (Map.Entry<?, ?> entry : budgetMap.entrySet()) {
            String key = entry.getKey().toString();
            try {
                String json = objectMapper.writeValueAsString(entry.getValue());
                Optional<Budget> opt = budgetRepository.findByUserIdAndYearAndCategoryKey(principal.getId(), year, key);
                Budget b = opt.orElseGet(() -> Budget.builder().userId(principal.getId()).year(year).categoryKey(key).build());
                b.setMonthlyAmountsJson(json);
                toSave.add(b);
            } catch (Exception ignored) {}
        }

        budgetRepository.saveAll(toSave);
        return ResponseEntity.ok(Map.of("success", true, "year", year, "count", toSave.size()));
    }

    @DeleteMapping("/category")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteBudgetCategory(@AuthenticationPrincipal UserPrincipal principal,
                                                                    @RequestParam Integer year,
                                                                    @RequestParam String categoryKey) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot delete budget"));
        }
        budgetRepository.deleteByUserIdAndYearAndCategoryKey(principal.getId(), year, categoryKey);
        return ResponseEntity.ok(Map.of("success", true, "message", "Budget category deleted"));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<Map<String, Object>> resetBudget(@AuthenticationPrincipal UserPrincipal principal,
                                                           @RequestParam(required = false) Integer year) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot reset budget"));
        }

        int targetYear = year != null ? year : java.time.LocalDate.now().getYear();
        budgetRepository.deleteByUserIdAndYear(principal.getId(), targetYear);
        return ResponseEntity.ok(Map.of("success", true, "message", "Budget reset for year " + targetYear));
    }
}
