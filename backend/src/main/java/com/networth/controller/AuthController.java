package com.networth.controller;

import com.networth.dto.AuthRequest;
import com.networth.dto.AuthResponse;
import com.networth.dto.UserDto;
import com.networth.entity.SystemSetting;
import com.networth.entity.User;
import com.networth.entity.UserActivityLog;
import com.networth.entity.UserNotificationSetting;
import com.networth.repository.SystemSettingRepository;
import com.networth.repository.UserActivityLogRepository;
import com.networth.repository.UserNotificationSettingRepository;
import com.networth.repository.UserRepository;
import com.networth.security.JwtUtil;
import com.networth.security.UserPrincipal;
import com.networth.service.CategorySeedService;
import com.networth.service.EmailService;
import com.networth.service.OtpService;
import com.networth.service.ValidationService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger logger = LoggerFactory.getLogger(AuthController.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private CategorySeedService categorySeedService;

    @Autowired
    private ValidationService validationService;

    @Autowired
    private OtpService otpService;

    @Autowired
    private EmailService emailService;

    @Autowired
    private UserActivityLogRepository userActivityLogRepository;

    @Autowired
    private UserNotificationSettingRepository userNotificationSettingRepository;

    @Autowired
    private SystemSettingRepository systemSettingRepository;

    @Autowired
    private com.networth.repository.SubscriptionPlanRepository subscriptionPlanRepository;

    /**
     * Step 1 of Registration: Send OTP to Email after strict domain and disposable checks.
     */
    @PostMapping("/send-registration-otp")
    public ResponseEntity<AuthResponse> sendRegistrationOtp(@RequestBody AuthRequest request) {
        String email = request.getEffectiveEmail();

        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error("Please provide a valid email address.").build());
        }

        try {
            validationService.validateEmail(email);

            if (userRepository.existsByEmail(email)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(AuthResponse.builder().success(false).error("This email address is already registered. Please sign in.").build());
            }

            String otp = otpService.generateAndSendOtp(email, "Account Registration");
            logger.info("Sent registration OTP to email: {}", email);

            return ResponseEntity.ok(AuthResponse.builder()
                    .success(true)
                    .identifier(email)
                    .devOtp(otpService.isRealChannelConfigured() ? null : otp)
                    .expiresInSeconds(300)
                    .message("A 6-digit verification code has been sent to " + email)
                    .build());

        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error(e.getMessage()).build());
        } catch (Exception e) {
            logger.error("Failed to process registration OTP for {}: {}", email, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(AuthResponse.builder().success(false).error("Could not send verification email. Please check your email address.").build());
        }
    }

    /**
     * Step 2 of Registration: Verify OTP and Create New User.
     */
    @PostMapping("/verify-registration-otp")
    public ResponseEntity<AuthResponse> verifyRegistrationOtp(@RequestBody AuthRequest request, HttpServletResponse response) {
        String email = request.getEffectiveEmail();

        if (email == null || email.trim().isEmpty() || request.getOtp() == null || request.getPassword() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error("Email, OTP code, and password are required.").build());
        }

        if (request.getPassword().trim().length() < 6) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error("Password must be at least 6 characters long.").build());
        }

        try {
            validationService.validateEmail(email);

            if (userRepository.existsByEmail(email)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(AuthResponse.builder().success(false).error("This email is already registered.").build());
            }

            // Verify OTP
            otpService.verifyOtp(email, "Account Registration", request.getOtp());

            // Determine Name
            String name = request.getName();
            if (name == null || name.isBlank()) {
                name = email.split("@")[0];
            }

            User user = User.builder()
                    .email(email)
                    .password(passwordEncoder.encode(request.getPassword()))
                    .name(name.trim())
                    .isVerified(true)
                    .role("USER")
                    .status("ACTIVE")
                    .subscriptionTier("FREE")
                    .cardLimit(2)
                    .canAccessDashboard(true)
                    .canAccessReports(true)
                    .canEditSettings(true)
                    .lastLoginAt(LocalDateTime.now())
                    .loginCount(1)
                    .build();

            user = userRepository.save(user);
            categorySeedService.seedUserCategories(user.getId());

            // Default notification settings
            userNotificationSettingRepository.save(UserNotificationSetting.builder().userId(user.getId()).build());

            userActivityLogRepository.save(UserActivityLog.builder()
                    .userId(user.getId())
                    .userEmail(user.getEmail())
                    .action("REGISTER")
                    .details("New user account created and verified")
                    .build());

            String token = jwtUtil.generateToken(user.getId(), user.getEmail());
            setAuthCookie(response, token);

            return ResponseEntity.ok(AuthResponse.builder()
                    .success(true)
                    .user(UserDto.fromEntity(user))
                    .token(token)
                    .message("Account created and verified successfully!")
                    .build());

        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error(e.getMessage()).build());
        }
    }

    /**
     * Resend OTP.
     */
    @PostMapping("/resend-otp")
    public ResponseEntity<AuthResponse> resendOtp(@RequestBody AuthRequest request) {
        String email = request.getEffectiveEmail();
        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error("Email address is required.").build());
        }

        try {
            validationService.validateEmail(email);
            String purpose = request.getPurpose() != null ? request.getPurpose() : "Account Registration";
            String otp = otpService.generateAndSendOtp(email, purpose);

            return ResponseEntity.ok(AuthResponse.builder()
                    .success(true)
                    .identifier(email)
                    .devOtp(otpService.isRealChannelConfigured() ? null : otp)
                    .expiresInSeconds(300)
                    .message("A new 6-digit code has been sent to " + email)
                    .build());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error(e.getMessage()).build());
        }
    }

    /**
     * Login: Sign in with Email and Password.
     * Checks:
     * 1. Unregistered -> returns 404 + unregistered: true (auto redirect to signup)
     * 2. Scheduled maintenance -> regular users blocked with maintenance details
     * 3. Account locks (TEMP, FULL, PERMANENT) -> blocked with specific warning message
     * 4. Session tracking -> increments loginCount, records lastLoginAt, logs activity, sends mail alert
     */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody AuthRequest request, HttpServletRequest httpRequest, HttpServletResponse response) {
        String email = request.getEffectiveEmail();

        if (email == null || email.trim().isEmpty() || request.getPassword() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error("Please provide email and password.").build());
        }

        String identifier = email.trim();
        Optional<User> userOpt = userRepository.findByEmail(identifier.toLowerCase());
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByMemberId(identifier.toUpperCase());
        }
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByMemberId(identifier);
        }

        // 1. Unregistered account check
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(AuthResponse.builder()
                            .success(false)
                            .unregistered(true)
                            .error("Account not found with this identifier. We're redirecting you to Create an Account.")
                            .build());
        }

        User user = userOpt.get();

        // 2. Account Lock Checks (Evaluate first so locked users immediately receive warning notice with admin description)
        String lockType = user.getLockType() != null ? user.getLockType().toUpperCase() : "NONE";
        String lockReason = (user.getLockReason() != null && !user.getLockReason().isBlank())
                ? user.getLockReason()
                : "Account restricted by administrator.";

        if ("TEMP".equals(lockType) && user.getLockUntil() != null) {
            if (LocalDateTime.now().isBefore(user.getLockUntil())) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(AuthResponse.builder()
                                .success(false)
                                .isLocked(true)
                                .lockType("TEMP")
                                .lockUntil(user.getLockUntil().toString())
                                .lockReason(lockReason)
                                .error("Your account has been temporarily locked until " + user.getLockUntil() + ". Reason: " + lockReason)
                                .build());
            } else {
                // Auto-expired temp lock -> unlock account automatically
                user.setLockType("NONE");
                user.setStatus("ACTIVE");
                user.setLockReason(null);
                user.setLockUntil(null);
                userRepository.save(user);
            }
        } else if ("FULL".equals(lockType) || "PERMANENT".equals(lockType) || "LOCKED".equalsIgnoreCase(user.getStatus())) {
            String effectiveLockType = "PERMANENT".equals(lockType) ? "PERMANENT" : "FULL";
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(AuthResponse.builder()
                            .success(false)
                            .isLocked(true)
                            .lockType(effectiveLockType)
                            .lockReason(lockReason)
                            .error("Your account is currently locked. Reason: " + lockReason)
                            .build());
        }

        // Check member expiration
        if (user.getMemberExpiresAt() != null && LocalDateTime.now().isAfter(user.getMemberExpiresAt())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(AuthResponse.builder()
                            .success(false)
                            .error("Your member access expired on " + user.getMemberExpiresAt().format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm")) + ". Please contact the workspace owner to renew access.")
                            .build());
        }

        // Check password
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            userActivityLogRepository.save(UserActivityLog.builder()
                    .userId(user.getId())
                    .userEmail(user.getEmail())
                    .action("FAILED_LOGIN")
                    .details("Failed login attempt (invalid password)")
                    .ipAddress(httpRequest.getRemoteAddr())
                    .userAgent(httpRequest.getHeader("User-Agent"))
                    .build());

            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(AuthResponse.builder().success(false).error("Invalid email or password.").build());
        }

        boolean isAdminUser = user.getRole() != null &&
                (user.getRole().equalsIgnoreCase("ADMIN") || user.getRole().equalsIgnoreCase("SUPER_ADMIN"));

        // 3. Scheduled Maintenance Check
        Optional<SystemSetting> maintSetting = systemSettingRepository.findBySettingKey("MAINTENANCE_ACTIVE");
        if (maintSetting.isPresent() && "true".equalsIgnoreCase(maintSetting.get().getSettingValue()) && !isAdminUser) {
            String maintMsg = systemSettingRepository.findBySettingKey("MAINTENANCE_MESSAGE")
                    .map(SystemSetting::getSettingValue)
                    .orElse("System maintenance is underway. Regular logins are temporarily paused.");
            String maintEnd = systemSettingRepository.findBySettingKey("MAINTENANCE_END")
                    .map(SystemSetting::getSettingValue)
                    .orElse("Shortly");

            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(AuthResponse.builder()
                            .success(false)
                            .isMaintenance(true)
                            .maintenanceMessage(maintMsg)
                            .maintenanceEnd(maintEnd)
                            .error("Scheduled Maintenance Underway: " + maintMsg)
                            .build());
        }

        // Check if account has been verified
        if (user.getIsVerified() == null || !user.getIsVerified()) {
            String otp = otpService.generateAndSendOtp(user.getEmail(), "Account Verification");

            return ResponseEntity.ok(AuthResponse.builder()
                    .success(false)
                    .requiresVerification(true)
                    .identifier(user.getEmail())
                    .devOtp(otpService.isRealChannelConfigured() ? null : otp)
                    .expiresInSeconds(300)
                    .message("Your account is not verified yet. We have sent a 6-digit verification code to " + user.getEmail())
                    .build());
        }

        // Update login stats
        user.setLastLoginAt(LocalDateTime.now());
        user.setLastActivityAt(LocalDateTime.now());
        user.setLoginCount((user.getLoginCount() != null ? user.getLoginCount() : 0) + 1);
        user = userRepository.save(user);

        // Record Activity Log
        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(user.getId())
                .userEmail(user.getEmail())
                .action("LOGIN")
                .details("Signed in successfully (" + (user.getRole() != null ? user.getRole() : "USER") + ")")
                .ipAddress(httpRequest.getRemoteAddr())
                .userAgent(httpRequest.getHeader("User-Agent"))
                .build());

        // Check temporary password expiry
        boolean isTempPwd = Boolean.TRUE.equals(user.getIsTemporaryPassword());
        boolean mustChangePwd = Boolean.TRUE.equals(user.getMustChangePassword()) || isTempPwd;

        if (isTempPwd && user.getTemporaryPasswordExpiresAt() != null) {
            if (user.getTemporaryPasswordExpiresAt().isBefore(LocalDateTime.now())) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(AuthResponse.builder()
                                .success(false)
                                .error("Your temporary password has expired. Please ask your administrator to generate a new one.")
                                .build());
            }
        }

        // Dispatch Login Alert Email if enabled
        Optional<UserNotificationSetting> notifOpt = userNotificationSettingRepository.findByUserId(user.getId());
        if (notifOpt.isPresent() && Boolean.TRUE.equals(notifOpt.get().getLoginMail())) {
            emailService.sendLoginAlertEmail(user.getEmail(), user.getName(), httpRequest.getRemoteAddr(), LocalDateTime.now().toString());
        }

        String token = jwtUtil.generateToken(user.getId(), user.getEmail());
        setAuthCookie(response, token);

        User parent = null;
        if (user.getParentUserId() != null) {
            parent = userRepository.findById(user.getParentUserId()).orElse(null);
        }

        return ResponseEntity.ok(AuthResponse.builder()
                .success(true)
                .user(UserDto.fromEntity(user, parent))
                .token(token)
                .isTemporaryPassword(isTempPwd)
                .mustChangePassword(mustChangePwd)
                .build());
    }

    /**
     * Verify unverified existing account via Email OTP.
     */
    @PostMapping("/verify-existing-account")
    public ResponseEntity<AuthResponse> verifyExistingAccount(@RequestBody AuthRequest request, HttpServletResponse response) {
        String email = request.getEffectiveEmail();

        if (email == null || email.trim().isEmpty() || request.getOtp() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error("Email and OTP code are required.").build());
        }

        Optional<User> userOpt = userRepository.findByEmail(email);

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(AuthResponse.builder().success(false).error("Account not found.").build());
        }

        User user = userOpt.get();

        try {
            otpService.verifyOtp(user.getEmail(), "Account Verification", request.getOtp());

            user.setIsVerified(true);
            user.setLastLoginAt(LocalDateTime.now());
        user.setLastActivityAt(LocalDateTime.now());
            user.setLoginCount((user.getLoginCount() != null ? user.getLoginCount() : 0) + 1);
            user = userRepository.save(user);

            String token = jwtUtil.generateToken(user.getId(), user.getEmail());
            setAuthCookie(response, token);

            return ResponseEntity.ok(AuthResponse.builder()
                    .success(true)
                    .user(UserDto.fromEntity(user))
                    .token(token)
                    .message("Account verified successfully! Welcome to FinTrack.")
                    .build());

        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error(e.getMessage()).build());
        }
    }

    /**
     * Fallback register endpoint (keeps demo login functional, auto-marks demo as verified).
     */
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody AuthRequest request, HttpServletResponse response) {
        String email = request.getEffectiveEmail();
        if (email == null || request.getPassword() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error("Email and password required").build());
        }

        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(AuthResponse.builder().success(false).error("Email already in use").build());
        }

        boolean isDemo = "demo@fintrack.io".equalsIgnoreCase(email);
        String defaultTier = systemSettingRepository.findBySettingKey("DEFAULT_SUBSCRIPTION_PLAN")
                .map(SystemSetting::getSettingValue)
                .orElse("FREE")
                .toUpperCase();

        int cardLimit = isDemo ? 5 : 2;
        boolean canDash = true;
        boolean canRep = true;

        var planOpt = subscriptionPlanRepository.findByPlanCode(defaultTier);
        if (planOpt.isPresent()) {
            var plan = planOpt.get();
            cardLimit = isDemo ? 5 : plan.getMaxCreditCards();
            canDash = plan.getCanAccessDashboard();
            canRep = plan.getCanAccessReports();
        }

        User user = User.builder()
                .email(email)
                .password(passwordEncoder.encode(request.getPassword()))
                .name(request.getName() != null ? request.getName() : email.split("@")[0])
                .isVerified(isDemo)
                .role("USER")
                .status("ACTIVE")
                .subscriptionTier(defaultTier)
                .cardLimit(cardLimit)
                .canAccessDashboard(canDash)
                .canAccessReports(canRep)
                .canEditSettings(true)
                .lastLoginAt(LocalDateTime.now())
                .loginCount(1)
                .build();

        user = userRepository.save(user);
        categorySeedService.seedUserCategories(user.getId());

        String token = jwtUtil.generateToken(user.getId(), user.getEmail());
        setAuthCookie(response, token);

        return ResponseEntity.ok(AuthResponse.builder().success(true).user(UserDto.fromEntity(user)).token(token).build());
    }

    @PostMapping("/check-email")
    public ResponseEntity<?> checkEmail(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }
        boolean exists = userRepository.existsByEmail(email.trim().toLowerCase());
        return ResponseEntity.ok(Map.of("exists", exists));
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> me(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(AuthResponse.builder().success(false).error("Not authenticated").build());
        }
        Long currentUserId = principal.getActualUserId();
        User user = userRepository.findById(currentUserId).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(AuthResponse.builder().success(false).error("User not found").build());
        }

        User parent = null;
        if (user.getParentUserId() != null) {
            parent = userRepository.findById(user.getParentUserId()).orElse(null);
        }

        user.setLastActivityAt(LocalDateTime.now());
        user = userRepository.save(user);

        // Attach system maintenance status
        Optional<SystemSetting> maintSetting = systemSettingRepository.findBySettingKey("MAINTENANCE_ACTIVE");
        boolean isMaint = maintSetting.isPresent() && "true".equalsIgnoreCase(maintSetting.get().getSettingValue());
        String maintMsg = systemSettingRepository.findBySettingKey("MAINTENANCE_MESSAGE").map(SystemSetting::getSettingValue).orElse(null);
        String maintEnd = systemSettingRepository.findBySettingKey("MAINTENANCE_END").map(SystemSetting::getSettingValue).orElse(null);

        return ResponseEntity.ok(AuthResponse.builder()
                .success(true)
                .user(UserDto.fromEntity(user, parent))
                .isMaintenance(isMaint)
                .maintenanceMessage(maintMsg)
                .maintenanceEnd(maintEnd)
                .build());
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(@AuthenticationPrincipal UserPrincipal principal, HttpServletResponse response) {
        if (principal != null) {
            User user = userRepository.findById(principal.getId()).orElse(null);
            if (user != null) {
                user.setLastLogoutAt(LocalDateTime.now());
                user.setLastActivityAt(null);
                userRepository.save(user);

                userActivityLogRepository.save(UserActivityLog.builder()
                        .userId(user.getId())
                        .userEmail(user.getEmail())
                        .action("LOGOUT")
                        .details("User signed out")
                        .build());
            }
        }

        Cookie cookie = new Cookie("token", "");
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
        return ResponseEntity.ok(Map.of("success", true, "message", "Logged out successfully"));
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "error", "Unauthorized"));
        }

        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");

        if (currentPassword == null || newPassword == null || newPassword.trim().length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "Valid current password and new password (min 6 chars) required."));
        }

        User user = userRepository.findById(principal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "User not found."));
        }

        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("success", false, "error", "Current password does not match."));
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(user.getId())
                .userEmail(user.getEmail())
                .action("PASSWORD_RESET")
                .details("Password changed by user")
                .build());

        // Send confirmation email
        Optional<UserNotificationSetting> notifOpt = userNotificationSettingRepository.findByUserId(user.getId());
        if (notifOpt.isEmpty() || Boolean.TRUE.equals(notifOpt.get().getPwdResetMail())) {
            emailService.sendPasswordResetEmail(user.getEmail(), user.getName());
        }

        return ResponseEntity.ok(Map.of("success", true, "message", "Password changed successfully."));
    }

    @PostMapping("/change-temp-password")
    public ResponseEntity<?> changeTempPassword(@AuthenticationPrincipal UserPrincipal principal, @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "error", "Unauthorized"));
        }

        String newPassword = body.get("newPassword");
        if (newPassword == null || newPassword.trim().length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "Password must be at least 6 characters long."));
        }

        User user = userRepository.findById(principal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "error", "User not found."));
        }

        user.setPassword(passwordEncoder.encode(newPassword.trim()));
        user.setIsTemporaryPassword(false);
        user.setTemporaryPasswordExpiresAt(null);
        user.setMustChangePassword(false);
        user = userRepository.save(user);

        userActivityLogRepository.save(UserActivityLog.builder()
                .userId(user.getId())
                .userEmail(user.getEmail())
                .action("TEMP_PASSWORD_RESET")
                .details("User successfully configured new permanent password from temporary password session.")
                .build());

        // Send confirmation email
        Optional<UserNotificationSetting> notifOpt = userNotificationSettingRepository.findByUserId(user.getId());
        if (notifOpt.isEmpty() || Boolean.TRUE.equals(notifOpt.get().getPwdResetMail())) {
            emailService.sendPasswordResetEmail(user.getEmail(), user.getName());
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "New password configured successfully! Welcome to FinTrack.",
                "user", UserDto.fromEntity(user)
        ));
    }

    private void setAuthCookie(HttpServletResponse response, String token) {
        Cookie cookie = new Cookie("token", token);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(7 * 24 * 60 * 60); // 7 days
        response.addCookie(cookie);
    }
}
