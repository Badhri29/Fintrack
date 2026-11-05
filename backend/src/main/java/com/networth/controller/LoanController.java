package com.networth.controller;

import com.networth.entity.Loan;
import com.networth.repository.LoanRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/loans")
public class LoanController {

    @Autowired
    private LoanRepository loanRepository;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getLoans(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        List<Loan> loans = loanRepository.findByUserIdOrderByCreatedAtAsc(principal.getId());
        return ResponseEntity.ok(Map.of("success", true, "data", loans));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createLoan(@AuthenticationPrincipal UserPrincipal principal,
                                                          @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot create loans"));
        }

        String id = (String) body.getOrDefault("id", "loan-" + System.currentTimeMillis());
        String name = (String) body.get("name");
        String lender = (String) body.getOrDefault("lender", "Lender Bank");

        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Loan name is required"));
        }

        Double principalAmt = 0.0;
        if (body.get("principal") != null) {
            try {
                principalAmt = Double.valueOf(body.get("principal").toString());
            } catch (Exception ignored) {}
        }

        Double emiAmt = 0.0;
        if (body.get("emiAmount") != null) {
            try {
                emiAmt = Double.valueOf(body.get("emiAmount").toString());
            } catch (Exception ignored) {}
        }

        Double remainingAmt = principalAmt;
        if (body.get("remainingAmount") != null) {
            try {
                remainingAmt = Double.valueOf(body.get("remainingAmount").toString());
            } catch (Exception ignored) {}
        }

        String startDate = (String) body.getOrDefault("startDate", java.time.LocalDate.now().toString());
        String endDate = (String) body.getOrDefault("endDate", java.time.LocalDate.now().plusYears(1).toString());

        Loan loan = Loan.builder()
                .id(id)
                .userId(principal.getId())
                .name(name)
                .loanNumber((String) body.get("loanNumber"))
                .lender(lender)
                .principal(principalAmt)
                .emiAmount(emiAmt)
                .remainingAmount(remainingAmt)
                .startDate(startDate)
                .endDate(endDate)
                .includeInNetWorth(!Boolean.FALSE.equals(body.get("includeInNetWorth")))
                .type((String) body.getOrDefault("type", "Personal Loan"))
                .interestRate(body.get("interestRate") != null ? Double.valueOf(body.get("interestRate").toString()) : 0.0)
                .tenureMonths(body.get("tenureMonths") != null ? Integer.valueOf(body.get("tenureMonths").toString()) : 12)
                .paidMonths(body.get("paidMonths") != null ? Integer.valueOf(body.get("paidMonths").toString()) : 0)
                .paidScheduleIndicesJson(body.get("paidScheduleIndicesJson") != null ? body.get("paidScheduleIndicesJson").toString() : null)
                .dueDay(body.get("dueDay") != null ? Integer.valueOf(body.get("dueDay").toString()) : 5)
                .description((String) body.get("description"))
                .status((String) body.getOrDefault("status", "active"))
                .repaymentSource((String) body.getOrDefault("repaymentSource", "bank"))
                .linkedCardId((String) body.get("linkedCardId"))
                .linkedCardName((String) body.get("linkedCardName"))
                .isForSomeoneElse(Boolean.TRUE.equals(body.get("isForSomeoneElse")))
                .borrowerName((String) body.get("borrowerName"))
                .borrowerPhone((String) body.get("borrowerPhone"))
                .borrowerNotes((String) body.get("borrowerNotes"))
                .receivedScheduleIndicesJson(body.get("receivedScheduleIndicesJson") != null ? body.get("receivedScheduleIndicesJson").toString() : null)
                .build();

        loan = loanRepository.save(loan);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", loan));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateLoan(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable String id,
                                                          @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot update loans"));
        }

        Optional<Loan> opt = loanRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Loan not found"));
        }

        Loan loan = opt.get();
        if (body.containsKey("name")) loan.setName((String) body.get("name"));
        if (body.containsKey("loanNumber")) loan.setLoanNumber((String) body.get("loanNumber"));
        if (body.containsKey("lender")) loan.setLender((String) body.get("lender"));
        if (body.containsKey("principal") && body.get("principal") != null) {
            try {
                loan.setPrincipal(Double.valueOf(body.get("principal").toString()));
            } catch (Exception ignored) {}
        }
        if (body.containsKey("emiAmount") && body.get("emiAmount") != null) {
            try {
                loan.setEmiAmount(Double.valueOf(body.get("emiAmount").toString()));
            } catch (Exception ignored) {}
        }
        if (body.containsKey("remainingAmount") && body.get("remainingAmount") != null) {
            try {
                loan.setRemainingAmount(Double.valueOf(body.get("remainingAmount").toString()));
            } catch (Exception ignored) {}
        }
        if (body.containsKey("startDate")) loan.setStartDate((String) body.get("startDate"));
        if (body.containsKey("endDate")) loan.setEndDate((String) body.get("endDate"));
        if (body.containsKey("includeInNetWorth")) loan.setIncludeInNetWorth(!Boolean.FALSE.equals(body.get("includeInNetWorth")));
        if (body.containsKey("type")) loan.setType((String) body.get("type"));
        if (body.containsKey("interestRate") && body.get("interestRate") != null) {
            loan.setInterestRate(Double.valueOf(body.get("interestRate").toString()));
        }
        if (body.containsKey("tenureMonths") && body.get("tenureMonths") != null) {
            loan.setTenureMonths(Integer.valueOf(body.get("tenureMonths").toString()));
        }
        if (body.containsKey("paidMonths") && body.get("paidMonths") != null) {
            loan.setPaidMonths(Integer.valueOf(body.get("paidMonths").toString()));
        }
        if (body.containsKey("paidScheduleIndicesJson")) {
            loan.setPaidScheduleIndicesJson(body.get("paidScheduleIndicesJson") != null ? body.get("paidScheduleIndicesJson").toString() : null);
        }
        if (body.containsKey("dueDay") && body.get("dueDay") != null) {
            loan.setDueDay(Integer.valueOf(body.get("dueDay").toString()));
        }
        if (body.containsKey("description")) loan.setDescription((String) body.get("description"));
        if (body.containsKey("status")) loan.setStatus((String) body.get("status"));
        if (body.containsKey("repaymentSource")) loan.setRepaymentSource((String) body.get("repaymentSource"));
        if (body.containsKey("linkedCardId")) loan.setLinkedCardId((String) body.get("linkedCardId"));
        if (body.containsKey("linkedCardName")) loan.setLinkedCardName((String) body.get("linkedCardName"));
        if (body.containsKey("isForSomeoneElse")) {
            loan.setIsForSomeoneElse(Boolean.TRUE.equals(body.get("isForSomeoneElse")));
        }
        if (body.containsKey("borrowerName")) loan.setBorrowerName((String) body.get("borrowerName"));
        if (body.containsKey("borrowerPhone")) loan.setBorrowerPhone((String) body.get("borrowerPhone"));
        if (body.containsKey("borrowerNotes")) loan.setBorrowerNotes((String) body.get("borrowerNotes"));
        if (body.containsKey("receivedScheduleIndicesJson")) {
            loan.setReceivedScheduleIndicesJson(body.get("receivedScheduleIndicesJson") != null ? body.get("receivedScheduleIndicesJson").toString() : null);
        }

        loan = loanRepository.save(loan);
        return ResponseEntity.ok(Map.of("success", true, "data", loan));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteLoan(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable String id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot delete loans"));
        }

        Optional<Loan> opt = loanRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Loan not found"));
        }

        loanRepository.delete(opt.get());
        return ResponseEntity.ok(Map.of("success", true, "message", "Loan deleted successfully"));
    }

    @PostMapping("/sync")
    @Transactional
    public ResponseEntity<Map<String, Object>> syncLoans(@AuthenticationPrincipal UserPrincipal principal,
                                                         @RequestBody List<Map<String, Object>> loansList) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot sync loans"));
        }

        List<Loan> saved = new ArrayList<>();
        for (Map<String, Object> body : loansList) {
            String id = (String) body.get("id");
            if (id == null || id.trim().isEmpty()) {
                id = "loan-" + UUID.randomUUID().toString().substring(0, 8);
            }

            Double principalAmt = 0.0;
            if (body.get("principal") != null) {
                try {
                    principalAmt = Double.valueOf(body.get("principal").toString());
                } catch (Exception ignored) {}
            }

            Double emiAmt = 0.0;
            if (body.get("emiAmount") != null) {
                try {
                    emiAmt = Double.valueOf(body.get("emiAmount").toString());
                } catch (Exception ignored) {}
            }

            Double remainingAmt = principalAmt;
            if (body.get("remainingAmount") != null) {
                try {
                    remainingAmt = Double.valueOf(body.get("remainingAmount").toString());
                } catch (Exception ignored) {}
            }

            Loan loan = Loan.builder()
                    .id(id)
                    .userId(principal.getId())
                    .name((String) body.getOrDefault("name", "Loan"))
                    .loanNumber((String) body.get("loanNumber"))
                    .lender((String) body.getOrDefault("lender", "Lender"))
                    .principal(principalAmt)
                    .emiAmount(emiAmt)
                    .remainingAmount(remainingAmt)
                    .startDate((String) body.getOrDefault("startDate", java.time.LocalDate.now().toString()))
                    .endDate((String) body.getOrDefault("endDate", java.time.LocalDate.now().plusYears(1).toString()))
                    .includeInNetWorth(!Boolean.FALSE.equals(body.get("includeInNetWorth")))
                    .type((String) body.getOrDefault("type", "Personal Loan"))
                    .interestRate(body.get("interestRate") != null ? Double.valueOf(body.get("interestRate").toString()) : 0.0)
                    .tenureMonths(body.get("tenureMonths") != null ? Integer.valueOf(body.get("tenureMonths").toString()) : 12)
                    .paidMonths(body.get("paidMonths") != null ? Integer.valueOf(body.get("paidMonths").toString()) : 0)
                    .paidScheduleIndicesJson(body.get("paidScheduleIndicesJson") != null ? body.get("paidScheduleIndicesJson").toString() : null)
                    .dueDay(body.get("dueDay") != null ? Integer.valueOf(body.get("dueDay").toString()) : 5)
                    .description((String) body.get("description"))
                    .status((String) body.getOrDefault("status", "active"))
                    .repaymentSource((String) body.getOrDefault("repaymentSource", "bank"))
                    .linkedCardId((String) body.get("linkedCardId"))
                    .linkedCardName((String) body.get("linkedCardName"))
                    .isForSomeoneElse(Boolean.TRUE.equals(body.get("isForSomeoneElse")))
                    .borrowerName((String) body.get("borrowerName"))
                    .borrowerPhone((String) body.get("borrowerPhone"))
                    .borrowerNotes((String) body.get("borrowerNotes"))
                    .receivedScheduleIndicesJson(body.get("receivedScheduleIndicesJson") != null ? body.get("receivedScheduleIndicesJson").toString() : null)
                    .build();
            saved.add(loan);
        }

        loanRepository.saveAll(saved);
        return ResponseEntity.ok(Map.of("success", true, "count", saved.size(), "data", saved));
    }

    @PostMapping("/{id}/record-emi")
    public ResponseEntity<Map<String, Object>> recordEmi(@AuthenticationPrincipal UserPrincipal principal,
                                                         @PathVariable String id,
                                                         @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot record EMI"));
        }

        Optional<Loan> opt = loanRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Loan not found"));
        }

        Loan loan = opt.get();
        double emi = loan.getEmiAmount() != null && loan.getEmiAmount() > 0 ? loan.getEmiAmount() : 0.0;
        if (body.get("emiAmount") != null) {
            try {
                emi = Double.valueOf(body.get("emiAmount").toString());
            } catch (Exception ignored) {}
        }

        int paidCount = (loan.getPaidMonths() != null ? loan.getPaidMonths() : 0) + 1;
        loan.setPaidMonths(paidCount);

        double newRemaining = Math.max(0.0, (loan.getRemainingAmount() != null ? loan.getRemainingAmount() : loan.getPrincipal()) - emi);
        loan.setRemainingAmount(newRemaining);

        if (newRemaining <= 0 || (loan.getTenureMonths() != null && paidCount >= loan.getTenureMonths())) {
            loan.setStatus("closed");
        }

        loan = loanRepository.save(loan);
        return ResponseEntity.ok(Map.of("success", true, "message", "EMI recorded successfully", "data", loan));
    }
}
