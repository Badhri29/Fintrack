package com.networth.controller;

import com.networth.entity.User;
import com.networth.entity.UserActivityLog;
import com.networth.entity.WorkspaceMember;
import com.networth.repository.UserActivityLogRepository;
import com.networth.repository.UserRepository;
import com.networth.repository.WorkspaceMemberRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/workspace/members")
public class WorkspaceMemberController {

    @Autowired
    private WorkspaceMemberRepository workspaceMemberRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserActivityLogRepository userActivityLogRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private String generateSecurePassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder("FT@");
        for (int i = 0; i < 6; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }

    private String generateUniqueMemberId() {
        SecureRandom random = new SecureRandom();
        String memberId;
        int attempts = 0;
        do {
            int num = 100000 + random.nextInt(900000);
            memberId = "MEM-" + num;
            attempts++;
        } while (userRepository.existsByMemberId(memberId) && attempts < 100);
        return memberId;
    }

    private LocalDateTime calculateExpiry(String expiryDuration) {
        if (expiryDuration == null || expiryDuration.trim().isEmpty() || "NEVER".equalsIgnoreCase(expiryDuration)) {
            return null;
        }
        String d = expiryDuration.trim().toUpperCase();
        if ("24_HOURS".equals(d) || "1_DAY".equals(d)) {
            return LocalDateTime.now().plusHours(24);
        } else if ("7_DAYS".equals(d) || "1_WEEK".equals(d)) {
            return LocalDateTime.now().plusDays(7);
        } else if ("30_DAYS".equals(d) || "1_MONTH".equals(d)) {
            return LocalDateTime.now().plusDays(30);
        } else if ("90_DAYS".equals(d) || "3_MONTHS".equals(d)) {
            return LocalDateTime.now().plusDays(90);
        } else if ("1_YEAR".equals(d)) {
            return LocalDateTime.now().plusYears(1);
        }
        return null;
    }

    private String formatExpiryLabel(String expiryDuration) {
        if (expiryDuration == null || "NEVER".equalsIgnoreCase(expiryDuration)) return "Never expires";
        String d = expiryDuration.trim().toUpperCase();
        if ("24_HOURS".equals(d) || "1_DAY".equals(d)) return "24 Hours";
        if ("7_DAYS".equals(d) || "1_WEEK".equals(d)) return "7 Days";
        if ("30_DAYS".equals(d) || "1_MONTH".equals(d)) return "30 Days";
        if ("90_DAYS".equals(d) || "3_MONTHS".equals(d)) return "90 Days";
        if ("1_YEAR".equals(d)) return "1 Year";
        return "Never expires";
    }

    @GetMapping
    public ResponseEntity<?> getMembers(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        Long ownerId = principal.getId();
        Optional<User> ownerOpt = userRepository.findById(ownerId);
        if (ownerOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Owner account not found"));
        }

        User owner = ownerOpt.get();
        List<WorkspaceMember> members = workspaceMemberRepository.findByOwnerIdOrderByCreatedAtDesc(ownerId);

        Map<String, Object> ownerData = new HashMap<>();
        ownerData.put("id", owner.getId());
        ownerData.put("name", owner.getName() != null ? owner.getName() : "Workspace Owner");
        ownerData.put("email", owner.getEmail());
        ownerData.put("role", "Owner");
        ownerData.put("photo", owner.getPhoto());

        Map<String, Object> stats = new HashMap<>();
        stats.put("ownerName", owner.getName() != null ? owner.getName() : "You");
        stats.put("memberCount", members.size());
        stats.put("defaultPermission", "View only");

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("owner", ownerData);
        response.put("stats", stats);
        response.put("members", members);
        response.put("isLinkedMember", principal.isLinkedMember());
        response.put("memberPermission", principal.getMemberPermission());

        return ResponseEntity.ok(response);
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> addMember(@AuthenticationPrincipal UserPrincipal principal,
                                       @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        if (principal.isLinkedMember()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "Linked members cannot invite other members."));
        }

        String name = body.get("name");
        String permission = body.get("permission");
        String expiryDuration = body.get("expiryDuration");

        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Member name is required."));
        }

        name = name.trim();
        String permNormalized = "CAN_EDIT".equalsIgnoreCase(permission) ? "CAN_EDIT" : "VIEW_ONLY";
        Long ownerId = principal.getId();

        String memberId = generateUniqueMemberId();
        String rawPassword = generateSecurePassword();
        LocalDateTime expiresAt = calculateExpiry(expiryDuration);
        String expiryLabel = formatExpiryLabel(expiryDuration);

        // Internal pseudo-email for unique column requirement
        String internalEmail = memberId.toLowerCase() + "@fintrack.internal";

        Optional<User> ownerOpt = userRepository.findById(ownerId);
        User owner = ownerOpt.orElse(null);

        User memberUser = User.builder()
                .name(name)
                .memberId(memberId)
                .email(internalEmail)
                .password(passwordEncoder.encode(rawPassword))
                .role("MEMBER")
                .status("ACTIVE")
                .isVerified(true)
                .isTemporaryPassword(false)
                .parentUserId(ownerId)
                .memberPermission(permNormalized)
                .memberExpiresAt(expiresAt)
                .subscriptionTier(owner != null && owner.getSubscriptionTier() != null ? owner.getSubscriptionTier() : "FREE")
                .cardLimit(owner != null && owner.getCardLimit() != null ? owner.getCardLimit() : 2)
                .canAccessDashboard(owner != null && owner.getCanAccessDashboard() != null ? owner.getCanAccessDashboard() : true)
                .canAccessReports(owner != null && owner.getCanAccessReports() != null ? owner.getCanAccessReports() : true)
                .canEditSettings(false)
                .isReadOnly("VIEW_ONLY".equalsIgnoreCase(permNormalized))
                .build();
        memberUser = userRepository.save(memberUser);

        WorkspaceMember member = WorkspaceMember.builder()
                .ownerId(ownerId)
                .memberUserId(memberUser.getId())
                .memberId(memberId)
                .name(name)
                .email(memberId)
                .permission(permNormalized)
                .status("ACTIVE")
                .expiresAt(expiresAt)
                .build();
        member = workspaceMemberRepository.save(member);

        try {
            userActivityLogRepository.save(UserActivityLog.builder()
                    .userId(ownerId)
                    .userEmail(principal.getEmail())
                    .action("WORKSPACE_MEMBER_ADDED")
                    .details("Added workspace member: " + name + " (ID: " + memberId + ") with " + permNormalized + " access, expires: " + expiryLabel)
                    .build());
        } catch (Exception ignored) {}

        Map<String, Object> credentials = new HashMap<>();
        credentials.put("memberId", memberId);
        credentials.put("name", name);
        credentials.put("tempPassword", rawPassword);
        credentials.put("permission", permNormalized);
        credentials.put("expiresAt", expiresAt != null ? expiresAt.toString() : null);
        credentials.put("expiryLabel", expiryLabel);

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("message", "Member created successfully");
        res.put("member", member);
        res.put("credentials", credentials);

        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    @PutMapping("/{id}/permission")
    @Transactional
    public ResponseEntity<?> updatePermission(@AuthenticationPrincipal UserPrincipal principal,
                                             @PathVariable Long id,
                                             @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isLinkedMember()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "Linked members cannot modify permissions."));
        }

        Optional<WorkspaceMember> memberOpt = workspaceMemberRepository.findByIdAndOwnerId(id, principal.getId());
        if (memberOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Member not found in your workspace"));
        }

        String permission = body.get("permission");
        String permNormalized = "CAN_EDIT".equalsIgnoreCase(permission) ? "CAN_EDIT" : "VIEW_ONLY";

        WorkspaceMember member = memberOpt.get();
        member.setPermission(permNormalized);
        member = workspaceMemberRepository.save(member);

        Optional<User> userOpt = userRepository.findById(member.getMemberUserId());
        if (userOpt.isPresent()) {
            User u = userOpt.get();
            u.setMemberPermission(permNormalized);
            u.setIsReadOnly("VIEW_ONLY".equalsIgnoreCase(permNormalized));
            userRepository.save(u);
        }

        try {
            userActivityLogRepository.save(UserActivityLog.builder()
                    .userId(principal.getId())
                    .userEmail(principal.getEmail())
                    .action("WORKSPACE_MEMBER_UPDATED")
                    .details("Updated permission for member " + member.getName() + " to " + permNormalized)
                    .build());
        } catch (Exception ignored) {}

        return ResponseEntity.ok(Map.of("success", true, "member", member));
    }

    @PutMapping("/{id}/expiry")
    @Transactional
    public ResponseEntity<?> updateExpiry(@AuthenticationPrincipal UserPrincipal principal,
                                         @PathVariable Long id,
                                         @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isLinkedMember()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "Linked members cannot modify expiration."));
        }

        Optional<WorkspaceMember> memberOpt = workspaceMemberRepository.findByIdAndOwnerId(id, principal.getId());
        if (memberOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Member not found in your workspace"));
        }

        String expiryDuration = body.get("expiryDuration");
        LocalDateTime newExpiresAt = calculateExpiry(expiryDuration);

        WorkspaceMember member = memberOpt.get();
        member.setExpiresAt(newExpiresAt);
        member = workspaceMemberRepository.save(member);

        Optional<User> userOpt = userRepository.findById(member.getMemberUserId());
        if (userOpt.isPresent()) {
            User u = userOpt.get();
            u.setMemberExpiresAt(newExpiresAt);
            userRepository.save(u);
        }

        return ResponseEntity.ok(Map.of("success", true, "member", member, "expiryLabel", formatExpiryLabel(expiryDuration)));
    }

    @PostMapping("/{id}/reset-password")
    @Transactional
    public ResponseEntity<?> resetMemberPassword(@AuthenticationPrincipal UserPrincipal principal,
                                                @PathVariable Long id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isLinkedMember()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "Linked members cannot reset passwords."));
        }

        Optional<WorkspaceMember> memberOpt = workspaceMemberRepository.findByIdAndOwnerId(id, principal.getId());
        if (memberOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Member not found in your workspace"));
        }

        WorkspaceMember member = memberOpt.get();
        Optional<User> userOpt = userRepository.findById(member.getMemberUserId());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Member account not found"));
        }

        String newPassword = generateSecurePassword();
        User u = userOpt.get();
        u.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(u);

        try {
            userActivityLogRepository.save(UserActivityLog.builder()
                    .userId(principal.getId())
                    .userEmail(principal.getEmail())
                    .action("WORKSPACE_MEMBER_PASSWORD_RESET")
                    .details("Regenerated password for member " + member.getName() + " (ID: " + member.getMemberId() + ")")
                    .build());
        } catch (Exception ignored) {}

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("memberId", member.getMemberId());
        res.put("name", member.getName());
        res.put("tempPassword", newPassword);
        res.put("permission", member.getPermission());
        res.put("message", "Password regenerated successfully");

        return ResponseEntity.ok(res);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> removeMember(@AuthenticationPrincipal UserPrincipal principal,
                                         @PathVariable Long id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        if (principal.isLinkedMember()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false, "message", "Linked members cannot remove members."));
        }

        Optional<WorkspaceMember> memberOpt = workspaceMemberRepository.findByIdAndOwnerId(id, principal.getId());
        if (memberOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Member not found in your workspace"));
        }

        WorkspaceMember member = memberOpt.get();
        Long memberUserId = member.getMemberUserId();
        workspaceMemberRepository.delete(member);

        Optional<User> userOpt = userRepository.findById(memberUserId);
        if (userOpt.isPresent()) {
            User u = userOpt.get();
            u.setStatus("INACTIVE");
            u.setParentUserId(null);
            userRepository.save(u);
        }

        try {
            userActivityLogRepository.save(UserActivityLog.builder()
                    .userId(principal.getId())
                    .userEmail(principal.getEmail())
                    .action("WORKSPACE_MEMBER_REMOVED")
                    .details("Removed member " + member.getName() + " (ID: " + member.getMemberId() + ") from workspace")
                    .build());
        } catch (Exception ignored) {}

        return ResponseEntity.ok(Map.of("success", true, "message", "Member removed from workspace"));
    }
}
