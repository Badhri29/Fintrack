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

        if (body.containsKey("name") && body.get("name") != null) user.setName((String) body.get("name"));
        if (body.containsKey("age") && body.get("age") != null) {
            try { user.setAge(Integer.valueOf(body.get("age").toString())); } catch (NumberFormatException ignored) {}
        }
        if (body.containsKey("gender") && body.get("gender") != null) user.setGender((String) body.get("gender"));
        if (body.containsKey("phone") && body.get("phone") != null) user.setPhone((String) body.get("phone"));
        if (body.containsKey("photo") && body.get("photo") != null) user.setPhoto((String) body.get("photo"));

        user = userRepository.save(user);

        return ResponseEntity.ok(Map.of("success", true, "data", user, "message", "Profile updated successfully"));
    }
}
