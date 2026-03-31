/**
 * Maps mesh name patterns to a named category and the finish families
 * allowed for that category.
 *
 * To add a new category:
 *   1. Push a new rule object into CATEGORY_RULES.
 *   2. List the finish families the category should accept.
 */

export const CATEGORY_RULES = [
  {
    category: "wall",
    match: (name) => name.toLowerCase().includes("wall"),
    families: ["plaster", "tile"],
  },
  {
    category: "floor",
    match: (name) => name.toLowerCase().includes("floor"),
    families: ["wood", "tile"],
  },
  {
    category: "cabinet",
    match: (name) => name.toLowerCase().includes("cabinet"),
    families: ["wood", "metal", "plaster"],
  },
  {
    category: "door",
    match: (name) => name.toLowerCase().includes("door"),
    families: ["wood", "metal"],
  },
]

/**
 * Returns the category name for a given mesh name, or null if none matched.
 */
export function getCategoryFromName(name) {
  if (!name) return null
  for (const rule of CATEGORY_RULES) {
    if (rule.match(name)) return rule.category
  }
  return null
}

/**
 * Returns the ordered list of finish families allowed for a category.
 */
export function getFamiliesForCategory(category) {
  const rule = CATEGORY_RULES.find((r) => r.category === category)
  return rule?.families ?? []
}
