package com.networth.service;

import com.networth.entity.OtpVerification;
import com.networth.repository.OtpVerificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class OtpService {

    private static final int OTP_EXPIRY_MINUTES = 5;
    private static final int MAX_ATTEMPTS = 5;

    @Autowired
    private OtpVerificationRepository otpVerificationRepository;

    @Autowired
    private EmailService emailService;

    private final SecureRandom secureRandom = new SecureRandom();

    public boolean isRealChannelConfigured() {
        return emailService.isConfigured();
    }

    public String generateAndSendOtp(String email, String purpose) {
        String otpCode = String.format("%06d", secureRandom.nextInt(1_000_000));
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES);

        OtpVerification otp = OtpVerification.builder()
                .target(email.trim().toLowerCase())
                .targetType("EMAIL")
                .otpCode(otpCode)
                .purpose(purpose)
                .attempts(0)
                .verified(false)
                .expiresAt(expiresAt)
                .build();

        otpVerificationRepository.save(otp);

        emailService.sendOtpEmail(email.trim().toLowerCase(), otpCode, purpose);

        return otpCode;
    }

    @Transactional
    public boolean verifyOtp(String email, String purpose, String inputOtp) {
        if (inputOtp == null || inputOtp.trim().isEmpty()) {
            throw new IllegalArgumentException("OTP code is required.");
        }

        String cleanedEmail = email.trim().toLowerCase();

        Optional<OtpVerification> opt = otpVerificationRepository
                .findTopByTargetAndPurposeAndVerifiedFalseOrderByCreatedAtDesc(cleanedEmail, purpose);

        if (opt.isEmpty()) {
            throw new IllegalArgumentException("No active OTP request found for " + cleanedEmail + ". Please request a new OTP.");
        }

        OtpVerification otp = opt.get();

        if (otp.getAttempts() >= MAX_ATTEMPTS) {
            throw new IllegalArgumentException("Maximum verification attempts reached. Please request a new OTP.");
        }

        if (otp.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("This OTP has expired. Please request a new OTP.");
        }

        if (!otp.getOtpCode().equals(inputOtp.trim())) {
            otp.setAttempts(otp.getAttempts() + 1);
            otpVerificationRepository.save(otp);
            int remaining = MAX_ATTEMPTS - otp.getAttempts();
            throw new IllegalArgumentException("Invalid OTP code. " + remaining + " attempts remaining.");
        }

        otp.setVerified(true);
        otpVerificationRepository.save(otp);
        return true;
    }
}
