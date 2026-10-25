package com.networth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthRequest {
    private String email;
    private String identifier; // Supported for backward compatibility
    private String password;
    private String name;
    private String otp;
    private String purpose;
    private String loginPortal;

    public String getEffectiveEmail() {
        if (email != null && !email.trim().isEmpty()) {
            return email.trim().toLowerCase();
        }
        if (identifier != null && !identifier.trim().isEmpty()) {
            return identifier.trim().toLowerCase();
        }
        return null;
    }
}
