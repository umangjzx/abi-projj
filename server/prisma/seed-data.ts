/**
 * Catalogue definition for the seed. Kept separate from seed.ts so the data is
 * easy to extend without touching the seeding logic.
 *
 * Prices are indicative Indian retail dairy prices (INR).
 */

export interface SeedVariant {
  name: string;
  price: number;
  mrp: number;
  unit: string;
  packSize?: string;
  weightGram?: number;
  stock: number;
  isDefault?: boolean;
}

export interface SeedProduct {
  name: string;
  shortDescription: string;
  description: string;
  tags: string[];
  attributes: Record<string, string | number | boolean>;
  isFeatured?: boolean;
  /** Relative sales weight used when generating the synthetic order history. */
  popularity: number;
  /** 1 = flat all year, >1 = summer-skewed, <1 = winter-skewed. */
  seasonality?: number;
  variants: SeedVariant[];
  image: string;
}

export interface SeedCategory {
  name: string;
  description: string;
  image: string;
  products: SeedProduct[];
}

// Unsplash source URLs -- stable, royalty free, and no API key needed. They are
// only placeholders: the admin can replace any image via the Cloudinary upload.
const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=70`;

export const CATEGORIES: SeedCategory[] = [
  {
    name: 'Milk',
    description: 'Farm-fresh cow and buffalo milk, pasteurised and delivered within hours of milking.',
    image: img('photo-1550583724-b2692b85b150'),
    products: [
      {
        name: 'Toned Fresh Milk',
        shortDescription: 'Everyday pasteurised toned milk, 3% fat.',
        description:
          'Our best-selling everyday milk, collected from local farms each morning and pasteurised the same day. Toned to 3% fat for a light body that works equally well in tea, coffee and cereal. Homogenised so the cream stays evenly distributed, with no added preservatives.',
        tags: ['milk', 'toned', 'daily', 'pasteurised'],
        attributes: { 'Fat content': '3.0%', 'SNF': '8.5%', 'Shelf life': '2 days refrigerated', Type: 'Cow milk', Pasteurised: 'Yes' },
        isFeatured: true,
        popularity: 100,
        seasonality: 1.05,
        image: img('photo-1550583724-b2692b85b150'),
        variants: [
          { name: '500 ml pouch', price: 27, mrp: 30, unit: 'pouch', packSize: '500 ml', weightGram: 500, stock: 260, isDefault: true },
          { name: '1 L pouch', price: 54, mrp: 60, unit: 'pouch', packSize: '1 L', weightGram: 1000, stock: 180 },
          { name: '1 L bottle', price: 62, mrp: 70, unit: 'bottle', packSize: '1 L', weightGram: 1000, stock: 90 },
        ],
      },
      {
        name: 'Full Cream Milk',
        shortDescription: 'Rich 6% fat buffalo milk for tea, sweets and kheer.',
        description:
          'Thick, creamy buffalo milk with 6% fat -- the milk our customers reach for when making payasam, kheer or a strong filter coffee. Naturally higher in solids, so it thickens beautifully when reduced.',
        tags: ['milk', 'full cream', 'buffalo', 'rich'],
        attributes: { 'Fat content': '6.0%', 'SNF': '9.0%', 'Shelf life': '2 days refrigerated', Type: 'Buffalo milk', Pasteurised: 'Yes' },
        isFeatured: true,
        popularity: 78,
        image: img('photo-1563636619-e9143da7973b'),
        variants: [
          { name: '500 ml pouch', price: 34, mrp: 38, unit: 'pouch', packSize: '500 ml', weightGram: 500, stock: 210, isDefault: true },
          { name: '1 L pouch', price: 66, mrp: 74, unit: 'pouch', packSize: '1 L', weightGram: 1000, stock: 140 },
        ],
      },
      {
        name: 'A2 Desi Cow Milk',
        shortDescription: 'Single-breed Gir cow milk with A2 beta-casein.',
        description:
          'Sourced exclusively from indigenous Gir cows raised on open pasture, this milk carries only the A2 variant of beta-casein protein, which many customers find easier to digest. Glass-bottled to preserve flavour, in limited daily quantities.',
        tags: ['milk', 'a2', 'desi', 'premium', 'gir'],
        attributes: { 'Fat content': '4.5%', Protein: 'A2 beta-casein', Breed: 'Gir cow', Feed: 'Open pasture', Packaging: 'Glass bottle' },
        isFeatured: true,
        popularity: 42,
        image: img('photo-1628088062854-d1870b4553da'),
        variants: [
          { name: '500 ml bottle', price: 65, mrp: 75, unit: 'bottle', packSize: '500 ml', weightGram: 500, stock: 70, isDefault: true },
          { name: '1 L bottle', price: 125, mrp: 145, unit: 'bottle', packSize: '1 L', weightGram: 1000, stock: 45 },
        ],
      },
      {
        name: 'Double Toned Milk',
        shortDescription: 'Light 1.5% fat milk for calorie-conscious households.',
        description:
          'The lightest milk in our range at 1.5% fat, with protein and calcium levels kept intact. A practical everyday choice for anyone watching their fat intake without giving up milk.',
        tags: ['milk', 'double toned', 'low fat', 'healthy'],
        attributes: { 'Fat content': '1.5%', 'SNF': '9.0%', 'Shelf life': '2 days refrigerated', Type: 'Cow milk' },
        popularity: 34,
        image: img('photo-1584949091598-c31daaaa4aa9'),
        variants: [
          { name: '500 ml pouch', price: 24, mrp: 27, unit: 'pouch', packSize: '500 ml', weightGram: 500, stock: 150, isDefault: true },
          { name: '1 L pouch', price: 47, mrp: 53, unit: 'pouch', packSize: '1 L', weightGram: 1000, stock: 110 },
        ],
      },
      {
        name: 'Cow Milk Tetra Pack',
        shortDescription: 'Long-life UHT milk, no refrigeration needed until opened.',
        description:
          'Ultra-heat-treated milk in an aseptic tetra carton, sealed to stay fresh unrefrigerated for months. Ideal for stocking up, travel, or households without daily delivery access.',
        tags: ['milk', 'uht', 'tetra pack', 'long life'],
        attributes: { 'Fat content': '3.5%', Treatment: 'UHT', 'Shelf life': '90 days unopened', Type: 'Cow milk' },
        popularity: 30,
        image: img('photo-1600788907416-456578634209'),
        variants: [
          { name: '1 L tetra pack', price: 68, mrp: 76, unit: 'carton', packSize: '1 L', weightGram: 1000, stock: 160, isDefault: true },
          { name: '200 ml tetra pack', price: 16, mrp: 18, unit: 'carton', packSize: '200 ml', weightGram: 200, stock: 220 },
        ],
      },
      {
        name: 'Organic A2 Buffalo Milk',
        shortDescription: 'Certified-organic buffalo milk from grass-fed herds.',
        description:
          'Sourced from a certified-organic farm where buffaloes graze on pesticide-free pasture. Richer and creamier than regular buffalo milk, with none of the antibiotics or growth hormones used on conventional dairy farms.',
        tags: ['milk', 'organic', 'buffalo', 'a2', 'premium'],
        attributes: { 'Fat content': '7.0%', Certification: 'Organic', Feed: 'Pesticide-free pasture', Type: 'Buffalo milk' },
        isFeatured: true,
        popularity: 38,
        image: img('photo-1571212515416-fef01fc43637'),
        variants: [
          { name: '500 ml pouch', price: 72, mrp: 82, unit: 'pouch', packSize: '500 ml', weightGram: 500, stock: 60, isDefault: true },
          { name: '1 L pouch', price: 138, mrp: 158, unit: 'pouch', packSize: '1 L', weightGram: 1000, stock: 40 },
        ],
      },
      {
        name: 'Skimmed Milk Powder',
        shortDescription: 'Instant, fat-free milk powder for baking and beverages.',
        description:
          'Spray-dried skimmed milk that dissolves instantly in warm water. A pantry staple for households that run short between deliveries, and a common base for baking and homemade sweets.',
        tags: ['milk', 'powder', 'skimmed', 'pantry', 'baking'],
        attributes: { 'Fat content': '<1.5%', Form: 'Spray-dried powder', 'Shelf life': '12 months unopened' },
        popularity: 20,
        seasonality: 0.85,
        image: img('photo-1563636619-e9143da7973b'),
        variants: [
          { name: '200 g pack', price: 95, mrp: 110, unit: 'pack', packSize: '200 g', weightGram: 200, stock: 90, isDefault: true },
          { name: '500 g pack', price: 220, mrp: 250, unit: 'pack', packSize: '500 g', weightGram: 500, stock: 55 },
        ],
      },
    ],
  },
  {
    name: 'Curd & Yoghurt',
    description: 'Thick set curd and probiotic yoghurts cultured in small batches.',
    image: img('photo-1488477181946-6428a0291777'),
    products: [
      {
        name: 'Thick Set Curd',
        shortDescription: 'Traditional set curd, mildly sour and firm.',
        description:
          'Set in individual cups the traditional way, using a live culture and no thickeners or stabilisers. Firm enough to hold a spoon upright, with the gentle sourness that suits curd rice and a South Indian meal.',
        tags: ['curd', 'dahi', 'set curd', 'probiotic'],
        attributes: { Culture: 'Live lactic cultures', 'Fat content': '4.0%', 'Shelf life': '5 days refrigerated', Thickeners: 'None' },
        isFeatured: true,
        popularity: 88,
        seasonality: 1.35,
        image: img('photo-1488477181946-6428a0291777'),
        variants: [
          { name: '200 g cup', price: 22, mrp: 25, unit: 'cup', packSize: '200 g', weightGram: 200, stock: 240, isDefault: true },
          { name: '400 g cup', price: 42, mrp: 48, unit: 'cup', packSize: '400 g', weightGram: 400, stock: 160 },
          { name: '1 kg tub', price: 98, mrp: 112, unit: 'tub', packSize: '1 kg', weightGram: 1000, stock: 80 },
        ],
      },
      {
        name: 'Greek Yoghurt',
        shortDescription: 'Strained yoghurt with 9 g protein per 100 g.',
        description:
          'Strained for hours to remove whey, giving a dense, spoonable texture and roughly triple the protein of regular curd. Unsweetened, so it works in both savoury dips and fruit bowls.',
        tags: ['yoghurt', 'greek', 'protein', 'high protein'],
        attributes: { Protein: '9 g per 100 g', 'Fat content': '5.0%', Strained: 'Yes', 'Added sugar': 'None' },
        isFeatured: true,
        popularity: 46,
        seasonality: 1.2,
        image: img('photo-1571212515416-fef01fc43637'),
        variants: [
          { name: '150 g cup', price: 48, mrp: 55, unit: 'cup', packSize: '150 g', weightGram: 150, stock: 120, isDefault: true },
          { name: '400 g tub', price: 118, mrp: 135, unit: 'tub', packSize: '400 g', weightGram: 400, stock: 65 },
        ],
      },
      {
        name: 'Masala Buttermilk',
        shortDescription: 'Spiced chilled buttermilk with curry leaf and ginger.',
        description:
          'Churned curd thinned with water and seasoned with green chilli, ginger, curry leaf and a pinch of asafoetida. Our fastest-moving summer line -- served chilled, it settles a heavy meal.',
        tags: ['buttermilk', 'chaas', 'masala', 'summer', 'spiced'],
        attributes: { Spices: 'Ginger, chilli, curry leaf', 'Serve': 'Chilled', 'Shelf life': '3 days refrigerated' },
        popularity: 62,
        seasonality: 1.9,
        image: img('photo-1626078299034-b0b3f6c4d21c'),
        variants: [
          { name: '200 ml bottle', price: 15, mrp: 18, unit: 'bottle', packSize: '200 ml', weightGram: 200, stock: 200, isDefault: true },
          { name: '500 ml bottle', price: 32, mrp: 38, unit: 'bottle', packSize: '500 ml', weightGram: 500, stock: 130 },
        ],
      },
      {
        name: 'Fruit Yoghurt',
        shortDescription: 'Real-fruit yoghurt in mango, strawberry and mixed berry.',
        description:
          'Creamy yoghurt layered with real fruit pulp and no artificial colour. A lunchbox favourite that keeps well for a day outside the fridge in an insulated bag.',
        tags: ['yoghurt', 'fruit', 'mango', 'strawberry', 'kids'],
        attributes: { Flavours: 'Mango, strawberry, mixed berry', 'Fruit content': '12%', 'Artificial colour': 'None' },
        popularity: 38,
        seasonality: 1.3,
        image: img('photo-1488900128323-21503983a07e'),
        variants: [
          { name: 'Mango 100 g', price: 25, mrp: 30, unit: 'cup', packSize: '100 g', weightGram: 100, stock: 140, isDefault: true },
          { name: 'Strawberry 100 g', price: 25, mrp: 30, unit: 'cup', packSize: '100 g', weightGram: 100, stock: 130 },
          { name: 'Mixed berry 100 g', price: 27, mrp: 32, unit: 'cup', packSize: '100 g', weightGram: 100, stock: 95 },
        ],
      },
      {
        name: 'Hung Curd',
        shortDescription: 'Strained curd, thick enough to stand a spoon in.',
        description:
          'Regular curd hung in muslin for hours to drain the whey, leaving a dense, almost cheese-like texture. The base for dips, kebabs marinades and a richer alternative to cream in cooking.',
        tags: ['curd', 'hung curd', 'chakka', 'cooking'],
        attributes: { Texture: 'Dense, strained', 'Fat content': '5.0%', 'Best for': 'Dips, marinades, shrikhand' },
        popularity: 32,
        image: img('photo-1571212515416-fef01fc43637'),
        variants: [
          { name: '200 g cup', price: 55, mrp: 62, unit: 'cup', packSize: '200 g', weightGram: 200, stock: 100, isDefault: true },
          { name: '500 g tub', price: 128, mrp: 145, unit: 'tub', packSize: '500 g', weightGram: 500, stock: 60 },
        ],
      },
      {
        name: 'Probiotic Drinking Yoghurt',
        shortDescription: 'Live-culture yoghurt drink in mango and plain.',
        description:
          'A pourable, live-culture yoghurt drink with billions of probiotic CFUs per bottle. Lighter than lassi, meant to be drunk straight from the bottle rather than eaten with a spoon.',
        tags: ['yoghurt', 'probiotic', 'drink', 'gut health'],
        attributes: { Culture: 'Live probiotic (Lactobacillus)', Flavours: 'Plain, mango', 'Serve': 'Chilled' },
        popularity: 26,
        seasonality: 1.15,
        image: img('photo-1600718374662-0483d2b9da44'),
        variants: [
          { name: 'Plain 200 ml', price: 38, mrp: 44, unit: 'bottle', packSize: '200 ml', weightGram: 200, stock: 110, isDefault: true },
          { name: 'Mango 200 ml', price: 40, mrp: 46, unit: 'bottle', packSize: '200 ml', weightGram: 200, stock: 95 },
        ],
      },
      {
        name: 'Paneer Yoghurt Dip',
        shortDescription: 'Herbed yoghurt-paneer dip for snacks and wraps.',
        description:
          'Crumbled paneer folded into thick curd with roasted cumin, mint and a touch of garlic. Ready to scoop with chips or spread inside a roll -- no prep needed.',
        tags: ['yoghurt', 'dip', 'paneer', 'snack'],
        attributes: { 'Main ingredients': 'Curd, paneer, herbs', 'Serve': 'Chilled', 'Shelf life': '5 days refrigerated' },
        popularity: 18,
        image: img('photo-1631452180519-c014fe946bc7'),
        variants: [
          { name: '150 g tub', price: 65, mrp: 75, unit: 'tub', packSize: '150 g', weightGram: 150, stock: 70, isDefault: true },
        ],
      },
    ],
  },
  {
    name: 'Butter & Ghee',
    description: 'Hand-churned butter and slow-cooked bilona ghee.',
    image: img('photo-1589985270826-4b7bb135bc9d'),
    products: [
      {
        name: 'Table Butter',
        shortDescription: 'Creamy salted butter, churned fresh daily.',
        description:
          'Churned from pasteurised cream with a light salting, giving a clean dairy flavour that spreads straight from the fridge after a minute on the counter. No emulsifiers or vegetable oil.',
        tags: ['butter', 'salted', 'table butter', 'spread'],
        attributes: { 'Milk fat': '80%', Salt: '1.5%', Type: 'Salted', 'Shelf life': '6 months frozen' },
        isFeatured: true,
        popularity: 72,
        seasonality: 0.85,
        image: img('photo-1589985270826-4b7bb135bc9d'),
        variants: [
          { name: '100 g block', price: 58, mrp: 64, unit: 'block', packSize: '100 g', weightGram: 100, stock: 190, isDefault: true },
          { name: '500 g block', price: 275, mrp: 305, unit: 'block', packSize: '500 g', weightGram: 500, stock: 85 },
        ],
      },
      {
        name: 'Unsalted White Butter',
        shortDescription: 'Makkhan, the way it is churned at home.',
        description:
          'Traditional white butter churned from cultured cream with no salt added -- the makkhan for parathas, and the starting point for making your own ghee at home.',
        tags: ['butter', 'unsalted', 'makkhan', 'white butter'],
        attributes: { 'Milk fat': '78%', Salt: 'None', Type: 'Unsalted cultured' },
        popularity: 40,
        seasonality: 0.8,
        image: img('photo-1603569283847-aa295f0d016a'),
        variants: [
          { name: '200 g tub', price: 105, mrp: 118, unit: 'tub', packSize: '200 g', weightGram: 200, stock: 110, isDefault: true },
          { name: '500 g tub', price: 250, mrp: 280, unit: 'tub', packSize: '500 g', weightGram: 500, stock: 60 },
        ],
      },
      {
        name: 'Bilona Cow Ghee',
        shortDescription: 'Hand-churned A2 ghee, slow-cooked in small batches.',
        description:
          'Made the bilona way: curd is churned to butter, then simmered slowly over a low flame until the milk solids caramelise and the aroma turns nutty. Roughly 30 litres of milk go into each litre of ghee, which is why it tastes nothing like industrial ghee.',
        tags: ['ghee', 'bilona', 'a2', 'premium', 'cow ghee'],
        attributes: { Method: 'Bilona hand-churned', Source: 'A2 cow milk', 'Milk per litre': '~30 L', Grain: 'Coarse', 'Shelf life': '12 months' },
        isFeatured: true,
        popularity: 55,
        seasonality: 0.7,
        image: img('photo-1631206753348-db44968fd440'),
        variants: [
          { name: '200 ml jar', price: 320, mrp: 360, unit: 'jar', packSize: '200 ml', weightGram: 200, stock: 75, isDefault: true },
          { name: '500 ml jar', price: 760, mrp: 850, unit: 'jar', packSize: '500 ml', weightGram: 500, stock: 42 },
          { name: '1 L tin', price: 1450, mrp: 1650, unit: 'tin', packSize: '1 L', weightGram: 1000, stock: 20 },
        ],
      },
      {
        name: 'Buffalo Ghee',
        shortDescription: 'Granular buffalo ghee for festive cooking.',
        description:
          'Denser and whiter than cow ghee, with a pronounced grain that melts cleanly into halwa and festive sweets. A kitchen staple where quantity matters as much as aroma.',
        tags: ['ghee', 'buffalo', 'cooking', 'festive'],
        attributes: { Source: 'Buffalo milk', Grain: 'Granular', Colour: 'White', 'Shelf life': '12 months' },
        popularity: 30,
        seasonality: 0.75,
        image: img('photo-1608500218890-c4f9019eaa4c'),
        variants: [
          { name: '500 ml jar', price: 590, mrp: 660, unit: 'jar', packSize: '500 ml', weightGram: 500, stock: 55, isDefault: true },
          { name: '1 L tin', price: 1120, mrp: 1280, unit: 'tin', packSize: '1 L', weightGram: 1000, stock: 28 },
        ],
      },
      {
        name: 'Garlic Herb Butter',
        shortDescription: 'Compound butter folded with roasted garlic and herbs.',
        description:
          'Table butter whipped with roasted garlic, parsley and a touch of black pepper. Melts straight onto garlic bread, grilled corn or a hot dosa without needing a separate spread.',
        tags: ['butter', 'garlic', 'herb', 'compound butter'],
        attributes: { 'Milk fat': '78%', Flavour: 'Roasted garlic & herbs', Type: 'Compound butter' },
        popularity: 24,
        image: img('photo-1603569283847-aa295f0d016a'),
        variants: [
          { name: '150 g tub', price: 95, mrp: 108, unit: 'tub', packSize: '150 g', weightGram: 150, stock: 80, isDefault: true },
        ],
      },
      {
        name: 'Cultured French-Style Butter',
        shortDescription: 'Slow-cultured butter with a tangy, complex flavour.',
        description:
          'Cream is cultured for 12 hours before churning, the way European-style butter is made, giving it a mild tang that plain butter does not have. Best appreciated on warm bread rather than melted into a dish.',
        tags: ['butter', 'cultured', 'premium', 'european style'],
        isFeatured: true,
        attributes: { 'Milk fat': '82%', Method: 'Slow-cultured (12 hr)', Style: 'European' },
        popularity: 22,
        image: img('photo-1589985270826-4b7bb135bc9d'),
        variants: [
          { name: '200 g block', price: 175, mrp: 195, unit: 'block', packSize: '200 g', weightGram: 200, stock: 50, isDefault: true },
        ],
      },
      {
        name: 'Cow Ghee Value Pack',
        shortDescription: 'Everyday cow ghee in a large refill tin.',
        description:
          'The same pure cow ghee, packed in a larger tin for households that go through it quickly. A refill-friendly option for cooking rather than the smaller bilona jars meant for finishing dishes.',
        tags: ['ghee', 'cow ghee', 'value pack', 'family size'],
        attributes: { Source: 'Cow milk', 'Pack type': 'Value / refill tin', 'Shelf life': '12 months' },
        popularity: 28,
        seasonality: 0.8,
        image: img('photo-1631206753348-db44968fd440'),
        variants: [
          { name: '2 L tin', price: 2450, mrp: 2750, unit: 'tin', packSize: '2 L', weightGram: 2000, stock: 22, isDefault: true },
        ],
      },
    ],
  },
  {
    name: 'Paneer & Cheese',
    description: 'Fresh paneer, cheese slices and spreads made without preservatives.',
    image: img('photo-1631452180519-c014fe946bc7'),
    products: [
      {
        name: 'Fresh Malai Paneer',
        shortDescription: 'Soft, spongy paneer set fresh each morning.',
        description:
          'Set from full cream milk and pressed just enough to hold shape while staying soft in the middle. Because it carries no preservative it is made to order each morning -- it will brown and soften in a pan without turning rubbery.',
        tags: ['paneer', 'malai paneer', 'fresh', 'protein'],
        attributes: { Protein: '18 g per 100 g', 'Milk type': 'Full cream cow milk', Preservatives: 'None', 'Shelf life': '3 days refrigerated' },
        isFeatured: true,
        popularity: 84,
        seasonality: 0.95,
        image: img('photo-1631452180519-c014fe946bc7'),
        variants: [
          { name: '200 g block', price: 92, mrp: 105, unit: 'block', packSize: '200 g', weightGram: 200, stock: 165, isDefault: true },
          { name: '500 g block', price: 220, mrp: 250, unit: 'block', packSize: '500 g', weightGram: 500, stock: 95 },
          { name: '1 kg block', price: 430, mrp: 490, unit: 'block', packSize: '1 kg', weightGram: 1000, stock: 35 },
        ],
      },
      {
        name: 'Processed Cheese Slices',
        shortDescription: 'Melt-friendly slices for sandwiches and burgers.',
        description:
          'Individually separated slices that melt evenly without splitting -- built for toasties, burgers and grilled sandwiches. Resealable pack keeps the remaining slices from drying out.',
        tags: ['cheese', 'slices', 'sandwich', 'burger', 'kids'],
        attributes: { 'Milk fat': '25%', Slices: '10 per pack', Packaging: 'Resealable', 'Shelf life': '6 months refrigerated' },
        popularity: 50,
        image: img('photo-1486297678162-eb2a19b0a32d'),
        variants: [
          { name: '200 g (10 slices)', price: 135, mrp: 150, unit: 'pack', packSize: '200 g', weightGram: 200, stock: 120, isDefault: true },
          { name: '400 g (20 slices)', price: 255, mrp: 285, unit: 'pack', packSize: '400 g', weightGram: 400, stock: 70 },
        ],
      },
      {
        name: 'Mozzarella Cheese Block',
        shortDescription: 'Low-moisture mozzarella that stretches properly.',
        description:
          'Low-moisture mozzarella made for heat: it browns rather than watering out, and pulls into long strands on a pizza. Grate from cold for the cleanest shreds.',
        tags: ['cheese', 'mozzarella', 'pizza', 'block'],
        attributes: { Type: 'Low-moisture mozzarella', 'Milk fat': '22%', 'Best for': 'Pizza, bakes', Stretch: 'High' },
        popularity: 44,
        image: img('photo-1634487359989-3e90c9432133'),
        variants: [
          { name: '200 g block', price: 165, mrp: 185, unit: 'block', packSize: '200 g', weightGram: 200, stock: 100, isDefault: true },
          { name: '1 kg block', price: 760, mrp: 850, unit: 'block', packSize: '1 kg', weightGram: 1000, stock: 30 },
        ],
      },
      {
        name: 'Cheese Spread',
        shortDescription: 'Smooth spreadable cheese in plain and herb.',
        description:
          'Whipped soft cheese that spreads straight from the fridge. The herb variant is folded through with oregano, parsley and roasted garlic.',
        tags: ['cheese', 'spread', 'herbs', 'breakfast'],
        attributes: { Flavours: 'Plain, herb & garlic', Texture: 'Whipped', 'Shelf life': '3 months refrigerated' },
        popularity: 28,
        image: img('photo-1452195100486-9cc805987862'),
        variants: [
          { name: 'Plain 180 g', price: 115, mrp: 130, unit: 'tub', packSize: '180 g', weightGram: 180, stock: 90, isDefault: true },
          { name: 'Herb & garlic 180 g', price: 125, mrp: 140, unit: 'tub', packSize: '180 g', weightGram: 180, stock: 75 },
        ],
      },
      {
        name: 'Paneer Tikka Marinated',
        shortDescription: 'Ready-to-grill paneer cubes in a tandoori marinade.',
        description:
          'Fresh paneer cubes pre-marinated in yoghurt, tandoori spice and mustard oil. Straight onto a hot pan or grill -- no marinating time needed on a weeknight.',
        tags: ['paneer', 'tikka', 'marinated', 'ready to cook', 'grill'],
        attributes: { 'Main ingredients': 'Paneer, yoghurt, tandoori spice', 'Preparation': 'Grill or pan-fry', 'Shelf life': '4 days refrigerated' },
        isFeatured: true,
        popularity: 42,
        image: img('photo-1631452180519-c014fe946bc7'),
        variants: [
          { name: '250 g pack', price: 145, mrp: 165, unit: 'pack', packSize: '250 g', weightGram: 250, stock: 85, isDefault: true },
        ],
      },
      {
        name: 'Cheddar Cheese Block',
        shortDescription: 'Aged cheddar with a firm bite and a sharp finish.',
        description:
          'Matured longer than our mozzarella for a firmer texture and a noticeably sharper flavour. Grates well over pasta or slices cleanly for a cheese board.',
        tags: ['cheese', 'cheddar', 'aged', 'block'],
        attributes: { Type: 'Aged cheddar', 'Milk fat': '30%', Texture: 'Firm', 'Ageing': '6 months' },
        popularity: 30,
        image: img('photo-1486297678162-eb2a19b0a32d'),
        variants: [
          { name: '200 g block', price: 195, mrp: 220, unit: 'block', packSize: '200 g', weightGram: 200, stock: 65, isDefault: true },
          { name: '500 g block', price: 460, mrp: 520, unit: 'block', packSize: '500 g', weightGram: 500, stock: 35 },
        ],
      },
      {
        name: 'Cream Cheese',
        shortDescription: 'Soft, tangy cream cheese for bagels and baking.',
        description:
          'A mild, slightly tangy cream cheese with a smooth spreadable texture -- built for bagels, cheesecake batter and frosting rather than melting into a hot dish.',
        tags: ['cheese', 'cream cheese', 'baking', 'spread'],
        attributes: { Texture: 'Smooth, spreadable', 'Milk fat': '33%', 'Best for': 'Bagels, cheesecake, frosting' },
        popularity: 26,
        image: img('photo-1452195100486-9cc805987862'),
        variants: [
          { name: '200 g tub', price: 165, mrp: 185, unit: 'tub', packSize: '200 g', weightGram: 200, stock: 60, isDefault: true },
        ],
      },
    ],
  },
  {
    name: 'Sweets & Desserts',
    description: 'Traditional milk sweets and frozen desserts made in small batches.',
    image: img('photo-1605291535126-e1a95ee2b1a3'),
    products: [
      {
        name: 'Mysore Pak',
        shortDescription: 'Ghee-rich gram flour sweet with a porous crumb.',
        description:
          'Besan roasted in bilona ghee until it turns fragrant, then set into slabs with a porous, melting crumb. Made in small batches because the texture is unforgiving of scale.',
        tags: ['sweets', 'mysore pak', 'ghee', 'festive', 'traditional'],
        attributes: { 'Main ingredients': 'Gram flour, ghee, sugar', Texture: 'Porous, melting', 'Shelf life': '10 days', Vegetarian: 'Yes' },
        isFeatured: true,
        popularity: 48,
        seasonality: 0.65,
        image: img('photo-1605291535126-e1a95ee2b1a3'),
        variants: [
          { name: '250 g box', price: 185, mrp: 210, unit: 'box', packSize: '250 g', weightGram: 250, stock: 80, isDefault: true },
          { name: '500 g box', price: 355, mrp: 400, unit: 'box', packSize: '500 g', weightGram: 500, stock: 45 },
        ],
      },
      {
        name: 'Rasgulla',
        shortDescription: 'Spongy chenna balls in light cardamom syrup.',
        description:
          'Fresh chenna kneaded smooth, shaped and simmered in a light sugar syrup scented with cardamom. Served chilled, they should squeeze without crumbling.',
        tags: ['sweets', 'rasgulla', 'bengali', 'syrup'],
        attributes: { 'Main ingredients': 'Chenna, sugar, cardamom', 'Serve': 'Chilled', 'Shelf life': '7 days refrigerated' },
        popularity: 40,
        image: img('photo-1666190092159-3171cf0fbb12'),
        variants: [
          { name: '500 g tin (8 pc)', price: 165, mrp: 190, unit: 'tin', packSize: '500 g', weightGram: 500, stock: 70, isDefault: true },
          { name: '1 kg tin (16 pc)', price: 310, mrp: 350, unit: 'tin', packSize: '1 kg', weightGram: 1000, stock: 38 },
        ],
      },
      {
        name: 'Kesar Peda',
        shortDescription: 'Saffron-infused khoya peda, hand-shaped.',
        description:
          'Khoya reduced slowly, sweetened lightly and infused with Kashmiri saffron before being shaped by hand and pressed with a pistachio. A festival and gifting staple.',
        tags: ['sweets', 'peda', 'kesar', 'saffron', 'khoya', 'gifting'],
        attributes: { 'Main ingredients': 'Khoya, saffron, sugar', Garnish: 'Pistachio', 'Shelf life': '7 days' },
        popularity: 36,
        seasonality: 0.6,
        image: img('photo-1601050690597-df0568f70950'),
        variants: [
          { name: '250 g box (10 pc)', price: 215, mrp: 245, unit: 'box', packSize: '250 g', weightGram: 250, stock: 60, isDefault: true },
          { name: '500 g box (20 pc)', price: 415, mrp: 470, unit: 'box', packSize: '500 g', weightGram: 500, stock: 32 },
        ],
      },
      {
        name: 'Kulfi Ice Cream',
        shortDescription: 'Dense reduced-milk kulfi on a stick.',
        description:
          'Milk reduced by half before freezing, which is what gives kulfi its dense, slow-melting body -- nothing like whipped ice cream. Available in malai, pista and mango.',
        tags: ['dessert', 'kulfi', 'ice cream', 'frozen', 'summer'],
        attributes: { Flavours: 'Malai, pista, mango', Style: 'Traditional reduced-milk', 'Store at': '-18°C' },
        isFeatured: true,
        popularity: 58,
        seasonality: 2.1,
        image: img('photo-1563805042-7684c019e1cb'),
        variants: [
          { name: 'Malai (pack of 6)', price: 180, mrp: 210, unit: 'pack', packSize: '6 x 60 ml', weightGram: 360, stock: 95, isDefault: true },
          { name: 'Pista (pack of 6)', price: 195, mrp: 225, unit: 'pack', packSize: '6 x 60 ml', weightGram: 360, stock: 80 },
          { name: 'Mango (pack of 6)', price: 195, mrp: 225, unit: 'pack', packSize: '6 x 60 ml', weightGram: 360, stock: 72 },
        ],
      },
      {
        name: 'Gulab Jamun',
        shortDescription: 'Soft khoya dumplings soaked in cardamom syrup.',
        description:
          'Khoya and a little flour, shaped by hand, fried gently and soaked in warm cardamom-and-rose syrup until they swell soft all the way through. Serve warm or at room temperature.',
        tags: ['sweets', 'gulab jamun', 'khoya', 'syrup', 'festive'],
        attributes: { 'Main ingredients': 'Khoya, sugar syrup, cardamom', 'Serve': 'Warm or room temperature', 'Shelf life': '5 days' },
        isFeatured: true,
        popularity: 46,
        seasonality: 0.7,
        image: img('photo-1601050690597-df0568f70950'),
        variants: [
          { name: '500 g tin (10 pc)', price: 175, mrp: 200, unit: 'tin', packSize: '500 g', weightGram: 500, stock: 75, isDefault: true },
          { name: '1 kg tin (20 pc)', price: 330, mrp: 375, unit: 'tin', packSize: '1 kg', weightGram: 1000, stock: 40 },
        ],
      },
      {
        name: 'Shrikhand',
        shortDescription: 'Sweetened hung curd with saffron and pistachio.',
        description:
          'Hung curd whipped smooth with sugar, a pinch of saffron and crushed pistachio. Served chilled -- a Gujarati and Maharashtrian festive staple that doubles as a light dessert any day.',
        tags: ['sweets', 'shrikhand', 'saffron', 'hung curd', 'chilled'],
        attributes: { 'Main ingredients': 'Hung curd, saffron, pistachio', Serve: 'Chilled', 'Shelf life': '5 days refrigerated' },
        popularity: 34,
        seasonality: 1.2,
        image: img('photo-1488477181946-6428a0291777'),
        variants: [
          { name: '200 g cup', price: 85, mrp: 98, unit: 'cup', packSize: '200 g', weightGram: 200, stock: 70, isDefault: true },
          { name: '500 g tub', price: 195, mrp: 225, unit: 'tub', packSize: '500 g', weightGram: 500, stock: 40 },
        ],
      },
      {
        name: 'Rabri',
        shortDescription: 'Slow-reduced sweetened milk, layered and chilled.',
        description:
          'Full cream milk simmered for hours until it reduces and layers into thick, sweet ribbons. Traditionally topped with pistachio and a few strands of saffron, served chilled.',
        tags: ['sweets', 'rabri', 'reduced milk', 'chilled', 'festive'],
        attributes: { 'Main ingredients': 'Reduced milk, sugar, saffron', Garnish: 'Pistachio', Serve: 'Chilled' },
        popularity: 24,
        seasonality: 0.75,
        image: img('photo-1563636619-e9143da7973b'),
        variants: [
          { name: '250 g cup', price: 110, mrp: 125, unit: 'cup', packSize: '250 g', weightGram: 250, stock: 45, isDefault: true },
        ],
      },
      {
        name: 'Basundi',
        shortDescription: 'Cardamom-and-nut thickened sweet milk.',
        description:
          'Milk reduced to about a third of its volume and sweetened with sugar, cardamom and chopped nuts. Lighter than rabri, closer to a drinkable dessert -- served chilled in small bowls.',
        tags: ['sweets', 'basundi', 'reduced milk', 'nuts', 'chilled'],
        attributes: { 'Main ingredients': 'Reduced milk, cardamom, nuts', Serve: 'Chilled', 'Shelf life': '3 days refrigerated' },
        popularity: 20,
        seasonality: 0.75,
        image: img('photo-1571212515416-fef01fc43637'),
        variants: [
          { name: '250 ml cup', price: 95, mrp: 108, unit: 'cup', packSize: '250 ml', weightGram: 250, stock: 42, isDefault: true },
        ],
      },
    ],
  },
  {
    name: 'Beverages',
    description: 'Flavoured milk, lassi and milk-based drinks.',
    image: img('photo-1553909489-cd47e0907980'),
    products: [
      {
        name: 'Sweet Lassi',
        shortDescription: 'Thick churned curd drink, lightly sweetened.',
        description:
          'Curd churned with sugar and a touch of cardamom until frothy. Thick enough to need a wide straw, and a summer staple across the state.',
        tags: ['lassi', 'sweet', 'beverage', 'summer', 'curd'],
        attributes: { Base: 'Curd', Sweetener: 'Sugar', Flavour: 'Cardamom', 'Serve': 'Chilled' },
        popularity: 52,
        seasonality: 1.85,
        image: img('photo-1553909489-cd47e0907980'),
        variants: [
          { name: '200 ml bottle', price: 30, mrp: 35, unit: 'bottle', packSize: '200 ml', weightGram: 200, stock: 155, isDefault: true },
          { name: '500 ml bottle', price: 68, mrp: 78, unit: 'bottle', packSize: '500 ml', weightGram: 500, stock: 90 },
        ],
      },
      {
        name: 'Flavoured Milk',
        shortDescription: 'Chilled milk in badam, rose and chocolate.',
        description:
          'Sterilised flavoured milk that keeps without refrigeration until opened -- handy for lunchboxes and travel. Badam carries real almond paste; chocolate uses cocoa rather than syrup.',
        tags: ['milk', 'flavoured', 'badam', 'chocolate', 'rose', 'kids'],
        attributes: { Flavours: 'Badam, rose, chocolate', Sterilised: 'Yes', 'Shelf life': '4 months unopened' },
        popularity: 44,
        seasonality: 1.4,
        image: img('photo-1600718374662-0483d2b9da44'),
        variants: [
          { name: 'Badam 180 ml', price: 32, mrp: 38, unit: 'bottle', packSize: '180 ml', weightGram: 180, stock: 140, isDefault: true },
          { name: 'Rose 180 ml', price: 30, mrp: 35, unit: 'bottle', packSize: '180 ml', weightGram: 180, stock: 120 },
          { name: 'Chocolate 180 ml', price: 34, mrp: 40, unit: 'bottle', packSize: '180 ml', weightGram: 180, stock: 135 },
        ],
      },
      {
        name: 'Filter Coffee Decoction Milk',
        shortDescription: 'Ready-to-heat South Indian filter coffee.',
        description:
          'Full cream milk pre-blended with fresh chicory-coffee decoction in the classic 80:20 ratio. Heat and serve -- the froth comes back with a couple of pours between two tumblers.',
        tags: ['coffee', 'filter coffee', 'decoction', 'beverage', 'south indian'],
        attributes: { Blend: '80% coffee, 20% chicory', Base: 'Full cream milk', Preparation: 'Heat and serve' },
        popularity: 34,
        seasonality: 0.8,
        image: img('photo-1509042239860-f550ce710b93'),
        variants: [
          { name: '200 ml bottle', price: 45, mrp: 52, unit: 'bottle', packSize: '200 ml', weightGram: 200, stock: 105, isDefault: true },
          { name: '500 ml bottle', price: 105, mrp: 120, unit: 'bottle', packSize: '500 ml', weightGram: 500, stock: 58 },
        ],
      },
      {
        name: 'Cold Coffee',
        shortDescription: 'Chilled, blended coffee with a thick milk froth.',
        description:
          'Espresso-strength coffee blended with full cream milk, sugar and ice until frothy. Bottled cold and meant to be drunk within the day -- no syrups, no preservatives.',
        tags: ['coffee', 'cold coffee', 'chilled', 'beverage'],
        attributes: { Base: 'Espresso + full cream milk', Serve: 'Chilled', 'Shelf life': '2 days refrigerated' },
        popularity: 30,
        seasonality: 1.6,
        image: img('photo-1509042239860-f550ce710b93'),
        variants: [
          { name: '250 ml bottle', price: 60, mrp: 70, unit: 'bottle', packSize: '250 ml', weightGram: 250, stock: 90, isDefault: true },
        ],
      },
      {
        name: 'Rose Milk',
        shortDescription: 'Chilled milk flavoured with rose syrup and basil seeds.',
        description:
          'Cold milk sweetened with rose syrup, finished with a spoon of soaked basil (sabja) seeds. A South Indian summer classic, served over ice.',
        tags: ['milk', 'rose milk', 'summer', 'beverage', 'chilled'],
        attributes: { Flavour: 'Rose', Base: 'Chilled milk', Garnish: 'Basil (sabja) seeds' },
        popularity: 26,
        seasonality: 1.8,
        image: img('photo-1600718374662-0483d2b9da44'),
        variants: [
          { name: '250 ml bottle', price: 35, mrp: 40, unit: 'bottle', packSize: '250 ml', weightGram: 250, stock: 100, isDefault: true },
        ],
      },
    ],
  },
  {
    name: 'Ice Creams & Frozen',
    description: 'Classic scoopable tubs and bars, made with real cream and no gelatin.',
    image: img('photo-1563805042-7684c019e1cb'),
    products: [
      {
        name: 'Vanilla Bean Ice Cream',
        shortDescription: 'Classic vanilla with visible bean flecks, churned slow.',
        description:
          'Made with real vanilla bean rather than essence, churned slowly to keep ice-crystal size small so it stays creamy straight from the freezer. No gelatin, no stabiliser gums.',
        tags: ['ice cream', 'vanilla', 'frozen', 'dessert'],
        attributes: { Flavour: 'Vanilla bean', 'Milk fat': '10%', Stabilisers: 'None', 'Store at': '-18°C' },
        isFeatured: true,
        popularity: 40,
        seasonality: 1.9,
        image: img('photo-1563805042-7684c019e1cb'),
        variants: [
          { name: '500 ml tub', price: 165, mrp: 190, unit: 'tub', packSize: '500 ml', weightGram: 500, stock: 70, isDefault: true },
          { name: '1 L tub', price: 300, mrp: 340, unit: 'tub', packSize: '1 L', weightGram: 1000, stock: 45 },
        ],
      },
      {
        name: 'Belgian Chocolate Ice Cream',
        shortDescription: 'Dense chocolate ice cream made with real cocoa.',
        description:
          'Belgian dark cocoa churned into cream for a dense, not-too-sweet chocolate ice cream. The kind that leaves your spoon coated rather than just tinted brown.',
        tags: ['ice cream', 'chocolate', 'frozen', 'dessert'],
        attributes: { Flavour: 'Belgian chocolate', 'Milk fat': '11%', 'Store at': '-18°C' },
        isFeatured: true,
        popularity: 44,
        seasonality: 1.7,
        image: img('photo-1600718374662-0483d2b9da44'),
        variants: [
          { name: '500 ml tub', price: 175, mrp: 200, unit: 'tub', packSize: '500 ml', weightGram: 500, stock: 65, isDefault: true },
          { name: '1 L tub', price: 320, mrp: 360, unit: 'tub', packSize: '1 L', weightGram: 1000, stock: 38 },
        ],
      },
      {
        name: 'Mango Alphonso Ice Cream',
        shortDescription: 'Seasonal Alphonso mango pulp folded into cream.',
        description:
          'Made only when good Alphonso mango pulp is available, folded through vanilla cream rather than using mango essence. Expect real fruit fibre in every scoop.',
        tags: ['ice cream', 'mango', 'seasonal', 'frozen'],
        attributes: { Flavour: 'Alphonso mango', 'Fruit content': '18%', Availability: 'Seasonal' },
        popularity: 32,
        seasonality: 2.3,
        image: img('photo-1488900128323-21503983a07e'),
        variants: [
          { name: '500 ml tub', price: 195, mrp: 225, unit: 'tub', packSize: '500 ml', weightGram: 500, stock: 50, isDefault: true },
        ],
      },
      {
        name: 'Choco Bar',
        shortDescription: 'Vanilla ice cream bar coated in a crisp chocolate shell.',
        description:
          'A block of vanilla ice cream on a stick, dipped in a chocolate coating that snaps cleanly on the first bite. A lunchbox and freezer-drawer staple.',
        tags: ['ice cream', 'choco bar', 'kids', 'frozen', 'stick'],
        attributes: { Format: 'Stick bar', Coating: 'Chocolate shell', 'Pack size': '4 bars' },
        popularity: 36,
        seasonality: 1.8,
        image: img('photo-1601050690597-df0568f70950'),
        variants: [
          { name: 'Pack of 4', price: 140, mrp: 160, unit: 'pack', packSize: '4 x 60 ml', weightGram: 240, stock: 85, isDefault: true },
        ],
      },
    ],
  },
  {
    name: 'Health & Nutrition',
    description: 'Protein-forward and functional dairy for daily nutrition goals.',
    image: img('photo-1600718374662-0483d2b9da44'),
    products: [
      {
        name: 'High-Protein Milk',
        shortDescription: 'Regular milk fortified to 2x the usual protein content.',
        description:
          'Toned milk with added milk protein isolate, doubling the protein of our regular milk without any added sugar or flavouring. Built for anyone tracking protein intake who would rather drink it than mix a shake.',
        tags: ['milk', 'protein', 'fitness', 'nutrition'],
        attributes: { Protein: '12 g per 250 ml (2x regular)', 'Added sugar': 'None', 'Fat content': '2.5%' },
        isFeatured: true,
        popularity: 34,
        image: img('photo-1550583724-b2692b85b150'),
        variants: [
          { name: '250 ml bottle', price: 42, mrp: 48, unit: 'bottle', packSize: '250 ml', weightGram: 250, stock: 90, isDefault: true },
          { name: '1 L bottle', price: 155, mrp: 175, unit: 'bottle', packSize: '1 L', weightGram: 1000, stock: 50 },
        ],
      },
      {
        name: 'Probiotic Immunity Shots',
        shortDescription: 'Concentrated turmeric-ginger probiotic curd shots.',
        description:
          'A 60 ml shot of live-culture curd blended with turmeric, ginger and black pepper for absorption. Meant to be taken in one go, not sipped -- a functional add-on rather than a snack.',
        tags: ['probiotic', 'immunity', 'turmeric', 'shot', 'functional'],
        attributes: { Format: '60 ml shot', 'Active ingredients': 'Turmeric, ginger, live culture', 'Pack size': '6 shots' },
        popularity: 22,
        seasonality: 1.1,
        image: img('photo-1571212515416-fef01fc43637'),
        variants: [
          { name: 'Pack of 6', price: 210, mrp: 240, unit: 'pack', packSize: '6 x 60 ml', weightGram: 360, stock: 55, isDefault: true },
        ],
      },
      {
        name: 'Low-Fat Paneer',
        shortDescription: 'Paneer made from toned milk, roughly half the fat.',
        description:
          'The same fresh-set process as our regular paneer, but starting from toned rather than full-cream milk -- roughly half the fat per 100 g, without turning rubbery when cooked.',
        tags: ['paneer', 'low fat', 'protein', 'fitness'],
        attributes: { 'Fat content': '9 g per 100 g (regular: 18 g)', Protein: '19 g per 100 g', 'Milk type': 'Toned milk' },
        popularity: 26,
        image: img('photo-1631452180519-c014fe946bc7'),
        variants: [
          { name: '200 g block', price: 85, mrp: 96, unit: 'block', packSize: '200 g', weightGram: 200, stock: 70, isDefault: true },
        ],
      },
    ],
  },
  {
    name: 'Gift Packs & Combos',
    description: 'Curated hampers for festivals, gifting and stocking up in one order.',
    image: img('photo-1605291535126-e1a95ee2b1a3'),
    products: [
      {
        name: 'Festive Sweets Hamper',
        shortDescription: 'An assorted box of our five most-gifted sweets.',
        description:
          'A gift box combining Mysore Pak, Kesar Peda, Gulab Jamun, Rasgulla and Kaju Katli-style pieces, packed for gifting rather than everyday eating. Comes with a printed card slot.',
        tags: ['gift', 'combo', 'sweets', 'festive', 'hamper'],
        attributes: { Contents: '5 assorted sweets', Packaging: 'Gift box with card slot', Occasion: 'Festive gifting' },
        isFeatured: true,
        popularity: 30,
        seasonality: 0.6,
        image: img('photo-1605291535126-e1a95ee2b1a3'),
        variants: [
          { name: '1 kg hamper', price: 650, mrp: 750, unit: 'box', packSize: '1 kg', weightGram: 1000, stock: 30, isDefault: true },
        ],
      },
      {
        name: 'Weekly Dairy Essentials Combo',
        shortDescription: 'Milk, curd, paneer and butter bundled for the week.',
        description:
          'A bundled combo covering the four items most households reorder every week -- 7 L milk, 1 kg curd, 500 g paneer and one 100 g butter block -- at a small discount over buying each separately.',
        tags: ['combo', 'weekly', 'essentials', 'bundle', 'value'],
        attributes: { Contents: 'Milk 7L, Curd 1kg, Paneer 500g, Butter 100g', 'Best for': 'Weekly household restock' },
        popularity: 38,
        image: img('photo-1550583724-b2692b85b150'),
        variants: [
          { name: 'Weekly combo box', price: 540, mrp: 610, unit: 'box', packSize: 'Mixed', stock: 40, isDefault: true },
        ],
      },
      {
        name: 'New Parent Nutrition Box',
        shortDescription: 'Gentle, easy-to-digest dairy picks for new mothers.',
        description:
          'A curated box of A2 milk, plain curd, paneer and ghee -- picked for being gentle, high in protein and easy to fit into a new parent\'s routine without needing to shop for each item separately.',
        tags: ['gift', 'combo', 'nutrition', 'new parent', 'hamper'],
        attributes: { Contents: 'A2 milk, curd, paneer, ghee', 'Curated for': 'New mothers / postnatal nutrition' },
        popularity: 16,
        image: img('photo-1628088062854-d1870b4553da'),
        variants: [
          { name: 'Nutrition box', price: 780, mrp: 880, unit: 'box', packSize: 'Mixed', stock: 20, isDefault: true },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------- customers ---

/** Hand-written customers with distinct, recognisable buying profiles. */
const CURATED_CUSTOMERS = [
  { name: 'Priya Raghavan', email: 'priya@example.com', phone: '9840012301', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001', profile: 'loyal' },
  { name: 'Arun Kumar', email: 'arun@example.com', phone: '9840012302', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641004', profile: 'loyal' },
  { name: 'Meena Lakshmi', email: 'meena@example.com', phone: '9840012303', city: 'Tiruppur', state: 'Tamil Nadu', pincode: '641601', profile: 'regular' },
  { name: 'Vikram Shetty', email: 'vikram@example.com', phone: '9840012304', city: 'Chennai', state: 'Tamil Nadu', pincode: '600020', profile: 'regular' },
  { name: 'Deepa Nair', email: 'deepa@example.com', phone: '9840012305', city: 'Kochi', state: 'Kerala', pincode: '682016', profile: 'regular' },
  { name: 'Suresh Babu', email: 'suresh@example.com', phone: '9840012306', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641012', profile: 'occasional' },
  { name: 'Ananya Iyer', email: 'ananya@example.com', phone: '9840012307', city: 'Bengaluru', state: 'Karnataka', pincode: '560034', profile: 'loyal' },
  { name: 'Rahul Menon', email: 'rahul@example.com', phone: '9840012308', city: 'Chennai', state: 'Tamil Nadu', pincode: '600042', profile: 'occasional' },
  { name: 'Kavitha Subramanian', email: 'kavitha@example.com', phone: '9840012309', city: 'Salem', state: 'Tamil Nadu', pincode: '636001', profile: 'regular' },
  { name: 'Joseph Thomas', email: 'joseph@example.com', phone: '9840012310', city: 'Kochi', state: 'Kerala', pincode: '682020', profile: 'occasional' },
  { name: 'Sneha Patel', email: 'sneha@example.com', phone: '9840012311', city: 'Bengaluru', state: 'Karnataka', pincode: '560078', profile: 'regular' },
  { name: 'Karthik Rajan', email: 'karthik@example.com', phone: '9840012312', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001', profile: 'loyal' },
  { name: 'Divya Krishnan', email: 'divya@example.com', phone: '9840012313', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641045', profile: 'regular' },
  { name: 'Mohammed Ashraf', email: 'ashraf@example.com', phone: '9840012314', city: 'Tiruppur', state: 'Tamil Nadu', pincode: '641604', profile: 'occasional' },
  { name: 'Lakshmi Priya', email: 'lakshmipriya@example.com', phone: '9840012315', city: 'Chennai', state: 'Tamil Nadu', pincode: '600028', profile: 'churned' },
  { name: 'Ganesh Moorthy', email: 'ganesh@example.com', phone: '9840012316', city: 'Salem', state: 'Tamil Nadu', pincode: '636007', profile: 'churned' },
  { name: 'Aishwarya Balan', email: 'aishwarya@example.com', phone: '9840012317', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641002', profile: 'new' },
  { name: 'Nitin Verma', email: 'nitin@example.com', phone: '9840012318', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', profile: 'new' },
];

// Additional synthetic customers. 18 hand-written customers are far too few for
// the recommender's offline evaluation or RFM clustering to produce stable
// numbers (the eval metrics are noise-dominated at that size), so the base is
// padded out to ~60 with deterministically generated shoppers.
const GEN_FIRST = [
  'Ravi', 'Anjali', 'Sathish', 'Nithya', 'Prakash', 'Revathi', 'Manoj', 'Sowmya', 'Bala', 'Keerthi',
  'Hari', 'Divakar', 'Sundar', 'Lavanya', 'Vinoth', 'Preethi', 'Naveen', 'Shruthi', 'Gokul', 'Ramya',
  'Dinesh', 'Anitha', 'Surya', 'Meghana', 'Arjun', 'Deepika', 'Vijay', 'Harini', 'Kiran', 'Sangeetha',
  'Ashwin', 'Nandini', 'Praveen', 'Yamini', 'Rajesh', 'Bhavana', 'Siddharth', 'Kalpana', 'Tarun', 'Indira',
  'Balaji', 'Sruthi', 'Mahesh', 'Vidya',
];
const GEN_LAST = [
  'Venkatesh', 'Chandran', 'Pillai', 'Reddy', 'Gopal', 'Srinivasan', 'Balakrishnan', 'Kannan',
  'Mahadevan', 'Varma', 'Sekhar', 'Natarajan', 'Ramanathan', 'Prabhu', 'Anand',
];
const GEN_LOCATIONS = [
  { city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641009' },
  { city: 'Chennai', state: 'Tamil Nadu', pincode: '600017' },
  { city: 'Bengaluru', state: 'Karnataka', pincode: '560095' },
  { city: 'Kochi', state: 'Kerala', pincode: '682024' },
  { city: 'Madurai', state: 'Tamil Nadu', pincode: '625009' },
  { city: 'Salem', state: 'Tamil Nadu', pincode: '636016' },
  { city: 'Tiruppur', state: 'Tamil Nadu', pincode: '641607' },
  { city: 'Trichy', state: 'Tamil Nadu', pincode: '620001' },
  { city: 'Mysuru', state: 'Karnataka', pincode: '570009' },
  { city: 'Thrissur', state: 'Kerala', pincode: '680001' },
];
// Weighted spread of behaviours: mostly regular/occasional, a solid loyal
// core, a handful of churned and new.
const GEN_PROFILES = [
  'regular', 'loyal', 'occasional', 'regular', 'occasional', 'loyal', 'regular', 'churned',
  'occasional', 'regular', 'loyal', 'occasional', 'regular', 'new', 'occasional', 'loyal',
  'regular', 'churned', 'occasional', 'regular', 'loyal',
];

const GENERATED_CUSTOMERS = Array.from({ length: 44 }, (_, i) => {
  const first = GEN_FIRST[i % GEN_FIRST.length];
  const last = GEN_LAST[(i * 7 + 3) % GEN_LAST.length];
  const loc = GEN_LOCATIONS[(i * 3 + 1) % GEN_LOCATIONS.length];
  const n = i + 19; // continues the curated numbering (1..18)
  return {
    name: `${first} ${last}`,
    email: `${first}.${last}${n}@example.com`.toLowerCase(),
    phone: String(9840012300 + n),
    city: loc.city,
    state: loc.state,
    pincode: loc.pincode,
    profile: GEN_PROFILES[i % GEN_PROFILES.length],
  };
});

export const CUSTOMER_SEEDS = [...CURATED_CUSTOMERS, ...GENERATED_CUSTOMERS];

export const COUPON_SEEDS = [
  { code: 'WELCOME50', description: 'Flat ₹50 off on your first order above ₹399', discountType: 'FLAT' as const, value: 50, minOrderValue: 399, perUserLimit: 1, usageLimit: 2000 },
  { code: 'FRESH10', description: '10% off everything, up to ₹100', discountType: 'PERCENTAGE' as const, value: 10, minOrderValue: 299, maxDiscount: 100, perUserLimit: 5, usageLimit: null },
  { code: 'GHEE15', description: '15% off on orders above ₹999', discountType: 'PERCENTAGE' as const, value: 15, minOrderValue: 999, maxDiscount: 300, perUserLimit: 3, usageLimit: 500 },
  { code: 'SUMMER25', description: 'Flat ₹25 off on chilled beverages and curd', discountType: 'FLAT' as const, value: 25, minOrderValue: 249, perUserLimit: 4, usageLimit: 1000 },
  { code: 'BULK20', description: '20% off on orders above ₹2499', discountType: 'PERCENTAGE' as const, value: 20, minOrderValue: 2499, maxDiscount: 600, perUserLimit: 2, usageLimit: 200 },
];

export const OFFER_SEEDS = [
  {
    title: 'Farm to doorstep before sunrise',
    subtitle: 'Order by 10 pm, delivered by 6 am',
    description: 'Milk collected in the evening reaches your door before breakfast. Free delivery on orders above ₹499.',
    type: 'BANNER' as const,
    ctaLabel: 'Shop milk',
    ctaHref: '/products?category=milk',
    priority: 100,
    bannerUrl: img('photo-1550583724-b2692b85b150'),
  },
  {
    title: 'Bilona ghee, the slow way',
    subtitle: 'Hand-churned in small batches',
    description: '30 litres of A2 milk in every litre. Now with 10% off on the 500 ml jar.',
    type: 'PRODUCT_DISCOUNT' as const,
    discountPercent: 10,
    ctaLabel: 'Explore ghee',
    ctaHref: '/products?category=butter-ghee',
    priority: 90,
    bannerUrl: img('photo-1631206753348-db44968fd440'),
  },
  {
    title: 'Beat the heat',
    subtitle: 'Buttermilk, lassi and kulfi',
    description: 'Chilled dairy for hot afternoons. Flat ₹25 off with code SUMMER25.',
    type: 'CATEGORY_DISCOUNT' as const,
    discountPercent: 15,
    ctaLabel: 'Shop beverages',
    ctaHref: '/products?category=beverages',
    priority: 80,
    bannerUrl: img('photo-1553909489-cd47e0907980'),
  },
];

export const REVIEW_TEMPLATES = [
  { rating: 5, title: 'Genuinely fresh', comment: 'Delivered before 6 am and still cold. The difference from supermarket milk is obvious the moment you boil it.' },
  { rating: 5, title: 'Back to ordering weekly', comment: 'Third month of ordering and the quality has not slipped once. Packaging is sturdy and nothing has ever leaked.' },
  { rating: 4, title: 'Very good, slightly pricey', comment: 'Quality is excellent and I keep reordering, though it does cost a bit more than the local shop. Worth it for the taste.' },
  { rating: 5, title: 'Exactly like home-made', comment: 'Reminds me of what my grandmother made. No artificial aftertaste at all.' },
  { rating: 4, title: 'Good, wish the pack were bigger', comment: 'Really happy with it. A larger family pack would save me reordering so often.' },
  { rating: 5, title: 'Consistently excellent', comment: 'Ordered at least fifteen times now. Same quality every single delivery, which is the hard part.' },
  { rating: 3, title: 'Good product, delivery was late once', comment: 'The product itself is fine. One delivery arrived around noon instead of morning, which is a problem for milk.' },
  { rating: 5, title: 'My kids finish it instantly', comment: 'Bought it for the children and now I have to order double. No complaints from anyone at home.' },
  { rating: 4, title: 'Solid quality', comment: 'Fresh, well packed, arrives on time. Would recommend to anyone nearby.' },
  { rating: 5, title: 'Worth every rupee', comment: 'You can taste that this is not mass produced. The texture is completely different.' },
];
