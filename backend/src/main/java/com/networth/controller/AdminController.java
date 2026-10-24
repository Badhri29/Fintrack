package com.networth.controller;

import com.networth.dto.UserDto;
import com.networth.entity.*;
import com.networth.repository.*;
import com.networth.security.UserPrincipal;
import com.networth.service.CategorySeedService;
import com.networth.service.EmailService;
import com.networth.service.PdfStatementService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class AdminController {

    private static final Logger logger = LoggerFactory.getLogger(AdminController.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionPlanRepository subscriptionPlanRepository;

    @Autowired
    private AccessRequestRepository accessRequestRepository;

    @Autowired
    private SystemSettingRepository systemSettingRepository;

    @Autowired
    private UserActivityLogRepository userActivityLogRepository;

    @Autowired
    private UserNotificationSettingRepository userNotificationSettingRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private SubCategoryRepository subCategoryRepository;

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private LiabilityRepository liabilityRepository;

    @Autowired
    private CategorySeedService categorySeedService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private EmailService emailService;

    @Autowired
    private PdfStatementService pdfStatementService;

    private boolean checkIsAdmin(UserPrincipal principal) {
        if (principal == null) return false;
        User user = userRepository.findById(principal.getId()).orElse(null);
        if (user == null) return false;
        String r = user.getRole();
        return r != null && (r.equalsIgnoreCase("ADMIN") || r.equalsIgnoreCase("SUPER_ADMIN"));
    }

    // =========================================================================
    // 1. ADMIN USER MANAGEMENT
    // =========================================================================

    @GetMapping("/admin/users")
    public ResponseEntity<?> getAllUsers(@AuthenticationPrincipal UserPrincipal principal) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }
        List<User> users = userRepository.findAll();
        List<UserDto> dtoList = users.stream().map(UserDto::fromEntity).collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("success", true, "data", dtoList));
    }

    @PostMapping("/admin/users")
    public ResponseEntity<?> createUser(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        String email = (String) body.get("email");
        if (email == null || !email.matches("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,6}$")) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "Please provide a valid email address (e.g. user@gmail.com)."));
        }
        String password = (String) body.get("password");
        String name = (String) body.get("name");
        String role = (String) body.getOrDefault("role", "USER");
        String tier = (String) body.get("subscriptionTier");
        if (tier == null || tier.isBlank()) {
            tier = systemSettingRepository.findBySettingKey("DEFAULT_SUBSCRIPTION_PLAN")
                    .map(SystemSetting::getSettingValue)
                    .orElse("FREE");
        }
        tier = tier.trim().toUpperCase();

        int cardLimit = 2;
        boolean canDash = true;
        boolean canRep = true;

        var planOpt = subscriptionPlanRepository.findByPlanCode(tier);
        if (planOpt.isPresent()) {
            var plan = planOpt.get();
            cardLimit = plan.getMaxCreditCards();
            canDash = plan.getCanAccessDashboard();
            canRep = plan.getCanAccessReports();
        }

        if (email == null || email.trim().isEmpty() || password == null || password.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "Email and password are required."));
        }

        String cleanEmail = email.trim().toLowerCase();
        if (userRepository.existsByEmail(cleanEmail)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("success", false, "error", "Email is already registered."));
        }

        User newUser = User.builder()
                .email(cleanEmail)
                .password(passwordEncoder.encode(password))
                .name(name != null && !name.isBlank() ? name.trim() : cleanEmail.split("@")[0])
                .role(role.toUpperCase())
                .subscriptionTier(tier)
                .cardLimit(cardLimit)
                .isVerified(true)
                .status("ACTIVE")
                .canAccessDashboard(canDash)
                .canAccessReports(canRep)
                .canEditSettings(true)
                .build();

        newUser = userRepository.save(newUser);
        categorySeedService.seedUserCategories(newUser.getId());

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("CREATE_USER")
                .details("Admin created user account for " + cleanEmail + " (Plan: " + tier + ")")
                .build());

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", UserDto.fromEntity(newUser)));
    }

    @Transactional
    @DeleteMapping("/admin/users/{id}")
    public ResponseEntity<?> deleteUser(@AuthenticationPrincipal UserPrincipal principal, @PathVariable Long id) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        if (principal.getId().equals(id)) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "Super Administrator cannot delete their own account."));
        }

        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "User not found."));
        }

        String userEmail = user.getEmail();

        try {
            transactionRepository.deleteByUserId(id);
            subCategoryRepository.deleteByUserId(id);
            categoryRepository.deleteByUserId(id);
            assetRepository.deleteByUserId(id);
            liabilityRepository.deleteByUserId(id);
            accessRequestRepository.deleteByUserId(id);
            userNotificationSettingRepository.deleteByUserId(id);
            userActivityLogRepository.deleteByUserId(id);
            userRepository.deleteById(id);

            userActivityLogRepository.save(UserActivityLog.builder()
                    .userId(principal.getId())
                    .userEmail(principal.getEmail())
                    .action("DELETE_USER")
                    .details("Permanently deleted user account for " + userEmail)
                    .build());

            return ResponseEntity.ok(Map.of("success", true, "message", "User account " + userEmail + " permanently deleted."));
        } catch (Exception e) {
            logger.error("Error deleting user {}: {}", id, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("success", false, "error", "Failed to delete user: " + e.getMessage()));
        }
    }

    @GetMapping("/admin/default-plan")
    public ResponseEntity<?> getDefaultPlan(@AuthenticationPrincipal UserPrincipal principal) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }
        String defaultPlan = systemSettingRepository.findBySettingKey("DEFAULT_SUBSCRIPTION_PLAN")
                .map(SystemSetting::getSettingValue)
                .orElse("FREE");
        return ResponseEntity.ok(Map.of("success", true, "defaultPlan", defaultPlan));
    }

    @PutMapping("/admin/default-plan")
    public ResponseEntity<?> updateDefaultPlan(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, String> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }
        String planCode = body.getOrDefault("defaultPlan", "FREE").trim().toUpperCase();
        saveSetting("DEFAULT_SUBSCRIPTION_PLAN", planCode);

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("UPDATE_DEFAULT_PLAN")
                .details("Set system default subscription plan for new users to " + planCode)
                .build());

        return ResponseEntity.ok(Map.of("success", true, "defaultPlan", planCode, "message", "Default subscription plan updated to " + planCode));
    }

    @GetMapping("/system/inactivity-timeout")
    public ResponseEntity<?> getInactivityTimeout() {
        int minutes = systemSettingRepository.findBySettingKey("INACTIVITY_TIMEOUT_MINUTES")
                .map(s -> {
                    try { return Integer.parseInt(s.getSettingValue()); } catch (Exception e) { return 15; }
                })
                .orElse(15);
        return ResponseEntity.ok(Map.of("success", true, "inactivityTimeoutMinutes", minutes));
    }

    @PutMapping("/admin/inactivity-timeout")
    public ResponseEntity<?> updateInactivityTimeout(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }
        int mins = 15;
        if (body.get("inactivityTimeoutMinutes") != null) {
            try { mins = Integer.parseInt(body.get("inactivityTimeoutMinutes").toString()); } catch (Exception ignored) {}
        }
        saveSetting("INACTIVITY_TIMEOUT_MINUTES", String.valueOf(mins));

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("UPDATE_TIMEOUT")
                .details("Set system inactivity auto-logout timeout to " + mins + " minutes")
                .build());

        return ResponseEntity.ok(Map.of("success", true, "inactivityTimeoutMinutes", mins, "message", "Inactivity timeout set to " + mins + " minutes."));
    }

    @GetMapping("/admin/default-notifications")
    public ResponseEntity<?> getDefaultNotifications(@AuthenticationPrincipal UserPrincipal principal) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }
        Map<String, Object> res = new HashMap<>();
        res.put("loginMail", "true".equalsIgnoreCase(systemSettingRepository.findBySettingKey("NOTIF_DEFAULT_LOGIN_MAIL").map(SystemSetting::getSettingValue).orElse("true")));
        res.put("requestMail", "true".equalsIgnoreCase(systemSettingRepository.findBySettingKey("NOTIF_DEFAULT_REQUEST_MAIL").map(SystemSetting::getSettingValue).orElse("true")));
        res.put("eodMail", "true".equalsIgnoreCase(systemSettingRepository.findBySettingKey("NOTIF_DEFAULT_EOD_MAIL").map(SystemSetting::getSettingValue).orElse("true")));
        res.put("eodFrequency", systemSettingRepository.findBySettingKey("NOTIF_DEFAULT_EOD_FREQ").map(SystemSetting::getSettingValue).orElse("daily"));
        res.put("softwareSound", "true".equalsIgnoreCase(systemSettingRepository.findBySettingKey("NOTIF_DEFAULT_SOUND").map(SystemSetting::getSettingValue).orElse("true")));
        return ResponseEntity.ok(Map.of("success", true, "data", res));
    }

    @PutMapping("/admin/default-notifications")
    public ResponseEntity<?> updateDefaultNotifications(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }
        if (body.containsKey("loginMail")) saveSetting("NOTIF_DEFAULT_LOGIN_MAIL", body.get("loginMail").toString());
        if (body.containsKey("requestMail")) saveSetting("NOTIF_DEFAULT_REQUEST_MAIL", body.get("requestMail").toString());
        if (body.containsKey("eodMail")) saveSetting("NOTIF_DEFAULT_EOD_MAIL", body.get("eodMail").toString());
        if (body.containsKey("eodFrequency")) saveSetting("NOTIF_DEFAULT_EOD_FREQ", body.get("eodFrequency").toString());
        if (body.containsKey("softwareSound")) saveSetting("NOTIF_DEFAULT_SOUND", body.get("softwareSound").toString());

        boolean applyToAll = Boolean.TRUE.equals(body.get("applyToAllUsers"));
        if (applyToAll) {
            List<UserNotificationSetting> allSettings = userNotificationSettingRepository.findAll();
            for (UserNotificationSetting uns : allSettings) {
                if (body.containsKey("loginMail")) uns.setLoginMail(Boolean.valueOf(body.get("loginMail").toString()));
                if (body.containsKey("requestMail")) uns.setAccessMail(Boolean.valueOf(body.get("requestMail").toString()));
                if (body.containsKey("eodMail")) uns.setEodMail(Boolean.valueOf(body.get("eodMail").toString()));
                if (body.containsKey("eodFrequency")) uns.setEodFrequency(body.get("eodFrequency").toString());
                userNotificationSettingRepository.save(uns);
            }
        }

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("UPDATE_DEFAULT_NOTIFICATIONS")
                .details("Updated system default notification rules" + (applyToAll ? " and synced across all user accounts" : ""))
                .build());

        return ResponseEntity.ok(Map.of("success", true, "message", "Default notification controls updated successfully."));
    }

    @PostMapping("/user/log-action")
    public ResponseEntity<?> logAction(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false));
        }
        String action = body.getOrDefault("action", "USER_ACTION");
        String details = body.getOrDefault("details", "");

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action(action)
                .details(details)
                .build());

        return ResponseEntity.ok(Map.of("success", true));
    }

    @PutMapping("/admin/users/{id}/permissions")
    public ResponseEntity<?> updatePermissions(@AuthenticationPrincipal UserPrincipal principal,
                                              @PathVariable Long id,
                                              @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "User not found."));
        }

        if (body.containsKey("canAccessDashboard")) {
            user.setCanAccessDashboard(Boolean.valueOf(body.get("canAccessDashboard").toString()));
        }
        if (body.containsKey("canAccessReports")) {
            user.setCanAccessReports(Boolean.valueOf(body.get("canAccessReports").toString()));
        }
        if (body.containsKey("canEditSettings")) {
            user.setCanEditSettings(Boolean.valueOf(body.get("canEditSettings").toString()));
        }
        if (body.containsKey("isReadOnly")) {
            user.setIsReadOnly(Boolean.valueOf(body.get("isReadOnly").toString()));
        }
        if (body.containsKey("status")) {
            user.setStatus(body.get("status").toString());
        }

        userRepository.save(user);

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("UPDATE_PERMISSIONS")
                .details("Updated permissions for user " + user.getEmail())
                .build());

        return ResponseEntity.ok(Map.of("success", true, "data", UserDto.fromEntity(user)));
    }

    @PutMapping("/admin/users/{id}/lock")
    public ResponseEntity<?> updateLockStatus(@AuthenticationPrincipal UserPrincipal principal,
                                            @PathVariable Long id,
                                            @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "User not found."));
        }

        String lockType = (String) body.getOrDefault("lockType", "NONE"); // NONE, TEMP, FULL, PERMANENT
        String lockReason = (String) body.get("lockReason");
        String lockUntilStr = (String) body.get("lockUntil");

        user.setLockType(lockType.toUpperCase());
        user.setLockReason(lockReason != null ? lockReason.trim() : null);

        if ("TEMP".equalsIgnoreCase(lockType)) {
            if (body.get("durationMinutes") != null) {
                long mins = ((Number) body.get("durationMinutes")).longValue();
                user.setLockUntil(LocalDateTime.now().plusMinutes(mins));
            } else if (body.get("lockHours") != null) {
                long hrs = ((Number) body.get("lockHours")).longValue();
                user.setLockUntil(LocalDateTime.now().plusHours(hrs));
            } else if (lockUntilStr != null && !lockUntilStr.isBlank()) {
                try {
                    if (lockUntilStr.endsWith("Z") || lockUntilStr.contains("+")) {
                        user.setLockUntil(java.time.Instant.parse(lockUntilStr).atZone(java.time.ZoneId.systemDefault()).toLocalDateTime());
                    } else {
                        user.setLockUntil(LocalDateTime.parse(lockUntilStr, DateTimeFormatter.ISO_DATE_TIME));
                    }
                } catch (Exception e) {
                    try {
                        user.setLockUntil(LocalDateTime.parse(lockUntilStr));
                    } catch (Exception ignored) {}
                }
            }
        } else if ("NONE".equalsIgnoreCase(lockType)) {
            user.setLockUntil(null);
            user.setLockReason(null);
            user.setStatus("ACTIVE");
        } else {
            user.setLockUntil(null);
            user.setStatus("LOCKED");
        }

        userRepository.save(user);

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("LOCK_UPDATE")
                .details("Set lockType=" + lockType + " for " + user.getEmail() + (lockReason != null ? " (" + lockReason + ")" : ""))
                .build());

        return ResponseEntity.ok(Map.of("success", true, "data", UserDto.fromEntity(user)));
    }

    @PutMapping("/admin/users/{id}/subscription")
    public ResponseEntity<?> updateSubscription(@AuthenticationPrincipal UserPrincipal principal,
                                               @PathVariable Long id,
                                               @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "User not found."));
        }

        String tier = null;
        if (body.containsKey("subscriptionTier")) tier = body.get("subscriptionTier").toString().toUpperCase();
        if (body.containsKey("planCode")) tier = body.get("planCode").toString().toUpperCase();

        if (tier != null) {
            Optional<SubscriptionPlan> planOpt = subscriptionPlanRepository.findByPlanCode(tier);
            if (planOpt.isPresent()) {
                SubscriptionPlan plan = planOpt.get();
                user.setSubscriptionTier(plan.getPlanCode());
                user.setCardLimit(plan.getMaxCreditCards());
                user.setCanAccessDashboard(plan.getCanAccessDashboard());
                user.setCanAccessReports(plan.getCanAccessReports());
            } else {
                user.setSubscriptionTier(tier);
                if (!body.containsKey("cardLimit")) {
                    if ("FREE".equals(tier)) user.setCardLimit(2);
                    else if ("PRO".equals(tier)) user.setCardLimit(5);
                    else if ("ENTERPRISE".equals(tier)) user.setCardLimit(99);
                }
            }
        }

        if (body.containsKey("cardLimit")) {
            user.setCardLimit(Integer.valueOf(body.get("cardLimit").toString()));
        }

        userRepository.save(user);

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("UPDATE_SUBSCRIPTION")
                .details("Assigned subscription plan " + user.getSubscriptionTier() + " (Card Limit: " + user.getCardLimit() + ") to " + user.getEmail())
                .build());

        return ResponseEntity.ok(Map.of("success", true, "data", UserDto.fromEntity(user)));
    }

    private void applyPlanToUser(User user, String tierCode) {
        if (user == null || tierCode == null) return;
        String cleanTier = tierCode.toUpperCase().trim();
        Optional<SubscriptionPlan> planOpt = subscriptionPlanRepository.findByPlanCode(cleanTier);
        if (planOpt.isPresent()) {
            SubscriptionPlan plan = planOpt.get();
            user.setSubscriptionTier(plan.getPlanCode());
            user.setCardLimit(plan.getMaxCreditCards() != null ? plan.getMaxCreditCards() : 2);
            user.setCanAccessDashboard(plan.getCanAccessDashboard() != null ? plan.getCanAccessDashboard() : true);
            user.setCanAccessReports(plan.getCanAccessReports() != null ? plan.getCanAccessReports() : false);
        } else {
            user.setSubscriptionTier(cleanTier);
            if ("FREE".equals(cleanTier)) {
                user.setCardLimit(2);
                user.setCanAccessDashboard(true);
                user.setCanAccessReports(false);
            } else if ("PRO".equals(cleanTier)) {
                user.setCardLimit(5);
                user.setCanAccessDashboard(true);
                user.setCanAccessReports(true);
            } else if ("ENTERPRISE".equals(cleanTier)) {
                user.setCardLimit(99);
                user.setCanAccessDashboard(true);
                user.setCanAccessReports(true);
            }
        }
        userRepository.save(user);
    }

    @PostMapping("/admin/users/{id}/generate-temp-password")
    public ResponseEntity<?> generateTempPassword(@AuthenticationPrincipal UserPrincipal principal,
                                                 @PathVariable Long id,
                                                 @RequestBody(required = false) Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "User not found."));
        }

        int durationMinutes = 15;
        if (body != null && body.containsKey("durationMinutes")) {
            try {
                durationMinutes = Integer.parseInt(body.get("durationMinutes").toString());
            } catch (Exception ignored) {}
        }
        if (durationMinutes <= 0) durationMinutes = 15;

        String rawTempPassword = generateSecureTempPassword();
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(durationMinutes);

        user.setPassword(passwordEncoder.encode(rawTempPassword));
        user.setIsTemporaryPassword(true);
        user.setTemporaryPasswordExpiresAt(expiresAt);
        user.setMustChangePassword(true);
        user.setStatus("ACTIVE");
        user.setLockType("NONE");
        user = userRepository.save(user);

        // Async email notification to user
        final String userEmail = user.getEmail();
        final String userName = user.getName();
        final int finalDuration = durationMinutes;
        final String expiryStr = expiresAt.format(DateTimeFormatter.ofPattern("HH:mm, dd MMM yyyy"));
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                emailService.sendTemporaryPasswordEmail(userEmail, userName, rawTempPassword, finalDuration, expiryStr);
            } catch (Exception ignored) {}
        });

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("GENERATE_TEMP_PASSWORD")
                .details("Generated temporary password for " + user.getEmail() + " (Valid for " + durationMinutes + " mins)")
                .build());

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("tempPassword", rawTempPassword);
        res.put("durationMinutes", durationMinutes);
        res.put("expiresAt", expiresAt.toString());
        res.put("userEmail", user.getEmail());
        res.put("userName", user.getName());
        res.put("message", "Single-use temporary password generated successfully. Valid for " + durationMinutes + " minutes.");

        return ResponseEntity.ok(res);
    }

    private String generateSecureTempPassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        java.security.SecureRandom random = new java.security.SecureRandom();
        StringBuilder sb = new StringBuilder("Tmp@");
        for (int i = 0; i < 5; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }

    @GetMapping({"/subscription-plans", "/admin/subscription-plans"})
    public ResponseEntity<?> getSubscriptionPlans() {
        List<SubscriptionPlan> plans = subscriptionPlanRepository.findAll();
        return ResponseEntity.ok(Map.of("success", true, "data", plans));
    }

    @PostMapping("/admin/subscription-plans")
    public ResponseEntity<?> createSubscriptionPlan(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        String planCode = (String) body.get("planCode");
        String planName = (String) body.get("planName");
        if (planCode == null || planName == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "planCode and planName are required."));
        }

        SubscriptionPlan plan = SubscriptionPlan.builder()
                .planCode(planCode.toUpperCase().trim())
                .planName(planName.trim())
                .price(body.containsKey("price") ? Double.valueOf(body.get("price").toString()) : 0.0)
                .currency((String) body.getOrDefault("currency", "INR"))
                .billingPeriod((String) body.getOrDefault("billingPeriod", "MONTHLY"))
                .maxCreditCards(body.containsKey("maxCreditCards") ? Integer.valueOf(body.get("maxCreditCards").toString()) : 2)
                .canAccessDashboard(Boolean.valueOf(body.getOrDefault("canAccessDashboard", true).toString()))
                .canAccessReports(Boolean.valueOf(body.getOrDefault("canAccessReports", false).toString()))
                .canAccessLoans(Boolean.valueOf(body.getOrDefault("canAccessLoans", true).toString()))
                .canAccessBudget(Boolean.valueOf(body.getOrDefault("canAccessBudget", true).toString()))
                .canExportData(Boolean.valueOf(body.getOrDefault("canExportData", false).toString()))
                .canUseEodDigest(Boolean.valueOf(body.getOrDefault("canUseEodDigest", false).toString()))
                .description((String) body.getOrDefault("description", ""))
                .isActive(Boolean.valueOf(body.getOrDefault("isActive", true).toString()))
                .build();

        plan = subscriptionPlanRepository.save(plan);

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("CREATE_PLAN")
                .details("Created subscription plan: " + plan.getPlanCode())
                .build());

        return ResponseEntity.ok(Map.of("success", true, "data", plan));
    }

    @PutMapping("/admin/subscription-plans/{id}")
    public ResponseEntity<?> updateSubscriptionPlan(@AuthenticationPrincipal UserPrincipal principal,
                                                   @PathVariable Long id,
                                                   @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        SubscriptionPlan plan = subscriptionPlanRepository.findById(id).orElse(null);
        if (plan == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "Plan not found."));
        }

        if (body.containsKey("planName")) plan.setPlanName((String) body.get("planName"));
        if (body.containsKey("price")) plan.setPrice(Double.valueOf(body.get("price").toString()));
        if (body.containsKey("billingPeriod")) plan.setBillingPeriod((String) body.get("billingPeriod"));
        if (body.containsKey("maxCreditCards")) plan.setMaxCreditCards(Integer.valueOf(body.get("maxCreditCards").toString()));
        if (body.containsKey("canAccessDashboard")) plan.setCanAccessDashboard(Boolean.valueOf(body.get("canAccessDashboard").toString()));
        if (body.containsKey("canAccessReports")) plan.setCanAccessReports(Boolean.valueOf(body.get("canAccessReports").toString()));
        if (body.containsKey("canAccessLoans")) plan.setCanAccessLoans(Boolean.valueOf(body.get("canAccessLoans").toString()));
        if (body.containsKey("canAccessBudget")) plan.setCanAccessBudget(Boolean.valueOf(body.get("canAccessBudget").toString()));
        if (body.containsKey("canExportData")) plan.setCanExportData(Boolean.valueOf(body.get("canExportData").toString()));
        if (body.containsKey("canUseEodDigest")) plan.setCanUseEodDigest(Boolean.valueOf(body.get("canUseEodDigest").toString()));
        if (body.containsKey("description")) plan.setDescription((String) body.get("description"));
        if (body.containsKey("isActive")) plan.setIsActive(Boolean.valueOf(body.get("isActive").toString()));

        subscriptionPlanRepository.save(plan);

        // Auto-sync all users enrolled in this plan
        List<User> subscribedUsers = userRepository.findAll().stream()
                .filter(u -> plan.getPlanCode().equalsIgnoreCase(u.getSubscriptionTier()))
                .collect(Collectors.toList());
        for (User u : subscribedUsers) {
            u.setCardLimit(plan.getMaxCreditCards());
            u.setCanAccessDashboard(plan.getCanAccessDashboard());
            u.setCanAccessReports(plan.getCanAccessReports());
            userRepository.save(u);
        }

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("UPDATE_PLAN")
                .details("Updated plan " + plan.getPlanCode() + ": synced " + subscribedUsers.size() + " user entitlements")
                .build());

        return ResponseEntity.ok(Map.of("success", true, "data", plan, "affectedUsers", subscribedUsers.size()));
    }

    @GetMapping("/admin/users/{id}/dashboard")
    public ResponseEntity<?> getUserDashboardSummary(@AuthenticationPrincipal UserPrincipal principal, @PathVariable Long id) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "User not found."));
        }

        LocalDate now = LocalDate.now();
        LocalDate startOfMonth = now.withDayOfMonth(1);
        LocalDate endOfMonth = now.withDayOfMonth(now.lengthOfMonth());

        List<Transaction> allTxs = transactionRepository.findByUserIdOrderByDateDesc(id);
        allTxs.sort((a, b) -> {
            if (a.getDate() == null && b.getDate() == null) return 0;
            if (a.getDate() == null) return 1;
            if (b.getDate() == null) return -1;
            int cmp = b.getDate().compareTo(a.getDate());
            if (cmp != 0) return cmp;
            return Long.compare(b.getId() != null ? b.getId() : 0, a.getId() != null ? a.getId() : 0);
        });
        List<Transaction> currentMonthTxs = allTxs.stream()
                .filter(t -> t.getDate() != null && !t.getDate().isBefore(startOfMonth) && !t.getDate().isAfter(endOfMonth))
                .collect(Collectors.toList());

        double totalIncome = currentMonthTxs.stream()
                .filter(t -> "income".equalsIgnoreCase(t.getType()))
                .mapToDouble(t -> t.getAmount() != null ? t.getAmount() : 0.0).sum();

        double totalExpense = currentMonthTxs.stream()
                .filter(t -> "expense".equalsIgnoreCase(t.getType()))
                .mapToDouble(t -> t.getAmount() != null ? t.getAmount() : 0.0).sum();

        double totalSavings = currentMonthTxs.stream()
                .filter(t -> "savings".equalsIgnoreCase(t.getType()))
                .mapToDouble(t -> t.getAmount() != null ? t.getAmount() : 0.0).sum();

        double totalAssets = assetRepository.findByUserId(id).stream()
                .mapToDouble(a -> a.getValue() != null ? a.getValue() : 0.0).sum();

        double totalLiabilities = liabilityRepository.findByUserId(id).stream()
                .mapToDouble(l -> l.getValue() != null ? l.getValue() : 0.0).sum();

        double netWorth = totalAssets - totalLiabilities + (totalIncome - totalExpense);

        List<Transaction> last10Transactions = allTxs.stream().limit(10).collect(Collectors.toList());

        Map<String, Object> summary = new HashMap<>();
        summary.put("user", UserDto.fromEntity(user));
        summary.put("currentMonth", now.getMonth().name() + " " + now.getYear());
        summary.put("income", totalIncome);
        summary.put("expense", totalExpense);
        summary.put("savings", totalSavings);
        summary.put("netWorth", netWorth);
        summary.put("totalTransactionsCount", allTxs.size());
        summary.put("last10Transactions", last10Transactions);

        return ResponseEntity.ok(Map.of("success", true, "data", summary));
    }

    // =========================================================================
    // 2. ACCESS REQUESTS (USER & ADMIN)
    // =========================================================================

    @PostMapping("/access-requests")
    public ResponseEntity<?> submitAccessRequest(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "error", "Unauthorized"));
        }

        String requestType = body.get("requestType");
        String details = body.get("details");

        if (requestType == null || requestType.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "Request type is required."));
        }

        AccessRequest req = AccessRequest.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .userName(principal.getUser().getName())
                .requestType(requestType.trim())
                .details(details != null ? details.trim() : "Requested access")
                .status("PENDING")
                .build();

        req = accessRequestRepository.save(req);

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("ACCESS_REQUEST")
                .details("Raised request for: " + requestType)
                .build());

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", req, "message", "Request submitted to administrator successfully."));
    }

    @GetMapping("/access-requests/my")
    public ResponseEntity<?> getMyAccessRequests(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "error", "Unauthorized"));
        }
        List<AccessRequest> list = accessRequestRepository.findByUserIdOrderByCreatedAtDesc(principal.getId());
        return ResponseEntity.ok(Map.of("success", true, "data", list));
    }

    @GetMapping("/admin/access-requests")
    public ResponseEntity<?> getAllAccessRequests(@AuthenticationPrincipal UserPrincipal principal) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }
        List<AccessRequest> list = accessRequestRepository.findAllByOrderByCreatedAtDesc();
        return ResponseEntity.ok(Map.of("success", true, "data", list));
    }

    @PutMapping({"/admin/access-requests/{id}/status", "/admin/access-requests/{id}"})
    public ResponseEntity<?> updateAccessRequestStatus(@AuthenticationPrincipal UserPrincipal principal,
                                                      @PathVariable Long id,
                                                      @RequestBody Map<String, String> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        AccessRequest req = accessRequestRepository.findById(id).orElse(null);
        if (req == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "Request not found."));
        }

        String status = body.getOrDefault("status", "APPROVED").toUpperCase();
        String adminNote = body.get("adminNote");

        req.setStatus(status);
        req.setAdminNote(adminNote);
        accessRequestRepository.save(req);

        // If APPROVED, auto-grant permissions / limit increase / plan upgrade
        User targetUser = userRepository.findById(req.getUserId()).orElse(null);
        if (targetUser != null && "APPROVED".equals(status)) {
            String type = req.getRequestType().toUpperCase();
            if (type.contains("ENTERPRISE")) {
                applyPlanToUser(targetUser, "ENTERPRISE");
            } else if (type.contains("PRO")) {
                applyPlanToUser(targetUser, "PRO");
            } else if (type.contains("PLAN") || type.contains("SUBSCRIPTION")) {
                String nextTier = "FREE".equalsIgnoreCase(targetUser.getSubscriptionTier()) ? "PRO" : "ENTERPRISE";
                applyPlanToUser(targetUser, nextTier);
            } else if (type.contains("CARD")) {
                if ("FREE".equalsIgnoreCase(targetUser.getSubscriptionTier())) {
                    applyPlanToUser(targetUser, "PRO");
                } else {
                    int currentLimit = targetUser.getCardLimit() != null ? targetUser.getCardLimit() : 2;
                    targetUser.setCardLimit(currentLimit + 3);
                    userRepository.save(targetUser);
                }
            } else if (type.contains("DASHBOARD")) {
                targetUser.setCanAccessDashboard(true);
                userRepository.save(targetUser);
            } else if (type.contains("REPORT")) {
                targetUser.setCanAccessReports(true);
                userRepository.save(targetUser);
            } else if (type.contains("UNLOCK")) {
                targetUser.setLockType("NONE");
                targetUser.setStatus("ACTIVE");
                userRepository.save(targetUser);
            } else {
                userRepository.save(targetUser);
            }

            // Send notification email
            emailService.sendAccessRequestStatusEmail(targetUser.getEmail(), targetUser.getName(), req.getRequestType(), status, adminNote);
        }

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("REVIEW_ACCESS_REQUEST")
                .details("Admin " + status + " request ID " + id + " for " + req.getUserEmail())
                .build());

        return ResponseEntity.ok(Map.of("success", true, "data", req));
    }

    // =========================================================================
    // 3. SCHEDULED SYSTEM MAINTENANCE
    // =========================================================================

    @GetMapping("/system/maintenance")
    public ResponseEntity<?> getMaintenanceStatus() {
        Optional<SystemSetting> activeSetting = systemSettingRepository.findBySettingKey("MAINTENANCE_ACTIVE");
        Optional<SystemSetting> msgSetting = systemSettingRepository.findBySettingKey("MAINTENANCE_MESSAGE");
        Optional<SystemSetting> startSetting = systemSettingRepository.findBySettingKey("MAINTENANCE_START");
        Optional<SystemSetting> endSetting = systemSettingRepository.findBySettingKey("MAINTENANCE_END");

        boolean isActive = activeSetting.isPresent() && "true".equalsIgnoreCase(activeSetting.get().getSettingValue());
        String msg = msgSetting.map(SystemSetting::getSettingValue).orElse("Scheduled system maintenance is currently underway. Operations are temporarily restricted.");
        String start = startSetting.map(SystemSetting::getSettingValue).orElse(null);
        String end = endSetting.map(SystemSetting::getSettingValue).orElse(null);

        Map<String, Object> map = new HashMap<>();
        map.put("active", isActive);
        map.put("message", msg);
        map.put("startTime", start);
        map.put("endTime", end);

        return ResponseEntity.ok(Map.of("success", true, "data", map));
    }

    @PostMapping("/admin/maintenance")
    public ResponseEntity<?> updateMaintenance(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, Object> body) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        Boolean active = (Boolean) body.getOrDefault("active", false);
        String message = (String) body.getOrDefault("message", "Scheduled maintenance in progress.");
        String startTime = (String) body.get("startTime");
        String endTime = (String) body.get("endTime");

        saveSetting("MAINTENANCE_ACTIVE", String.valueOf(active));
        saveSetting("MAINTENANCE_MESSAGE", message);
        saveSetting("MAINTENANCE_START", startTime != null ? startTime : "");
        saveSetting("MAINTENANCE_END", endTime != null ? endTime : "");

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(principal.getId())
                .userEmail(principal.getEmail())
                .action("MAINTENANCE_TOGGLE")
                .details("Maintenance mode set to: " + active + " (" + message + ")")
                .build());

        // Notify users asynchronously if enabled
        if (active) {
            final String scheduledWindow = (startTime != null && endTime != null) ? startTime + " to " + endTime : (endTime != null ? "Until " + endTime : null);
            java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    List<User> users = userRepository.findAll();
                    for (User u : users) {
                        if (u.getEmail() != null && !u.getEmail().equalsIgnoreCase("demo@fintrack.io")) {
                            emailService.sendMaintenanceAlertEmail(u.getEmail(), u.getName(), message, scheduledWindow);
                        }
                    }
                } catch (Exception e) {
                    // Log and ignore
                }
            });
        }

        return ResponseEntity.ok(Map.of("success", true, "message", "Maintenance settings updated successfully."));
    }

    private void saveSetting(String key, String val) {
        SystemSetting s = systemSettingRepository.findBySettingKey(key).orElseGet(() -> SystemSetting.builder().settingKey(key).build());
        s.setSettingValue(val);
        systemSettingRepository.save(s);
    }

    // =========================================================================
    // 4. USER ACTIVITY LOGS
    // =========================================================================

    @GetMapping("/admin/logs")
    public ResponseEntity<?> getLogs(@AuthenticationPrincipal UserPrincipal principal,
                                    @RequestParam(required = false) Long userId,
                                    @RequestParam(defaultValue = "50") int limit) {
        if (!checkIsAdmin(principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "error", "Super admin access required."));
        }

        List<UserActivityLog> logs;
        if (userId != null) {
            logs = userActivityLogRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, limit));
        } else {
            logs = userActivityLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, limit));
        }

        return ResponseEntity.ok(Map.of("success", true, "data", logs));
    }

    // =========================================================================
    // 5. USER NOTIFICATION PREFERENCES & EOD DISPATCH
    // =========================================================================

    @GetMapping("/user/notification-settings")
    public ResponseEntity<?> getNotificationSettings(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "error", "Unauthorized"));
        }

        UserNotificationSetting setting = userNotificationSettingRepository.findByUserId(principal.getId())
                .orElseGet(() -> userNotificationSettingRepository.save(UserNotificationSetting.builder().userId(principal.getId()).build()));

        return ResponseEntity.ok(Map.of("success", true, "data", setting));
    }

    @PutMapping("/user/notification-settings")
    public ResponseEntity<?> updateNotificationSettings(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "error", "Unauthorized"));
        }

        UserNotificationSetting s = userNotificationSettingRepository.findByUserId(principal.getId())
                .orElseGet(() -> UserNotificationSetting.builder().userId(principal.getId()).build());

        if (body.containsKey("txSoftware")) s.setTxSoftware(Boolean.valueOf(body.get("txSoftware").toString()));
        if (body.containsKey("txMail")) s.setTxMail(Boolean.valueOf(body.get("txMail").toString()));
        if (body.containsKey("logoutMail")) s.setLogoutMail(Boolean.valueOf(body.get("logoutMail").toString()));
        if (body.containsKey("pwdResetSoftware")) s.setPwdResetSoftware(Boolean.valueOf(body.get("pwdResetSoftware").toString()));
        if (body.containsKey("pwdResetMail")) s.setPwdResetMail(Boolean.valueOf(body.get("pwdResetMail").toString()));
        if (body.containsKey("eodMail")) s.setEodMail(Boolean.valueOf(body.get("eodMail").toString()));
        if (body.containsKey("eodFrequency")) s.setEodFrequency(body.get("eodFrequency").toString());
        if (body.containsKey("eodTime")) s.setEodTime(body.get("eodTime").toString());
        if (body.containsKey("accessSoftware")) s.setAccessSoftware(Boolean.valueOf(body.get("accessSoftware").toString()));
        if (body.containsKey("accessMail")) s.setAccessMail(Boolean.valueOf(body.get("accessMail").toString()));
        if (body.containsKey("loginMail")) s.setLoginMail(Boolean.valueOf(body.get("loginMail").toString()));
        if (body.containsKey("maintenanceSoftware")) s.setMaintenanceSoftware(Boolean.valueOf(body.get("maintenanceSoftware").toString()));
        if (body.containsKey("maintenanceMail")) s.setMaintenanceMail(Boolean.valueOf(body.get("maintenanceMail").toString()));

        s = userNotificationSettingRepository.save(s);
        return ResponseEntity.ok(Map.of("success", true, "data", s, "message", "Notification preferences saved."));
    }

    @PostMapping("/user/trigger-eod")
    public ResponseEntity<?> triggerEodReportNow(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "error", "Unauthorized"));
        }

        Long userId = principal.getId();
        User user = principal.getUser();
        LocalDate today = LocalDate.now();

        List<Transaction> txs = transactionRepository.findByUserIdAndDate(userId, today);
        double income = txs.stream().filter(t -> "income".equalsIgnoreCase(t.getType())).mapToDouble(t -> t.getAmount() != null ? t.getAmount() : 0.0).sum();
        double expense = txs.stream().filter(t -> "expense".equalsIgnoreCase(t.getType())).mapToDouble(t -> t.getAmount() != null ? t.getAmount() : 0.0).sum();
        double savings = txs.stream().filter(t -> "savings".equalsIgnoreCase(t.getType())).mapToDouble(t -> t.getAmount() != null ? t.getAmount() : 0.0).sum();

        Map<String, Double> catMap = new HashMap<>();
        for (Transaction t : txs) {
            String cat = t.getCategory() != null ? t.getCategory() : "General";
            catMap.put(cat, catMap.getOrDefault(cat, 0.0) + (t.getAmount() != null ? t.getAmount() : 0.0));
        }

        List<Map<String, Object>> catList = new ArrayList<>();
        catMap.forEach((k, v) -> {
            Map<String, Object> m = new HashMap<>();
            m.put("name", k);
            m.put("amount", String.format("%.2f", v));
            catList.add(m);
        });

        byte[] pdfBytes = pdfStatementService.generateDailyEodStatementPdf(user, today.toString(), income, expense, savings, catList, txs);
        boolean sent = emailService.sendEodSummaryEmail(user.getEmail(), user.getName(), today.toString(), income, expense, savings, catList, pdfBytes);

        return ResponseEntity.ok(Map.of("success", true, "sent", sent, "message", "End of Day financial digest sent to " + user.getEmail()));
    }

    // =========================================================================
    // 6. GRANULAR DATA RESETS (USER-SCOPED)
    // =========================================================================

    @Transactional
    @PostMapping("/user/reset-section")
    public ResponseEntity<?> resetSection(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "error", "Unauthorized"));
        }

        Long userId = principal.getId();
        String section = body.getOrDefault("section", "").trim().toLowerCase(); // categories, loans, cards, entire_app

        switch (section) {
            case "categories":
                subCategoryRepository.deleteByUserId(userId);
                categoryRepository.deleteByUserId(userId);
                categorySeedService.seedUserCategories(userId);
                userActivityLogRepository.save(UserActivityLog.builder()
                        .userId(userId).userEmail(principal.getEmail()).action("RESET_CATEGORIES")
                        .details("Reset custom categories back to defaults").build());
                return ResponseEntity.ok(Map.of("success", true, "message", "Categories and subcategories reset to defaults successfully."));

            case "entire_app":
            case "all":
                transactionRepository.deleteByUserId(userId);
                assetRepository.deleteByUserId(userId);
                liabilityRepository.deleteByUserId(userId);
                subCategoryRepository.deleteByUserId(userId);
                categoryRepository.deleteByUserId(userId);
                categorySeedService.seedUserCategories(userId);
                userActivityLogRepository.save(UserActivityLog.builder()
                        .userId(userId).userEmail(principal.getEmail()).action("RESET_ENTIRE_APP")
                        .details("Factory reset entire account data").build());
                return ResponseEntity.ok(Map.of("success", true, "message", "Entire account data has been reset to a fresh start."));

            case "loans":
            case "cards":
                // Handled on client-side localStorage scoping + logged here
                userActivityLogRepository.save(UserActivityLog.builder()
                        .userId(userId).userEmail(principal.getEmail()).action("RESET_" + section.toUpperCase())
                        .details("User reset " + section + " section data").build());
                return ResponseEntity.ok(Map.of("success", true, "message", section.toUpperCase() + " section data reset successfully."));

            default:
                return ResponseEntity.badRequest().body(Map.of("success", false, "error", "Invalid section specified for reset."));
        }
    }

    @PostMapping("/user/heartbeat")
    public ResponseEntity<?> userHeartbeat(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal != null && principal.getId() != null) {
            userRepository.findById(principal.getId()).ifPresent(u -> {
                u.setLastActivityAt(LocalDateTime.now());
                userRepository.save(u);
            });
        }
        return ResponseEntity.ok(Map.of("success", true, "online", true));
    }
}
