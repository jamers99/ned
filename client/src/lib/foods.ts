// Shared with tools/nara-import, which files imported foods under the same categories.
import type { FoodCategory } from './db.ts';

export const foodPresets: Record<Exclude<FoodCategory, 'Other'>, string[]> = {
  Fruit: ['Banana', 'Blueberries', 'Apple', 'Avocado', 'Strawberries', 'Applesauce', 'Grapes', 'Pear', 'Mango',
    'Peach', 'Prunes'],
  Veggies: ['Sweet potato', 'Potato', 'Carrot', 'Peas', 'Broccoli', 'Zucchini', 'Spinach', 'Mushrooms',
    'Green beans', 'Squash', 'Pumpkin', 'Cauliflower'],
  Protein: ['Chicken', 'Egg', 'Fish', 'Turkey', 'Pork', 'Steak', 'Yogurt', 'Beef', 'Salmon', 'Beans', 'Lentils',
    'Peanut butter', 'Cheese', 'Tofu'],
  Grains: ['Cereal', 'Oatmeal', 'Rice', 'Bread', 'Pasta', 'Puffs', 'Crackers', 'Toast', 'Pancake', 'Quinoa']
};

export function presetCategory(name: string): FoodCategory {
  const key = name.trim().toLowerCase();
  for (const [category, names] of Object.entries(foodPresets))
    if (names.some(n => n.toLowerCase() === key)) return category as FoodCategory;
  return 'Other';
}
