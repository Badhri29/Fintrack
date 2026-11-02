package com.networth.controller;

import com.networth.entity.CreditCard;
import com.networth.entity.CreditCardTransaction;
import com.networth.repository.CreditCardRepository;
import com.networth.repository.CreditCardTransactionRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/credit-cards")
public class CreditCardController {

    @Autowired
    private CreditCardRepository creditCardRepository;

    @Autowired
    private CreditCardTransactionRepository creditCardTransactionRepository;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getCards(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        List<CreditCard> cards = creditCardRepository.findByUserIdOrderByCreatedAtAsc(principal.getId());
        return ResponseEntity.ok(Map.of("success", true, "data", cards));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createCard(@AuthenticationPrincipal UserPrincipal principal,
                                                          @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot create credit cards"));
        }

        String id = (String) body.getOrDefault("id", "card-" + System.currentTimeMillis());
        String name = (String) body.get("name");
        String bank = (String) body.getOrDefault("bank", "Bank");
        String network = (String) body.getOrDefault("network", "Visa");
        String last4 = (String) body.getOrDefault("last4", "0000");

        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Card name is required"));
        }

        Double limit = 0.0;
        if (body.get("limit") != null) {
            try {
                limit = Double.valueOf(body.get("limit").toString());
            } catch (Exception ignored) {}
        }

        Integer billingDay = 1;
        if (body.get("billingDay") != null) {
            try {
                billingDay = Integer.valueOf(body.get("billingDay").toString());
            } catch (Exception ignored) {}
        }

        Integer dueDay = 1;
        if (body.get("dueDay") != null) {
            try {
                dueDay = Integer.valueOf(body.get("dueDay").toString());
            } catch (Exception ignored) {}
        }

        CreditCard card = CreditCard.builder()
                .id(id)
                .userId(principal.getId())
                .name(name)
                .bank(bank)
                .network(network)
                .cardNumber((String) body.get("cardNumber"))
                .last4(last4)
                .expiryMonth(body.get("expiryMonth") != null ? Integer.valueOf(body.get("expiryMonth").toString()) : null)
                .expiryYear(body.get("expiryYear") != null ? Integer.valueOf(body.get("expiryYear").toString()) : null)
                .cvv((String) body.get("cvv"))
                .limit(limit)
                .billingDay(billingDay)
                .dueDay(dueDay)
                .gradient((String) body.get("gradient"))
                .accent((String) body.get("accent"))
                .isActive(!Boolean.FALSE.equals(body.get("isActive")))
                .isAddon(Boolean.TRUE.equals(body.get("isAddon")))
                .primaryCardId((String) body.get("primaryCardId"))
                .holderName((String) body.get("holderName"))
                .build();

        card = creditCardRepository.save(card);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", card));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateCard(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable String id,
                                                          @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot update credit cards"));
        }

        Optional<CreditCard> opt = creditCardRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Credit card not found"));
        }

        CreditCard card = opt.get();
        if (body.containsKey("name")) card.setName((String) body.get("name"));
        if (body.containsKey("bank")) card.setBank((String) body.get("bank"));
        if (body.containsKey("network")) card.setNetwork((String) body.get("network"));
        if (body.containsKey("cardNumber")) card.setCardNumber((String) body.get("cardNumber"));
        if (body.containsKey("last4")) card.setLast4((String) body.get("last4"));
        if (body.containsKey("expiryMonth") && body.get("expiryMonth") != null) card.setExpiryMonth(Integer.valueOf(body.get("expiryMonth").toString()));
        if (body.containsKey("expiryYear") && body.get("expiryYear") != null) card.setExpiryYear(Integer.valueOf(body.get("expiryYear").toString()));
        if (body.containsKey("cvv")) card.setCvv((String) body.get("cvv"));
        if (body.containsKey("limit") && body.get("limit") != null) {
            try {
                card.setLimit(Double.valueOf(body.get("limit").toString()));
            } catch (Exception ignored) {}
        }
        if (body.containsKey("billingDay") && body.get("billingDay") != null) card.setBillingDay(Integer.valueOf(body.get("billingDay").toString()));
        if (body.containsKey("dueDay") && body.get("dueDay") != null) card.setDueDay(Integer.valueOf(body.get("dueDay").toString()));
        if (body.containsKey("gradient")) card.setGradient((String) body.get("gradient"));
        if (body.containsKey("accent")) card.setAccent((String) body.get("accent"));
        if (body.containsKey("isActive")) card.setIsActive(!Boolean.FALSE.equals(body.get("isActive")));
        if (body.containsKey("isAddon")) card.setIsAddon(Boolean.TRUE.equals(body.get("isAddon")));
        if (body.containsKey("primaryCardId")) card.setPrimaryCardId((String) body.get("primaryCardId"));
        if (body.containsKey("holderName")) card.setHolderName((String) body.get("holderName"));

        card = creditCardRepository.save(card);
        return ResponseEntity.ok(Map.of("success", true, "data", card));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteCard(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable String id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot delete credit cards"));
        }

        Optional<CreditCard> opt = creditCardRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Credit card not found"));
        }

        creditCardTransactionRepository.deleteByCardIdAndUserId(id, principal.getId());
        creditCardRepository.delete(opt.get());
        return ResponseEntity.ok(Map.of("success", true, "message", "Credit card deleted successfully"));
    }

    @PostMapping("/sync")
    @Transactional
    public ResponseEntity<Map<String, Object>> syncCards(@AuthenticationPrincipal UserPrincipal principal,
                                                         @RequestBody List<Map<String, Object>> cardsList) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot sync credit cards"));
        }

        List<CreditCard> saved = new ArrayList<>();
        for (Map<String, Object> body : cardsList) {
            String id = (String) body.get("id");
            if (id == null || id.trim().isEmpty()) {
                id = "card-" + UUID.randomUUID().toString().substring(0, 8);
            }

            Double limit = 0.0;
            if (body.get("limit") != null) {
                try {
                    limit = Double.valueOf(body.get("limit").toString());
                } catch (Exception ignored) {}
            }

            Integer billingDay = 1;
            if (body.get("billingDay") != null) {
                try {
                    billingDay = Integer.valueOf(body.get("billingDay").toString());
                } catch (Exception ignored) {}
            }

            Integer dueDay = 1;
            if (body.get("dueDay") != null) {
                try {
                    dueDay = Integer.valueOf(body.get("dueDay").toString());
                } catch (Exception ignored) {}
            }

            CreditCard card = CreditCard.builder()
                    .id(id)
                    .userId(principal.getId())
                    .name((String) body.getOrDefault("name", "Card"))
                    .bank((String) body.getOrDefault("bank", "Bank"))
                    .network((String) body.getOrDefault("network", "Visa"))
                    .cardNumber((String) body.get("cardNumber"))
                    .last4((String) body.getOrDefault("last4", "0000"))
                    .expiryMonth(body.get("expiryMonth") != null ? Integer.valueOf(body.get("expiryMonth").toString()) : null)
                    .expiryYear(body.get("expiryYear") != null ? Integer.valueOf(body.get("expiryYear").toString()) : null)
                    .cvv((String) body.get("cvv"))
                    .limit(limit)
                    .billingDay(billingDay)
                    .dueDay(dueDay)
                    .gradient((String) body.get("gradient"))
                    .accent((String) body.get("accent"))
                    .isActive(!Boolean.FALSE.equals(body.get("isActive")))
                    .isAddon(Boolean.TRUE.equals(body.get("isAddon")))
                    .primaryCardId((String) body.get("primaryCardId"))
                    .holderName((String) body.get("holderName"))
                    .build();
            saved.add(card);
        }

        creditCardRepository.saveAll(saved);
        return ResponseEntity.ok(Map.of("success", true, "count", saved.size(), "data", saved));
    }

    /* Card Transactions & Bill Pay */
    @GetMapping("/{id}/transactions")
    public ResponseEntity<Map<String, Object>> getCardTransactions(@AuthenticationPrincipal UserPrincipal principal,
                                                                   @PathVariable String id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        List<CreditCardTransaction> txs = creditCardTransactionRepository.findByCardIdAndUserIdOrderByCreatedAtDesc(id, principal.getId());
        return ResponseEntity.ok(Map.of("success", true, "data", txs));
    }

    @PostMapping("/{id}/transactions")
    public ResponseEntity<Map<String, Object>> addCardTransaction(@AuthenticationPrincipal UserPrincipal principal,
                                                                  @PathVariable String id,
                                                                  @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot record card transactions"));
        }

        String txId = (String) body.getOrDefault("id", "cctx-" + System.currentTimeMillis());
        Double amount = 0.0;
        if (body.get("amount") != null) {
            try {
                amount = Double.valueOf(body.get("amount").toString());
            } catch (Exception ignored) {}
        }

        CreditCardTransaction tx = CreditCardTransaction.builder()
                .id(txId)
                .cardId(id)
                .userId(principal.getId())
                .date((String) body.getOrDefault("date", java.time.LocalDate.now().toString()))
                .description((String) body.getOrDefault("description", "Credit Card Transaction"))
                .amount(amount)
                .category((String) body.get("category"))
                .type((String) body.getOrDefault("type", "DEBIT"))
                .build();

        tx = creditCardTransactionRepository.save(tx);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", tx));
    }

    @PostMapping("/{id}/pay-bill")
    public ResponseEntity<Map<String, Object>> payBill(@AuthenticationPrincipal UserPrincipal principal,
                                                       @PathVariable String id,
                                                       @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isViewOnly()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "View-only members cannot pay bills"));
        }

        Double amount = 0.0;
        if (body.get("amount") != null) {
            try {
                amount = Double.valueOf(body.get("amount").toString());
            } catch (Exception ignored) {}
        }

        String txId = "cctx-pay-" + System.currentTimeMillis();
        CreditCardTransaction tx = CreditCardTransaction.builder()
                .id(txId)
                .cardId(id)
                .userId(principal.getId())
                .date((String) body.getOrDefault("date", java.time.LocalDate.now().toString()))
                .description("Credit Card Bill Payment")
                .amount(amount)
                .category("Bill Payment")
                .type("CREDIT")
                .build();

        tx = creditCardTransactionRepository.save(tx);
        return ResponseEntity.ok(Map.of("success", true, "message", "Card bill payment recorded successfully", "data", tx));
    }
}
