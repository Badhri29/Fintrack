package com.networth.controller;

import com.networth.entity.Asset;
import com.networth.entity.Liability;
import com.networth.repository.AssetRepository;
import com.networth.repository.LiabilityRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/holdings")
public class HoldingsController {

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private LiabilityRepository liabilityRepository;

    /* ASSETS ENDPOINTS */
    @GetMapping("/assets")
    public ResponseEntity<Map<String, Object>> getAssets(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        List<Asset> assets = assetRepository.findByUserId(principal.getId());
        double total = assets.stream().mapToDouble(Asset::getValue).sum();
        return ResponseEntity.ok(Map.of("success", true, "data", assets, "total", total));
    }

    @PostMapping("/assets")
    public ResponseEntity<Map<String, Object>> createAsset(@AuthenticationPrincipal UserPrincipal principal,
                                                           @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        String name = (String) body.get("name");
        String type = (String) body.get("type");
        Object valObj = body.get("value");
        if (name == null || type == null || valObj == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("success", false, "message", "name, type, and value required"));
        }

        Asset asset = assetRepository.save(Asset.builder()
                .userId(principal.getId())
                .name(name)
                .type(type)
                .value(Double.valueOf(valObj.toString()))
                .build());

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", asset));
    }

    @DeleteMapping("/assets/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteAsset(@AuthenticationPrincipal UserPrincipal principal,
                                                           @PathVariable Long id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        var opt = assetRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Asset not found"));
        }
        assetRepository.deleteByIdAndUserId(id, principal.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    /* LIABILITIES ENDPOINTS */
    @GetMapping("/liabilities")
    public ResponseEntity<Map<String, Object>> getLiabilities(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        List<Liability> liabilities = liabilityRepository.findByUserId(principal.getId());
        double total = liabilities.stream().mapToDouble(Liability::getValue).sum();
        return ResponseEntity.ok(Map.of("success", true, "data", liabilities, "total", total));
    }

    @PostMapping("/liabilities")
    public ResponseEntity<Map<String, Object>> createLiability(@AuthenticationPrincipal UserPrincipal principal,
                                                               @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        String name = (String) body.get("name");
        String type = (String) body.get("type");
        Object valObj = body.get("value");
        if (name == null || type == null || valObj == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("success", false, "message", "name, type, and value required"));
        }

        Liability liability = liabilityRepository.save(Liability.builder()
                .userId(principal.getId())
                .name(name)
                .type(type)
                .value(Double.valueOf(valObj.toString()))
                .build());

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", liability));
    }

    @DeleteMapping("/liabilities/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteLiability(@AuthenticationPrincipal UserPrincipal principal,
                                                               @PathVariable Long id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        var opt = liabilityRepository.findByIdAndUserId(id, principal.getId());
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Liability not found"));
        }
        liabilityRepository.deleteByIdAndUserId(id, principal.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }
}
