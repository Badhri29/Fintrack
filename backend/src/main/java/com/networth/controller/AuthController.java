package com.networth.controller;

import com.networth.dto.AuthRequest;
import com.networth.dto.AuthResponse;
import com.networth.dto.UserDto;
import com.networth.entity.User;
import com.networth.repository.UserRepository;
import com.networth.security.JwtUtil;
import com.networth.security.UserPrincipal;
import com.networth.service.CategorySeedService;
import com.networth.service.OtpService;
import com.networth.service.ValidationService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

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

    /**
     * Step 1 of Registration: Send OTP to Email after strict domain and disposable checks.
     * Prevents duplicate and fake accounts.
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
     * Step 2 of Registration: Verify Email OTP and create the account.
     * Account is ONLY created in database after OTP validation succeeds.
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
                    .build();

            user = userRepository.save(user);
            categorySeedService.seedUserCategories(user.getId());

            String token = jwtUtil.generateToken(user.getId(), user.getEmail());
            setAuthCookie(response, token);

            UserDto userDto = UserDto.builder()
                    .id(user.getId())
                    .email(user.getEmail())
                    .name(user.getName())
                    .photo(user.getPhoto())
                    .isVerified(user.getIsVerified())
                    .build();

            logger.info("New verified user created with email: {}", email);

            return ResponseEntity.ok(AuthResponse.builder()
                    .success(true)
                    .user(userDto)
                    .token(token)
                    .message("Account created and verified successfully!")
                    .build());

        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error(e.getMessage()).build());
        } catch (Exception e) {
            logger.error("Registration error for {}: {}", email, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(AuthResponse.builder().success(false).error("Failed to complete registration: " + e.getMessage()).build());
        }
    }

    /**
     * Resend OTP for email verification.
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
     * If account is not verified, sends verification OTP to email and returns requiresVerification: true.
     */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody AuthRequest request, HttpServletResponse response) {
        String email = request.getEffectiveEmail();

        if (email == null || email.trim().isEmpty() || request.getPassword() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(AuthResponse.builder().success(false).error("Please provide email and password.").build());
        }

        Optional<User> userOpt = userRepository.findByEmail(email);

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(AuthResponse.builder().success(false).error("Invalid email or password.").build());
        }

        User user = userOpt.get();
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(AuthResponse.builder().success(false).error("Invalid email or password.").build());
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

        String token = jwtUtil.generateToken(user.getId(), user.getEmail());
        setAuthCookie(response, token);

        UserDto userDto = UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .photo(user.getPhoto())
                .isVerified(user.getIsVerified())
                .build();

        return ResponseEntity.ok(AuthResponse.builder().success(true).user(userDto).token(token).build());
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
            user = userRepository.save(user);

            String token = jwtUtil.generateToken(user.getId(), user.getEmail());
            setAuthCookie(response, token);

            UserDto userDto = UserDto.builder()
                    .id(user.getId())
                    .email(user.getEmail())
                    .name(user.getName())
                    .photo(user.getPhoto())
                    .isVerified(user.getIsVerified())
                    .build();

            return ResponseEntity.ok(AuthResponse.builder()
                    .success(true)
                    .user(userDto)
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
        User user = User.builder()
                .email(email)
                .password(passwordEncoder.encode(request.getPassword()))
                .name(request.getName() != null ? request.getName() : email.split("@")[0])
                .isVerified(isDemo)
                .build();

        user = userRepository.save(user);
        categorySeedService.seedUserCategories(user.getId());

        String token = jwtUtil.generateToken(user.getId(), user.getEmail());
        setAuthCookie(response, token);

        UserDto userDto = UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .photo(user.getPhoto())
                .isVerified(user.getIsVerified())
                .build();

        return ResponseEntity.ok(AuthResponse.builder().success(true).user(userDto).token(token).build());
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
        User user = userRepository.findById(principal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(AuthResponse.builder().success(false).error("User not found").build());
        }
        UserDto userDto = UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .photo(user.getPhoto())
                .isVerified(user.getIsVerified())
                .build();
        return ResponseEntity.ok(AuthResponse.builder().success(true).user(userDto).build());
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(HttpServletResponse response) {
        Cookie cookie = new Cookie("token", "");
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
        return ResponseEntity.ok(Map.of("success", true, "message", "Logged out successfully"));
    }

    private void setAuthCookie(HttpServletResponse response, String token) {
        Cookie cookie = new Cookie("token", token);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(7 * 24 * 60 * 60); // 7 days
        response.addCookie(cookie);
    }
}
