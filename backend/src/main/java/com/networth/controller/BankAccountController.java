package com.networth.controller;

import com.networth.entity.BankAccount;
import com.networth.entity.CashWallet;
import com.networth.repository.BankAccountRepository;
import com.networth.repository.CashWalletRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/bank-accounts")
public class BankAccountController {

    @Autowired
    private BankAccountRepository bankAccountRepository;

    @Autowired
    private CashWalletRepository cashWalletRepository;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAccounts(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        List<BankAccount> accounts = bankAccountRepository.findByUserIdOrderByCreatedAtAsc(principal.getId());
        return ResponseEntity.ok(Map.of("success", true, "data", accounts));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createAccount(@AuthenticationPrincipal UserPrincipal principal,
                                                             @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot create bank accounts"));
        }

        String id = (String) body.getOrDefault("id", "acc-" + System.currentTimeMillis());
        String bankName = (String) body.get("bankName");
        String accountType = (String) body.getOrDefault("accountType", "Savings");
        String accountNumberLast4 = (String) body.getOrDefault("accountNumberLast4", "0000");

        if (bankName == null || bankName.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "bankName is required"));
        }

        Double balance = 0.0;
        if (body.get("balance") != null) {
            try {
                balance = Double.valueOf(body.get("balance").toString());
            } catch (Exception ignored) {}
        }

        Boolean isPrimary = Boolean.TRUE.equals(body.get("isPrimary"));

        BankAccount account = BankAccount.builder()
                .id(id)
                .userId(principal.getId())
                .bankName(bankName)
                .accountType(accountType)
                .accountNumberLast4(accountNumberLast4)
                .holderName((String) body.get("holderName"))
                .ifscCode((String) body.get("ifscCode"))
                .branch((String) body.get("branch"))
                .balance(balance)
                .isPrimary(isPrimary)
                .debitCardsJson(body.get("debitCardsJson") != null ? body.get("debitCardsJson").toString() : null)
                .creditCardsJson(body.get("creditCardsJson") != null ? body.get("creditCardsJson").toString() : null)
                .build();

        account = bankAccountRepository.save(account);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", account));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateAccount(@AuthenticationPrincipal UserPrincipal principal,
                                                             @PathVariable String id,
                                                             @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot edit bank accounts"));
        }

        Optional<BankAccount> opt = bankAccountRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Account not found"));
        }

        BankAccount account = opt.get();
        if (body.containsKey("bankName")) account.setBankName((String) body.get("bankName"));
        if (body.containsKey("accountType")) account.setAccountType((String) body.get("accountType"));
        if (body.containsKey("accountNumberLast4")) account.setAccountNumberLast4((String) body.get("accountNumberLast4"));
        if (body.containsKey("holderName")) account.setHolderName((String) body.get("holderName"));
        if (body.containsKey("ifscCode")) account.setIfscCode((String) body.get("ifscCode"));
        if (body.containsKey("branch")) account.setBranch((String) body.get("branch"));
        if (body.containsKey("balance") && body.get("balance") != null) {
            try {
                account.setBalance(Double.valueOf(body.get("balance").toString()));
            } catch (Exception ignored) {}
        }
        if (body.containsKey("isPrimary")) account.setIsPrimary(Boolean.TRUE.equals(body.get("isPrimary")));
        if (body.containsKey("debitCardsJson")) account.setDebitCardsJson(body.get("debitCardsJson") != null ? body.get("debitCardsJson").toString() : null);
        if (body.containsKey("creditCardsJson")) account.setCreditCardsJson(body.get("creditCardsJson") != null ? body.get("creditCardsJson").toString() : null);

        account = bankAccountRepository.save(account);
        return ResponseEntity.ok(Map.of("success", true, "data", account));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteAccount(@AuthenticationPrincipal UserPrincipal principal,
                                                             @PathVariable String id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot delete bank accounts"));
        }

        Optional<BankAccount> opt = bankAccountRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Account not found"));
        }

        bankAccountRepository.delete(opt.get());
        return ResponseEntity.ok(Map.of("success", true, "message", "Account deleted successfully"));
    }

    @PostMapping("/sync")
    @Transactional
    public ResponseEntity<Map<String, Object>> syncAccounts(@AuthenticationPrincipal UserPrincipal principal,
                                                            @RequestBody List<Map<String, Object>> accountsList) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot sync accounts"));
        }

        List<BankAccount> saved = new ArrayList<>();
        for (Map<String, Object> body : accountsList) {
            String id = (String) body.get("id");
            if (id == null || id.trim().isEmpty()) {
                id = "acc-" + UUID.randomUUID().toString().substring(0, 8);
            }

            Double balance = 0.0;
            if (body.get("balance") != null) {
                try {
                    balance = Double.valueOf(body.get("balance").toString());
                } catch (Exception ignored) {}
            }

            BankAccount acc = BankAccount.builder()
                    .id(id)
                    .userId(principal.getId())
                    .bankName((String) body.getOrDefault("bankName", "Bank Account"))
                    .accountType((String) body.getOrDefault("accountType", "Savings"))
                    .accountNumberLast4((String) body.getOrDefault("accountNumberLast4", "0000"))
                    .holderName((String) body.get("holderName"))
                    .ifscCode((String) body.get("ifscCode"))
                    .branch((String) body.get("branch"))
                    .balance(balance)
                    .isPrimary(Boolean.TRUE.equals(body.get("isPrimary")))
                    .debitCardsJson(body.get("debitCardsJson") != null ? body.get("debitCardsJson").toString() : null)
                    .creditCardsJson(body.get("creditCardsJson") != null ? body.get("creditCardsJson").toString() : null)
                    .build();
            saved.add(acc);
        }

        bankAccountRepository.saveAll(saved);
        return ResponseEntity.ok(Map.of("success", true, "count", saved.size(), "data", saved));
    }

    /* Cash Wallet Endpoints */
    @GetMapping("/cash-wallet")
    public ResponseEntity<Map<String, Object>> getCashWallet(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        CashWallet wallet = cashWalletRepository.findByUserId(principal.getId())
                .orElseGet(() -> CashWallet.builder()
                        .userId(principal.getId())
                        .balance(0.0)
                        .lastUpdated(LocalDateTime.now())
                        .build());
        return ResponseEntity.ok(Map.of("success", true, "data", wallet));
    }

    @PutMapping("/cash-wallet")
    public ResponseEntity<Map<String, Object>> updateCashWallet(@AuthenticationPrincipal UserPrincipal principal,
                                                                @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot update cash balance"));
        }

        CashWallet wallet = cashWalletRepository.findByUserId(principal.getId())
                .orElseGet(() -> CashWallet.builder().userId(principal.getId()).build());

        if (body.containsKey("balance") && body.get("balance") != null) {
            try {
                wallet.setBalance(Double.valueOf(body.get("balance").toString()));
            } catch (Exception ignored) {}
        }
        if (body.containsKey("notes")) {
            wallet.setNotes((String) body.get("notes"));
        }
        wallet.setLastUpdated(LocalDateTime.now());
        wallet = cashWalletRepository.save(wallet);

        return ResponseEntity.ok(Map.of("success", true, "data", wallet));
    }
}
