// A finite, curated taxonomy — not an exhaustive catalog of every possible
// item (that isn't realistic to hand-author), but enough breadth to guide
// someone to a specific product type in a few clicks. Extend freely; the
// UI just needs { name: string; subcategories: string[] }.
export type CategoryGroup = { name: string; subcategories: string[] };

export const CATEGORY_TREE: CategoryGroup[] = [
  {
    name: "Groceries & Food",
    subcategories: [
      "Dairy & Eggs",
      "Bakery",
      "Fruits & Vegetables",
      "Meat & Poultry",
      "Frozen Foods",
      "Canned & Packaged Goods",
      "Snacks & Sweets",
      "Beverages",
      "Rice, Pasta & Grains",
      "Cooking Oils & Condiments"
    ]
  },
  {
    name: "Clothes & Fashion",
    subcategories: ["Men's Clothing", "Women's Clothing", "Kids' Clothing", "Shoes", "Bags & Accessories"]
  },
  {
    name: "Electronics",
    subcategories: ["Mobile Phones", "Laptops & Computers", "TVs & Displays", "Home Appliances", "Audio & Headphones"]
  },
  {
    name: "Car Parts & Accessories",
    subcategories: ["Tires & Wheels", "Batteries", "Oils & Fluids", "Filters", "Car Electronics", "Exterior & Body"]
  },
  {
    name: "Home & Garden",
    subcategories: ["Furniture", "Kitchenware", "Cleaning Supplies", "Tools & Hardware", "Garden & Outdoor"]
  },
  {
    name: "Health & Beauty",
    subcategories: ["Skincare", "Haircare", "Makeup", "Personal Care", "Vitamins & Supplements"]
  },
  {
    name: "Other",
    subcategories: ["Other"]
  }
];
