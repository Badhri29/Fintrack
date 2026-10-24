package com.networth.controller;

import com.networth.dto.UserDto;
import com.networth.entity.User;
import com.networth.repository.UserRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private com.networth.repository.UserActivityLogRepository userActivityLogRepository;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getProfile(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        User user = userRepository.findById(principal.getId()).orElseThrow();
        return ResponseEntity.ok(Map.of("success", true, "data", user));
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> updateProfile(@AuthenticationPrincipal UserPrincipal principal,
                                                             @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        User user = userRepository.findById(principal.getId()).orElseThrow();

        if (body.containsKey("name") && body.get("name") != null) {
            user.setName(((String) body.get("name")).trim());
        }
        if (body.containsKey("age")) {
            Object a = body.get("age");
            if (a != null && !a.toString().trim().isEmpty()) {
                try { user.setAge(Integer.valueOf(a.toString().trim())); } catch (NumberFormatException ignored) {}
            } else {
                user.setAge(null);
            }
        }
        if (body.containsKey("gender")) {
            String g = (String) body.get("gender");
            user.setGender(g != null && !g.trim().isEmpty() ? g.trim() : null);
        }
        if (body.containsKey("phone")) {
            String p = (String) body.get("phone");
            user.setPhone(p != null && !p.trim().isEmpty() ? p.trim() : null);
        }
        if (body.containsKey("photo")) {
            String ph = (String) body.get("photo");
            user.setPhoto(ph != null && !ph.trim().isEmpty() ? ph.trim() : null);
        }

        user.setLastActivityAt(java.time.LocalDateTime.now());
        user = userRepository.save(user);

        try {
            userActivityLogRepository.save(com.networth.entity.UserActivityLog.builder()
                    .userId(user.getId())
                    .userEmail(user.getEmail())
                    .action("PROFILE_UPDATE")
                    .details(body.containsKey("photo") ? "Updated profile photo & info" : "Updated profile information")
                    .build());
        } catch (Exception ignored) {}

        return ResponseEntity.ok(Map.of("success", true, "data", UserDto.fromEntity(user), "message", "Profile updated successfully"));
    }
}