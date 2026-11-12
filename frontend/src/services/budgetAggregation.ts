import {
  DEFAULT_CATEGORIES,
  DEFAULT_SUBCATEGORIES_BY_CATEGORY,
  categoryService,
  getDeletedCategorySet,
  getRenamedCategoryMap,
  getRenamedSubcategoryMap,
  type ApiCategory,
  type ApiSubcategory,
  type CategorySection,
} from './categoryService';
import { getUserStorageKey } from './storageHelper';

export interface CategoryBudgetRow {
  name: string;
  monthlyBudgets: number[];
}

export interface ResolvedBudgetBreakdown {
  categoriesBySection: Record<CategorySection, CategoryBudgetRow[]>;
  sectionMonthlyTotals: Record<CategorySection, number[]>;
  resolveCategoryName: (section: CategorySection, rawCategoryName: string) => string;
}

export interface NormalizedBudgetStores {
  txByCanon: Map<string, number[]>;
  txRawKeyByCanon: Map<string, string>;
  txItemsByCanon: Map<string, any[]>;
  explicitEmptyTxCanon: Set<string>;
  directNumericByCanon: Map<string, number[]>;
  directRawKeyByCanon: Map<string, string>;
}

const SECTIONS: CategorySection[] = ['income', 'savings', 'expense'];
const CATEGORY_SECTIONS_LOOKUP_KEY = 'fintrack_category_sections_lookup';

const emptyMonths = (): number[] => new Array(12).fill(0);

const addMonthsInto = (target: number[], source: number[]) => {
  for (let m = 0; m < 12; m++) {
    target[m] += Number(source[m]) || 0;
  }
};

const hasNonZeroMonth = (months: number[]): boolean => months.some((v) => v !== 0);

const isSubPrefixed = (key: string): boolean => /^sub:/i.test(key.trim());

/** Canonicalizes alias keys such as "sub:15" and "15" into one shared key. */
export const canonicalBudgetKey = (key: string): string =>
  key.trim().replace(/^sub:/i, '').trim().toLowerCase();

/** Normalizes display names for resilient case/punctuation-insensitive matching. */
export const normName = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/^(income|expense|savings):/, '')
    .replace(/[^a-z0-9]/g, '');

const normalizeSection = (rawType?: string): CategorySection | null => {
  const t = String(rawType || '').trim().toLowerCase();
  if (t === 'income' || t === 'savings' || t === 'expense') return t;
  return null;
};

const isObjectArray = (val: any[]): boolean =>
  val.length > 0 && typeof val[0] === 'object' && val[0] !== null;

const isSeedOnlyItems = (items: any[]): boolean =>
  items.length > 0 && items.every((item) => item && String(item.id || '').startsWith('seed-'));

const sumTransactionItems = (items: any[]): number[] => {
  const sums = emptyMonths();
  for (const item of items) {
    if (!item || typeof item !== 'object' || !Array.isArray(item.values)) continue;
    for (let m = 0; m < 12; m++) {
      sums[m] += Number(item.values[m]) || 0;
    }
  }
  return sums;
};

const toNumericMonths = (arr: any[]): number[] => {
  const sums = emptyMonths();
  for (let m = 0; m < 12; m++) {
    sums[m] = Number(arr[m]) || 0;
  }
  return sums;
};

/**
 * Normalizes both budget stores (`fintrack-budget-transactions-*` and `fintrack-budget-*`)
 * so `"sub:<id>"` and `"<id>"` aliases deduplicate cleanly and server `TransactionDetail[]`
 * entries synced only into `fintrack-budget-*` are still counted on the Dashboard.
 */
export function normalizeBudgetStores(
  budgetTxMap: Record<string, any> | null | undefined,
  budgetDirectMap: Record<string, any> | null | undefined,
): NormalizedBudgetStores {
  const txByCanon = new Map<string, number[]>();
  const txRawKeyByCanon = new Map<string, string>();
  const txItemsByCanon = new Map<string, any[]>();
  const explicitEmptyTxCanon = new Set<string>();
  const directNumericByCanon = new Map<string, number[]>();
  const directRawKeyByCanon = new Map<string, string>();

  if (budgetTxMap && typeof budgetTxMap === 'object') {
    for (const [rawKey, val] of Object.entries(budgetTxMap)) {
      if (!Array.isArray(val)) continue;
      const canon = canonicalBudgetKey(rawKey);
      if (!canon) continue;

      if (val.length === 0) {
        if (!txByCanon.has(canon) || isSubPrefixed(rawKey)) {
          explicitEmptyTxCanon.add(canon);
          if (isSubPrefixed(rawKey)) {
            txByCanon.delete(canon);
            txItemsByCanon.delete(canon);
          }
          txRawKeyByCanon.set(canon, rawKey);
        }
        continue;
      }

      const prevKey = txRawKeyByCanon.get(canon);
      // Prefer "sub:<num>" over bare "<num>" when stale aliases diverge on numeric IDs.
      const isNumericId = /^\d+$/.test(canon);
      const shouldReplace =
        !txByCanon.has(canon) ||
        (isNumericId && isSubPrefixed(rawKey) && (!prevKey || !isSubPrefixed(prevKey))) ||
        (!isNumericId && !isSubPrefixed(rawKey) && Boolean(prevKey && isSubPrefixed(prevKey)));

      if (shouldReplace) {
        txByCanon.set(canon, sumTransactionItems(val));
        txItemsByCanon.set(canon, val);
        txRawKeyByCanon.set(canon, rawKey);
        explicitEmptyTxCanon.delete(canon);
      }
    }
  }

  if (budgetDirectMap && typeof budgetDirectMap === 'object') {
    for (const [rawKey, val] of Object.entries(budgetDirectMap)) {
      if (!Array.isArray(val)) continue;
      const canon = canonicalBudgetKey(rawKey);
      if (!canon) continue;

      if (isObjectArray(val)) {
        // Server sync writes TransactionDetail[] into fintrack-budget-{year}; honor it unless
        // fintrack-budget-transactions-{year} already has an authoritative entry (including []).
        if (!txByCanon.has(canon) && !explicitEmptyTxCanon.has(canon)) {
          txByCanon.set(canon, sumTransactionItems(val));
          txItemsByCanon.set(canon, val);
          txRawKeyByCanon.set(canon, rawKey);
        }
        continue;
      }

      if (val.length === 0) continue;
      const nums = toNumericMonths(val);
      const prevKey = directRawKeyByCanon.get(canon);
      if (!directNumericByCanon.has(canon) || (!prevKey || (!isSubPrefixed(prevKey) && isSubPrefixed(rawKey)))) {
        directNumericByCanon.set(canon, nums);
        directRawKeyByCanon.set(canon, rawKey);
      }
    }
  }

  return {
    txByCanon,
    txRawKeyByCanon,
    txItemsByCanon,
    explicitEmptyTxCanon,
    directNumericByCanon,
    directRawKeyByCanon,
  };
}

const getStoredSectionLookup = (userEmail?: string): Record<string, string> => {
  try {
    const scopedKey = getUserStorageKey(CATEGORY_SECTIONS_LOOKUP_KEY, userEmail);
    const raw =
      localStorage.getItem(scopedKey) || localStorage.getItem(CATEGORY_SECTIONS_LOOKUP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

interface SubcategoryNode {
  idKey: string | null;
  name: string;
  aliases: string[];
}

interface CategoryNode {
  name: string;
  aliases: string[];
  subcategories: SubcategoryNode[];
}

const buildRenameLookups = (userEmail?: string) => {
  const renamedCatMap = getRenamedCategoryMap(userEmail);
  const renamedSubMap = getRenamedSubcategoryMap(userEmail);
  const deletedRaw = getDeletedCategorySet(userEmail);
  const deletedExact = new Set<string>();
  deletedRaw.forEach((entry) => {
    const clean = String(entry || '').trim().toLowerCase();
    if (clean) deletedExact.add(clean);
  });

  const oldCatNamesByNew = new Map<string, string[]>();
  const catForwardByRaw = new Map<string, string>();
  for (const [oldKey, newName] of Object.entries(renamedCatMap || {})) {
    const cleanNew = String(newName || '').trim();
    if (!cleanNew) continue;
    const strippedOld = oldKey.replace(/^(income|expense|savings):/i, '').trim();
    catForwardByRaw.set(oldKey.toLowerCase(), cleanNew);
    catForwardByRaw.set(strippedOld.toLowerCase(), cleanNew);
    const normNew = `${oldKey.match(/^(income|expense|savings):/i)?.[1]?.toLowerCase() || ''}:${cleanNew.toLowerCase()}`;
    const list = oldCatNamesByNew.get(cleanNew.toLowerCase()) || [];
    list.push(strippedOld);
    oldCatNamesByNew.set(cleanNew.toLowerCase(), list);
    if (normNew.startsWith(':')) continue;
    const secList = oldCatNamesByNew.get(normNew) || [];
    secList.push(strippedOld);
    oldCatNamesByNew.set(normNew, secList);
  }

  const oldSubNamesByNew = new Map<string, string[]>();
  for (const [oldKey, newName] of Object.entries(renamedSubMap || {})) {
    const cleanNew = String(newName || '').trim();
    if (!cleanNew) continue;
    const parts = oldKey.split(':');
    const oldSub = parts[parts.length - 1].trim();
    const list = oldSubNamesByNew.get(cleanNew.toLowerCase()) || [];
    list.push(oldSub);
    oldSubNamesByNew.set(cleanNew.toLowerCase(), list);
  }

  const isCategoryDeleted = (sec: CategorySection, catName: string): boolean => {
    const lower = catName.trim().toLowerCase();
    return deletedExact.has(lower) || deletedExact.has(`${sec}:${lower}`);
  };

  return { oldCatNamesByNew, oldSubNamesByNew, catForwardByRaw, isCategoryDeleted };
};

const pickEntryByExactKey = (
  stores: NormalizedBudgetStores,
  candidateRawKeys: string[],
  consumedCanons: Set<string>,
): number[] | null => {
  for (const raw of candidateRawKeys) {
    const canon = canonicalBudgetKey(raw);
    if (!canon || consumedCanons.has(canon)) continue;
    if (stores.txByCanon.has(canon)) {
      consumedCanons.add(canon);
      return stores.txByCanon.get(canon)!;
    }
    if (!stores.explicitEmptyTxCanon.has(canon) && stores.directNumericByCanon.has(canon)) {
      consumedCanons.add(canon);
      return stores.directNumericByCanon.get(canon)!;
    }
  }
  return null;
};

const markCandidatesConsumed = (
  stores: NormalizedBudgetStores,
  candidateRawKeys: string[],
  consumedCanons: Set<string>,
) => {
  for (const raw of candidateRawKeys) {
    const canon = canonicalBudgetKey(raw);
    if (!canon) continue;
    if (
      stores.txByCanon.has(canon) ||
      stores.explicitEmptyTxCanon.has(canon) ||
      stores.directNumericByCanon.has(canon)
    ) {
      consumedCanons.add(canon);
    }
  }
};

/**
 * Resolves all monthly budget estimates across sections and categories without
 * short-circuiting after the first subcategory, while preventing double-counting across
 * `sub:<id>` / `<id>` aliases, shared subcategory names, and demo seed keys.
 */
export function resolveSectionAndCategoryBudgets(params: {
  userEmail?: string;
  apiCategories: ApiCategory[];
  apiSubcategories: ApiSubcategory[];
  transactions: any[];
  budgetTxMap: Record<string, any>;
  budgetDirectMap: Record<string, any>;
}): ResolvedBudgetBreakdown {
  const { userEmail, apiCategories, apiSubcategories, transactions, budgetTxMap, budgetDirectMap } =
    params;
  const stores = normalizeBudgetStores(budgetTxMap, budgetDirectMap);
  const sectionLookup = getStoredSectionLookup(userEmail);
  const { oldCatNamesByNew, oldSubNamesByNew, catForwardByRaw, isCategoryDeleted } =
    buildRenameLookups(userEmail);

  const tree: Record<CategorySection, CategoryNode[]> = {
    income: [],
    savings: [],
    expense: [],
  };

  const seenCatInSec: Record<CategorySection, Set<string>> = {
    income: new Set(),
    savings: new Set(),
    expense: new Set(),
  };

  const subsByCatId = new Map<number, ApiSubcategory[]>();
  for (const sub of apiSubcategories || []) {
    if (sub?.categoryId == null || !sub.name) continue;
    const arr = subsByCatId.get(Number(sub.categoryId)) || [];
    arr.push(sub);
    subsByCatId.set(Number(sub.categoryId), arr);
  }

  const ensureCategory = (
    sec: CategorySection,
    rawName: string,
    defaultSubs?: SubcategoryNode[],
  ): CategoryNode | null => {
    const name = rawName.trim();
    if (!name || isCategoryDeleted(sec, name)) return null;
    const key = normName(name);
    if (!key) return null;

    if (seenCatInSec[sec].has(key)) {
      return tree[sec].find((c) => normName(c.name) === key) || null;
    }

    const oldNames = [
      ...(oldCatNamesByNew.get(`${sec}:${name.toLowerCase()}`) || []),
      ...(oldCatNamesByNew.get(name.toLowerCase()) || []),
    ];

    const node: CategoryNode = {
      name,
      aliases: Array.from(new Set([name, ...oldNames])),
      subcategories: defaultSubs ? [...defaultSubs] : [],
    };
    seenCatInSec[sec].add(key);
    tree[sec].push(node);
    return node;
  };

  // 1. Primary category/subcategory tree from MySQL API when available.
  if (Array.isArray(apiCategories) && apiCategories.length > 0) {
    for (const cat of apiCategories) {
      const sec = normalizeSection(cat.type) || 'expense';
      if (!cat.name) continue;
      const dbSubs = cat.id != null ? subsByCatId.get(Number(cat.id)) || [] : [];
      const fallbackSubNames = DEFAULT_SUBCATEGORIES_BY_CATEGORY[cat.name.trim()] || [];

      const subNodes: SubcategoryNode[] =
        dbSubs.length > 0
          ? dbSubs.map((s) => ({
              idKey: s.id != null ? `sub:${s.id}` : null,
              name: s.name.trim(),
              aliases: Array.from(
                new Set([s.name.trim(), ...(oldSubNamesByNew.get(s.name.trim().toLowerCase()) || [])]),
              ),
            }))
          : fallbackSubNames.map((sName) => ({
              idKey: null,
              name: sName,
              aliases: Array.from(
                new Set([sName, ...(oldSubNamesByNew.get(sName.toLowerCase()) || [])]),
              ),
            }));

      ensureCategory(sec, cat.name, subNodes);
    }
  } else {
    // 2. Cached categories or static defaults when offline / before API response arrives.
    const cached = categoryService.getCachedCategoriesByType(userEmail);
    const hasCached = SECTIONS.some((sec) => Object.keys(cached[sec] || {}).length > 0);
    for (const sec of SECTIONS) {
      const sourceObj = hasCached ? cached[sec] : null;
      const catNames =
        sourceObj && Object.keys(sourceObj).length > 0
          ? Object.keys(sourceObj)
          : DEFAULT_CATEGORIES[sec];

      for (const catName of catNames) {
        const subNames =
          (sourceObj && Array.isArray(sourceObj[catName]) && sourceObj[catName].length > 0
            ? sourceObj[catName]
            : DEFAULT_SUBCATEGORIES_BY_CATEGORY[catName]) || [];
        ensureCategory(
          sec,
          catName,
          subNames.map((sName) => ({
            idKey: null,
            name: sName,
            aliases: Array.from(
              new Set([sName, ...(oldSubNamesByNew.get(sName.toLowerCase()) || [])]),
            ),
          })),
        );
      }
    }
  }

  // Ensure any active transaction categories not yet in the tree have rows too.
  const junkNames = new Set(['ht', 'sd', 'tes', 'test', 'uncategorized']);
  for (const t of transactions || []) {
    const rawCat = String(t?.category || '').trim();
    if (!rawCat || junkNames.has(rawCat.toLowerCase())) continue;
    const tType = String(t?.type || '').toLowerCase();
    const tCatLower = rawCat.toLowerCase();
    let sec: CategorySection = 'expense';
    if (tType === 'income' || tCatLower.includes('salary') || tCatLower.includes('dividend')) {
      sec = 'income';
    } else if (
      tType === 'savings' ||
      tCatLower.includes('invest') ||
      tCatLower.includes('saving') ||
      tCatLower.includes('fund') ||
      tCatLower.includes('401k')
    ) {
      sec = 'savings';
    }
    const renamed =
      catForwardByRaw.get(`${sec}:${tCatLower}`) || catForwardByRaw.get(tCatLower) || rawCat;
    ensureCategory(sec, renamed);
  }

  // Count shared subcategory names across categories so ambiguous bare keys aren't guessed blindly.
  const subNameOccurrences = new Map<string, number>();
  for (const sec of SECTIONS) {
    for (const cat of tree[sec]) {
      for (const sub of cat.subcategories) {
        const k = sub.name.trim().toLowerCase();
        subNameOccurrences.set(k, (subNameOccurrences.get(k) || 0) + 1);
      }
    }
  }

  const consumedCanons = new Set<string>();
  const rowMapBySection: Record<CategorySection, Map<string, number[]>> = {
    income: new Map(),
    savings: new Map(),
    expense: new Map(),
  };
  const displayNameByNorm: Record<CategorySection, Map<string, string>> = {
    income: new Map(),
    savings: new Map(),
    expense: new Map(),
  };

  for (const sec of SECTIONS) {
    for (const cat of tree[sec]) {
      const catNorm = normName(cat.name);
      displayNameByNorm[sec].set(catNorm, cat.name);
      rowMapBySection[sec].set(catNorm, emptyMonths());
    }
  }

  // Pass 1A: Unambiguous subcategory IDs ("sub:<id>" / "<id>") and qualified "sec:cat:sub" / "cat:sub" keys.
  for (const sec of SECTIONS) {
    for (const cat of tree[sec]) {
      const catMonths = rowMapBySection[sec].get(normName(cat.name))!;
      for (const sub of cat.subcategories) {
        const unambiguousKeys: string[] = [];
        if (sub.idKey) unambiguousKeys.push(sub.idKey);
        for (const catAlias of cat.aliases) {
          for (const subAlias of sub.aliases) {
            unambiguousKeys.push(`${sec}:${catAlias}:${subAlias}`);
            unambiguousKeys.push(`${catAlias}:${subAlias}`);
          }
        }
        const matched = pickEntryByExactKey(stores, unambiguousKeys, consumedCanons);
        if (matched) {
          addMonthsInto(catMonths, matched);
          // Mark bare unique aliases consumed to prevent Pass 1B or Pass 2 double-counting.
          if ((subNameOccurrences.get(sub.name.trim().toLowerCase()) || 0) <= 1) {
            markCandidatesConsumed(stores, sub.aliases, consumedCanons);
          }
        }
      }
    }
  }

  // Pass 1B: Bare subcategory-name fallback (only when unambiguous key wasn't matched and name isn't shared across categories).
  for (const sec of SECTIONS) {
    for (const cat of tree[sec]) {
      const catMonths = rowMapBySection[sec].get(normName(cat.name))!;
      for (const sub of cat.subcategories) {
        if ((subNameOccurrences.get(sub.name.trim().toLowerCase()) || 0) > 1) continue;
        const bareCandidates = sub.aliases;
        const matched = pickEntryByExactKey(stores, bareCandidates, consumedCanons);
        if (matched) {
          addMonthsInto(catMonths, matched);
        }
      }
    }
  }

  // Pass 1C: Category-level fallback (used when subcategories summed to 0; always marks category aliases consumed).
  for (const sec of SECTIONS) {
    for (const cat of tree[sec]) {
      const catMonths = rowMapBySection[sec].get(normName(cat.name))!;
      const catCandidates: string[] = [];
      for (const catAlias of cat.aliases) {
        catCandidates.push(`${sec}:${catAlias}`);
        catCandidates.push(catAlias);
      }

      if (hasNonZeroMonth(catMonths)) {
        markCandidatesConsumed(stores, catCandidates, consumedCanons);
      } else {
        const matched = pickEntryByExactKey(stores, catCandidates, consumedCanons);
        if (matched) {
          addMonthsInto(catMonths, matched);
        }
      }
    }
  }

  // Pass 2: Capture any non-seed unconsumed budget entries (e.g. newly created DB items before category refetch).
  const collectUnconsumed = (
    sourceMap: Map<string, number[]>,
    rawKeyMap: Map<string, string>,
    checkItems: boolean,
  ) => {
    for (const [canon, months] of sourceMap.entries()) {
      if (consumedCanons.has(canon) || !hasNonZeroMonth(months)) continue;
      if (checkItems) {
        const items = stores.txItemsByCanon.get(canon) || [];
        if (isSeedOnlyItems(items)) {
          consumedCanons.add(canon);
          continue;
        }
      } else if (stores.explicitEmptyTxCanon.has(canon)) {
        continue;
      }

      const rawKey = rawKeyMap.get(canon) || canon;
      const items = checkItems ? stores.txItemsByCanon.get(canon) || [] : [];
      const itemWithMeta = items.find((it) => it && (it.type || it.category));

      let sec: CategorySection | null =
        normalizeSection(itemWithMeta?.type) ||
        normalizeSection(sectionLookup[rawKey]) ||
        normalizeSection(sectionLookup[`sub:${canon}`]) ||
        normalizeSection(sectionLookup[canon]);

      let catName = itemWithMeta?.category ? String(itemWithMeta.category).trim() : '';

      const keyParts = rawKey.replace(/^sub:/i, '').split(':');
      if (!sec && keyParts.length >= 2) {
        sec = normalizeSection(keyParts[0]);
      }
      if (!catName) {
        if (keyParts.length >= 2 && normalizeSection(keyParts[0])) {
          catName = keyParts[1].trim();
        } else if (keyParts.length >= 2) {
          catName = keyParts[0].trim();
        } else if (!/^\d+$/.test(canon)) {
          catName = rawKey.replace(/^sub:/i, '').trim();
        }
      }

      if (!sec) {
        const matchedTx = (transactions || []).find(
          (t) => t?.category && normName(t.category) === normName(catName || rawKey),
        );
        if (matchedTx) {
          sec = normalizeSection(matchedTx.type) || 'expense';
        }
      }

      if (!sec) continue;
      if (!catName) {
        catName =
          sec === 'income' ? 'Other Income' : sec === 'savings' ? 'Other Savings' : 'Other Expenses';
      }
      if (isCategoryDeleted(sec, catName)) continue;

      const cNorm = normName(catName);
      if (!cNorm) continue;
      if (!rowMapBySection[sec].has(cNorm)) {
        rowMapBySection[sec].set(cNorm, emptyMonths());
        displayNameByNorm[sec].set(cNorm, catName);
      }
      addMonthsInto(rowMapBySection[sec].get(cNorm)!, months);
      consumedCanons.add(canon);
    }
  };

  collectUnconsumed(stores.txByCanon, stores.txRawKeyByCanon, true);
  collectUnconsumed(stores.directNumericByCanon, stores.directRawKeyByCanon, false);

  // Assemble final rows & per-section 12-month totals.
  const categoriesBySection: Record<CategorySection, CategoryBudgetRow[]> = {
    income: [],
    savings: [],
    expense: [],
  };
  const sectionMonthlyTotals: Record<CategorySection, number[]> = {
    income: emptyMonths(),
    savings: emptyMonths(),
    expense: emptyMonths(),
  };

  for (const sec of SECTIONS) {
    for (const [cNorm, monthlyBudgets] of rowMapBySection[sec].entries()) {
      const name = displayNameByNorm[sec].get(cNorm) || cNorm;
      categoriesBySection[sec].push({ name, monthlyBudgets });
      addMonthsInto(sectionMonthlyTotals[sec], monthlyBudgets);
    }
  }

  const resolveCategoryName = (sec: CategorySection, rawCategoryName: string): string => {
    const clean = String(rawCategoryName || '').trim();
    if (!clean) return '';
    const renamed =
      catForwardByRaw.get(`${sec}:${clean.toLowerCase()}`) ||
      catForwardByRaw.get(clean.toLowerCase()) ||
      clean;
    const cNorm = normName(renamed);
    return displayNameByNorm[sec].get(cNorm) || renamed;
  };

  return {
    categoriesBySection,
    sectionMonthlyTotals,
    resolveCategoryName,
  };
}
