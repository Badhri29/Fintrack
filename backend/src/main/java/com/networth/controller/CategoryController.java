package com.networth.controller;

import com.networth.entity.Category;
import com.networth.entity.SubCategory;
import com.networth.repository.CategoryRepository;
import com.networth.repository.SubCategoryRepository;
import com.networth.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api")
public class CategoryController {

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private SubCategoryRepository subCategoryRepository;

    @GetMapping("/categories")
    public ResponseEntity<Map<String, Object>> getCategories(@AuthenticationPrincipal UserPrincipal principal,
                                                             @RequestParam(required = false) String type) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        List<Category> categories = (type != null && !type.isEmpty())
                ? categoryRepository.findByUserIdAndType(principal.getId(), type)
                : categoryRepository.findByUserId(principal.getId());

        return ResponseEntity.ok(Map.of("success", true, "data", categories));
    }

    @PostMapping("/categories")
    public ResponseEntity<Map<String, Object>> createCategory(@AuthenticationPrincipal UserPrincipal principal,
                                                              @RequestBody Map<String, String> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        String type = body.get("type");
        String name = body.get("name");
        if (type == null || name == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("success", false, "message", "Type and name required"));
        }

        if (categoryRepository.existsByUserIdAndTypeAndName(principal.getId(), type, name)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("success", false, "message", "Category already exists"));
        }

        Category cat = categoryRepository.save(Category.builder()
                .userId(principal.getId())
                .type(type)
                .name(name)
                .build());

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", cat));
    }

    @GetMapping({"/subcategories", "/categories/subcategories"})
    public ResponseEntity<Map<String, Object>> getSubCategories(@AuthenticationPrincipal UserPrincipal principal,
                                                                @RequestParam(required = false) Long categoryId) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        List<SubCategory> subCategories = (categoryId != null)
                ? subCategoryRepository.findByUserIdAndCategoryId(principal.getId(), categoryId)
                : subCategoryRepository.findByUserId(principal.getId());

        return ResponseEntity.ok(Map.of("success", true, "data", subCategories));
    }

    @PostMapping({"/subcategories", "/categories/subcategories"})
    public ResponseEntity<Map<String, Object>> createSubCategory(@AuthenticationPrincipal UserPrincipal principal,
                                                                 @RequestBody Map<String, Object> body) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }

        Object catIdObj = body.get("categoryId");
        String name = (String) body.get("name");
        if (catIdObj == null || name == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("success", false, "message", "CategoryId and name required"));
        }

        Long categoryId = Long.valueOf(catIdObj.toString());

        if (subCategoryRepository.existsByUserIdAndCategoryIdAndName(principal.getId(), categoryId, name.trim())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("success", false, "message", "SubCategory already exists"));
        }

        SubCategory sub = subCategoryRepository.save(SubCategory.builder()
                .userId(principal.getId())
                .categoryId(categoryId)
                .name(name)
                .build());

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", sub));
    }

    @DeleteMapping("/categories/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteCategory(@AuthenticationPrincipal UserPrincipal principal,
                                                              @PathVariable Long id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        Optional<Category> catOpt = categoryRepository.findByIdAndUserId(id, principal.getId());
        if (catOpt.isPresent()) {
            Category cat = catOpt.get();
            List<SubCategory> subs = subCategoryRepository.findByUserIdAndCategoryId(principal.getId(), id);
            subCategoryRepository.deleteAll(subs);
            categoryRepository.delete(cat);
            return ResponseEntity.ok(Map.of("success", true, "message", "Category deleted successfully"));
        }
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "Category not found"));
    }

    @DeleteMapping("/categories")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteCategoryByName(@AuthenticationPrincipal UserPrincipal principal,
                                                                    @RequestParam(required = false) String type,
                                                                    @RequestParam String name) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        List<Category> all = categoryRepository.findByUserId(principal.getId());
        for (Category c : all) {
            if (c.getName() != null && c.getName().trim().equalsIgnoreCase(name.trim())) {
                if (type == null || type.isBlank() || (c.getType() != null && c.getType().trim().equalsIgnoreCase(type.trim()))) {
                    List<SubCategory> subs = subCategoryRepository.findByUserIdAndCategoryId(principal.getId(), c.getId());
                    subCategoryRepository.deleteAll(subs);
                    categoryRepository.delete(c);
                }
            }
        }
        return ResponseEntity.ok(Map.of("success", true, "message", "Category deleted successfully"));
    }

    @DeleteMapping({"/subcategories/{id}", "/categories/subcategories/{id}"})
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteSubCategory(@AuthenticationPrincipal UserPrincipal principal,
                                                                 @PathVariable Long id) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Unauthorized"));
        }
        Optional<SubCategory> subOpt = subCategoryRepository.findByIdAndUserId(id, principal.getId());
        if (subOpt.isPresent()) {
            subCategoryRepository.delete(subOpt.get());
            return ResponseEntity.ok(Map.of("success", true, "message", "SubCategory deleted successfully"));
        }
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("success", false, "message", "SubCategory not found"));
    }
}
