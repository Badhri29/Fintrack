package com.networth.service;

import com.networth.entity.Category;
import com.networth.entity.DefaultCategory;
import com.networth.entity.DefaultSubCategory;
import com.networth.entity.SubCategory;
import com.networth.repository.CategoryRepository;
import com.networth.repository.DefaultCategoryRepository;
import com.networth.repository.DefaultSubCategoryRepository;
import com.networth.repository.SubCategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class CategorySeedService {

    private static final Logger logger = LoggerFactory.getLogger(CategorySeedService.class);

    @Autowired
    private DefaultCategoryRepository defaultCategoryRepository;

    @Autowired
    private DefaultSubCategoryRepository defaultSubCategoryRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private SubCategoryRepository subCategoryRepository;

    @Transactional
    public void seedUserCategories(Long userId) {
        if (userId == null) return;

        // Prevent duplicate category seeding if user already has categories
        if (categoryRepository.existsByUserId(userId)) {
            logger.info("Categories already initialized for user ID: {}", userId);
            return;
        }

        List<DefaultCategory> defaultCategories = defaultCategoryRepository.findAll();

        if (defaultCategories.isEmpty()) {
            seedFallbackDefaults(userId);
            return;
        }

        for (DefaultCategory defaultCat : defaultCategories) {
            String catType = defaultCat.getType() != null ? defaultCat.getType().trim().toLowerCase() : "expense";
            String catName = defaultCat.getName() != null ? defaultCat.getName().trim() : "General";

            if (categoryRepository.existsByUserIdAndTypeAndName(userId, catType, catName)) {
                continue;
            }

            Category cat = categoryRepository.save(Category.builder()
                    .userId(userId)
                    .type(catType)
                    .name(catName)
                    .build());

            List<DefaultSubCategory> defaultSubs = defaultSubCategoryRepository.findByCategoryId(defaultCat.getId());
            for (DefaultSubCategory defaultSub : defaultSubs) {
                String subName = defaultSub.getName() != null ? defaultSub.getName().trim() : "General";
                if (!subCategoryRepository.existsByUserIdAndCategoryIdAndName(userId, cat.getId(), subName)) {
                    subCategoryRepository.save(SubCategory.builder()
                            .userId(userId)
                            .categoryId(cat.getId())
                            .name(subName)
                            .build());
                }
            }
        }
        logger.info("Successfully seeded default categories and subcategories for new user ID: {}", userId);
    }

    private void seedFallbackDefaults(Long userId) {
        // Income categories
        Category salary = categoryRepository.save(Category.builder().userId(userId).type("income").name("Salary").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(salary.getId()).name("Monthly Salary").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(salary.getId()).name("Bonus").build());

        Category investments = categoryRepository.save(Category.builder().userId(userId).type("income").name("Investments").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(investments.getId()).name("Dividends").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(investments.getId()).name("Capital Gains").build());

        // Expense categories
        Category housing = categoryRepository.save(Category.builder().userId(userId).type("expense").name("Housing").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(housing.getId()).name("Rent/Mortgage").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(housing.getId()).name("Utilities").build());

        Category food = categoryRepository.save(Category.builder().userId(userId).type("expense").name("Food & Dining").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(food.getId()).name("Groceries").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(food.getId()).name("Restaurants").build());
    }
}
