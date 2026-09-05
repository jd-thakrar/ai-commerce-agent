import { Type } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase";

/* =========================================================
   TYPES
========================================================= */

export type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  currency: string;
  stock: number;
  attributes: Record<string, unknown>;
  use_cases: string[];
  tags: string[];
  active: boolean;
};

export type ToolContext = {
  session_id: string;
};

export type ToolArgs = ToolContext & Record<string, any>;

/* =========================================================
   HELPERS
========================================================= */

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}
function extractProcessorTier(processor: unknown): number {
  const match = String(processor ?? "").match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function productSearchText(product: Product): string {
  return [
    product.name,
    product.description,
    product.category,
    ...(product.tags || []),
    ...(product.use_cases || []),
    Object.values(product.attributes || {}).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

type ActiveCampaign = {
  name: string;
  discount_percent: number;
  active_category: string;
};

async function getActiveCampaign(): Promise<ActiveCampaign | null> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("name,discount_percent,active_category")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Campaign lookup error:", error);
    return null;
  }

  return data;
}

function withCampaignPrice<T extends { price: number; category: string }>(
  product: T,
  campaign: ActiveCampaign | null
) {
  const matches = campaign && normalize(product.category) === normalize(campaign.active_category);
  return {
    ...product,
    ...(matches
      ? { discounted_price: Math.round(product.price * (1 - campaign.discount_percent / 100)) }
      : {}),
  };
}

/* =========================================================
   SEARCH PRODUCTS
========================================================= */

export async function searchProducts(args: ToolArgs) {
  const queryText = normalize(args.query);

  const category = args.category
    ? normalize(args.category)
    : "";

  const processor = args.processor
    ? normalize(args.processor)
    : "";

  const processorMinTier = args.processor_min
    ? extractProcessorTier(args.processor_min)
    : 0;

  const maxPrice =
    args.max_price !== undefined
      ? Number(args.max_price)
      : undefined;

  if (
    maxPrice !== undefined &&
    (!Number.isFinite(maxPrice) || maxPrice < 0)
  ) {
    return {
      success: false,
      error: "Invalid max_price",
    };
  }

  let query = supabaseAdmin
    .from("products")
    .select("*")
    .eq("active", true)
    .gt("stock", 0);

  if (category) {
    query = query.ilike("category", category);
  }

  if (maxPrice !== undefined) {
    query = query.lte("price", maxPrice);
  }

  const { data, error } = await query;

  if (error) {
    console.error("searchProducts error:", error);

    return {
      success: false,
      error: "Unable to search products",
    };
  }

   const products = (data || []) as Product[];
  const campaign = await getActiveCampaign();
  let pricedProducts = products.map((product) => withCampaignPrice(product, campaign));

  if (processor) {
    pricedProducts = pricedProducts.filter((product) =>
      normalize((product.attributes as any)?.processor).includes(processor)
    );
  }
    if (processorMinTier > 0) {
    pricedProducts = pricedProducts.filter((product) =>
      extractProcessorTier((product.attributes as any)?.processor) >= processorMinTier
    );
  }

  if (!queryText) {
    return {
      success: true,
      count: pricedProducts.length,
      products: pricedProducts.slice(0, 6),
    };
  }

  const words = queryText
    .split(/\s+/)
    .filter((word: string) => word.length > 1);

  const ranked = pricedProducts
    .map((product) => {
      const text = productSearchText(product);

      let score = 0;

      for (const word of words) {
        if (text.includes(word)) {
          score += 2;
        }

        if (normalize(product.name).includes(word)) {
          score += 5;
        }

        if (
          (product.tags || []).some((tag) =>
            normalize(tag).includes(word)
          )
        ) {
          score += 3;
        }

        if (
          (product.use_cases || []).some((useCase) =>
            normalize(useCase).includes(word)
          )
        ) {
          score += 3;
        }
      }

      return {
        product,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.product.price - b.product.price;
    });

  return {
    success: true,
    count: ranked.length,
    products: ranked
      .slice(0, 6)
      .map((item) => item.product),
  };
}

/* =========================================================
   GET PRODUCT
========================================================= */

export async function getProduct(args: ToolArgs) {
  const productId = String(args.product_id || "").trim();

  if (!productId) {
    return {
      success: false,
      error: "product_id is required",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("active", true)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: "Product not found",
    };
  }

  return {
    success: true,
    product: withCampaignPrice(data as Product, await getActiveCampaign()),
  };
}

function normalizeAttributeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

export async function compareProducts(args: ToolArgs) {
  const productIds = Array.isArray(args.product_ids)
    ? args.product_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];

  if (productIds.length < 2 || productIds.length > 4) {
    return { success: false, error: "product_ids must contain between 2 and 4 products" };
  }

  const uniqueProductIds = [...new Set(productIds)];
  if (uniqueProductIds.length !== productIds.length) {
    return { success: false, error: "product_ids must contain unique products" };
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id,name,price,attributes,active")
    .in("id", uniqueProductIds)
    .eq("active", true);

  if (error) {
    console.error("compareProducts error:", error);
    return { success: false, error: "Unable to compare products" };
  }

  const productsById = new Map((data || []).map((product) => [product.id, product]));
  if (uniqueProductIds.some((id) => !productsById.has(id))) {
    return { success: false, error: "One or more products were not found" };
  }

  const rawProducts = uniqueProductIds.map((id) => productsById.get(id)!);
  const attributeKeys = [...new Set(rawProducts.flatMap((product) =>
    Object.keys(product.attributes || {}).map(normalizeAttributeKey)
  ))].sort();

  const products = rawProducts.map((product) => {
    const attributes = Object.fromEntries(attributeKeys.map((key) => {
      const source = Object.entries(product.attributes || {}).find(
        ([sourceKey]) => normalizeAttributeKey(sourceKey) === key
      );
      return [key, source?.[1] ?? null];
    }));

    return { id: product.id, name: product.name, price: product.price, attributes };
  });

  const differences = attributeKeys.filter((key) => {
    const values = products.map((product) => product.attributes[key]);
    return new Set(values.map((value) => JSON.stringify(value))).size > 1;
  });

  return { success: true, products, differences };
}

/* =========================================================
   SUGGEST UPSELLS
========================================================= */

export async function suggestUpsells(args: ToolArgs) {
  const productId = String(args.product_id || "").trim();

  if (!productId) {
    return {
      success: false,
      error: "product_id is required",
    };
  }

  const { data: baseProduct, error: baseError } =
    await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("active", true)
      .single();

  if (baseError || !baseProduct) {
    return {
      success: false,
      error: "Base product not found",
    };
  }

  const base = baseProduct as Product;

  const { data: candidates, error } =
    await supabaseAdmin
      .from("products")
      .select("*")
      .eq("active", true)
      .gt("stock", 0)
      .neq("id", productId);

  if (error) {
    console.error("suggestUpsells error:", error);

    return {
      success: false,
      error: "Unable to find upsell products",
    };
  }

  const baseTags = (base.tags || []).map(normalize);
  const baseUseCases = (base.use_cases || []).map(normalize);

  const ranked = ((candidates || []) as Product[])
    .filter((product) => {
      const category = normalize(product.category);

      return (
        category === "accessory" ||
        category === "service"
      );
    })
    .map((product) => {
      const tags = (product.tags || []).map(normalize);
      const useCases = (product.use_cases || []).map(normalize);

      let score = 0;

      for (const tag of tags) {
        if (baseTags.includes(tag)) {
          score += 3;
        }
      }

      for (const useCase of useCases) {
        if (baseUseCases.includes(useCase)) {
          score += 4;
        }
      }

      if (
        normalize(base.category) === "laptop" &&
        [
          "mouse",
          "keyboard",
          "sleeve",
          "hub",
          "monitor",
        ].some((word) =>
          normalize(product.name).includes(word)
        )
      ) {
        score += 5;
      }

      return {
        product,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    success: true,

    base_product: {
      id: base.id,
      name: base.name,
      price: base.price,
    },

    suggestions: ranked
      .slice(0, 2)
      .map((item) => item.product),
  };
}

/* =========================================================
   ADD TO CART
========================================================= */

export async function addToCart(args: ToolArgs) {
  const sessionId = String(args.session_id || "").trim();
  const productId = String(args.product_id || "").trim();

  const quantity = Number(args.quantity ?? 1);

  if (!sessionId) {
    return {
      success: false,
      error: "session_id is required",
    };
  }

  if (!productId) {
    return {
      success: false,
      error: "product_id is required",
    };
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10
  ) {
    return {
      success: false,
      error: "Quantity must be between 1 and 10",
    };
  }

  const { data: product, error: productError } =
    await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("active", true)
      .single();

  if (productError || !product) {
    return {
      success: false,
      error: "Product not found",
    };
  }

  if (product.stock < quantity) {
    return {
      success: false,
      error: `Only ${product.stock} item(s) are available`,
    };
  }

  let { data: cart, error: cartError } =
    await supabaseAdmin
      .from("carts")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "active")
      .maybeSingle();

  if (cartError) {
    console.error("Cart lookup error:", cartError);

    return {
      success: false,
      error: "Unable to access cart",
    };
  }

  if (!cart) {
    const { data: newCart, error: createError } =
      await supabaseAdmin
        .from("carts")
        .insert({
          session_id: sessionId,
          status: "active",
        })
        .select("*")
        .single();

    if (createError || !newCart) {
      console.error("Cart creation error:", createError);

      return {
        success: false,
        error: "Unable to create cart",
      };
    }

    cart = newCart;
  }

  const { data: existingItem, error: itemError } =
    await supabaseAdmin
      .from("cart_items")
      .select("*")
      .eq("cart_id", cart.id)
      .eq("product_id", productId)
      .maybeSingle();

  if (itemError) {
    console.error("Cart item lookup error:", itemError);

    return {
      success: false,
      error: "Unable to update cart",
    };
  }

  if (existingItem) {
    const newQuantity =
      existingItem.quantity + quantity;

    if (newQuantity > product.stock) {
      return {
        success: false,
        error: `Only ${product.stock} item(s) are available`,
      };
    }

    const { error: updateError } =
      await supabaseAdmin
        .from("cart_items")
        .update({
          quantity: newQuantity,
          price_at_addition: product.price,
        })
        .eq("id", existingItem.id);

    if (updateError) {
      console.error(
        "Cart item update error:",
        updateError
      );

      return {
        success: false,
        error: "Unable to update cart",
      };
    }
  } else {
    const { error: insertError } =
      await supabaseAdmin
        .from("cart_items")
        .insert({
          cart_id: cart.id,
          product_id: productId,
          quantity,
          price_at_addition: product.price,
        });

    if (insertError) {
      console.error(
        "Cart item insert error:",
        insertError
      );

      return {
        success: false,
        error: "Unable to add product to cart",
      };
    }
  }

  return getCart({
    session_id: sessionId,
  });
}

/* =========================================================
   GET CART
========================================================= */

export function calculateCart(
  cartItems: Array<{ quantity: number; price_at_addition: number; product?: { category?: string } | Array<{ category?: string }> | null }>,
  campaign: { discount_percent: number; active_category: string } | null
) {
  const subtotal = cartItems.reduce(
    (sum, item) => sum + Number(item.price_at_addition) * Number(item.quantity),
    0
  );
  const campaignCategory = campaign?.active_category.trim().toLowerCase();
  const discountPercent = campaign?.discount_percent ?? 0;
  const discountedItems = cartItems.map((item) => {
    const product = Array.isArray(item.product) ? item.product[0] : item.product;
    const matches = campaignCategory && product?.category?.toLowerCase() === campaignCategory;
    const unitPrice = matches
      ? Math.round(Number(item.price_at_addition) * (1 - discountPercent / 100))
      : Number(item.price_at_addition);
    return {
      ...item,
      price_at_addition: unitPrice,
      original_price_at_addition: Number(item.price_at_addition),
      discounted_price: matches ? unitPrice : undefined,
      line_total: unitPrice * Number(item.quantity),
    };
  });
  const discountedSubtotal = discountedItems.reduce((sum, item) => sum + item.line_total, 0);

  return {
    subtotal,
    discount: Math.max(0, subtotal - discountedSubtotal),
    total: discountedSubtotal,
    items: discountedItems,
    campaign: campaign || undefined,
  };
}

export async function getCart(args: ToolArgs) {
  const sessionId = String(args.session_id || "").trim();

  if (!sessionId) {
    return {
      success: false,
      error: "session_id is required",
    };
  }

  const { data: cart, error: cartError } =
    await supabaseAdmin
      .from("carts")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "active")
      .maybeSingle();

  if (cartError) {
    console.error("getCart error:", cartError);

    return {
      success: false,
      error: "Unable to retrieve cart",
    };
  }

  if (!cart) {
    return {
      success: true,
      cart: null,
      items: [],
      total: 0,
      item_count: 0,
      currency: "INR",
    };
  }

  const { data: items, error: itemsError } =
    await supabaseAdmin
      .from("cart_items")
      .select(`
        id,
        quantity,
        price_at_addition,
        product:products (
          id,
          name,
          description,
          category,
          price,
          currency,
          stock,
          attributes,
          use_cases,
          tags
        )
      `)
      .eq("cart_id", cart.id);

  if (itemsError) {
    console.error("Cart items error:", itemsError);

    return {
      success: false,
      error: "Unable to retrieve cart items",
    };
  }

  const cartItems = items || [];
  const campaign = await getActiveCampaign();
  const totals = calculateCart(cartItems, campaign);

  const itemCount = cartItems.reduce(
    (sum, item: any) =>
      sum + Number(item.quantity),
    0
  );

  return {
    success: true,

    cart: {
      id: cart.id,
      session_id: cart.session_id,
      status: cart.status,
    },

    items: totals.items,

    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,

    currency: "INR",

    item_count: itemCount,
    campaign: totals.campaign,
  };
}

/* =========================================================
   GEMINI TOOL DECLARATIONS
========================================================= */

export const toolDeclarations = [
  {
    name: "searchProducts",
    description:
      "Search the merchant's product catalog. Use this when the customer asks for products matching a need, budget, category, feature, or use case.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            "What the customer is looking for.",
        },
        category: {
          type: Type.STRING,
          description:
            "Optional category such as Laptop, Accessory, or Service.",
        },
              max_price: {
          type: Type.NUMBER,
          description:
            "Optional maximum price in INR.",
        },
        processor: {
          type: Type.STRING,
          description:
            "Optional exact processor filter, e.g. 'i5', 'i3', 'Ryzen 5'. Use this whenever the customer specifies a chip requirement — do not rely on the free-text query for this.",
        },
                processor_min: {
          type: Type.STRING,
          description:
            "Use this instead of 'processor' when the customer asks for a MINIMUM tier — e.g. 'i5 or better', 'at least Ryzen 5', 'minimum i5'. Pass the tier they named (e.g. 'i5'); this returns that tier AND anything stronger (i7, i9, Ryzen 7, etc).",
        },
      },
      required: ["query"],
    },
  },


  {
    name: "getProduct",
    description:
      "Get complete details about a specific product.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_id: {
          type: Type.STRING,
          description:
            "The UUID of the product.",
        },
      },
      required: ["product_id"],
    },
  },

  {
    name: "compareProducts",
    description:
      "Use this whenever the user asks to compare two or more products, or when recommending between multiple similar options.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "An array of 2 to 4 product UUIDs to compare.",
        },
      },
      required: ["product_ids"],
    },
  },

  {
    name: "suggestUpsells",
    description:
      "Find relevant accessories or services that complement a selected product.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_id: {
          type: Type.STRING,
          description:
            "The UUID of the main product.",
        },
      },
      required: ["product_id"],
    },
  },

  {
    name: "addToCart",
    description:
      "Add a product to the customer's cart. Only use this after explicit customer approval.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: {
          type: Type.STRING,
          description:
            "The customer's shopping session ID.",
        },
        product_id: {
          type: Type.STRING,
          description:
            "The UUID of the product.",
        },
        quantity: {
          type: Type.NUMBER,
          description:
            "Quantity between 1 and 10.",
        },
      },
      required: [
        "session_id",
        "product_id",
        "quantity",
      ],
    },
  },

  {
    name: "getCart",
    description:
      "Retrieve the customer's active cart and exact total.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: {
          type: Type.STRING,
          description:
            "The customer's shopping session ID.",
        },
      },
      required: ["session_id"],
    },
  },
];

/* =========================================================
   GROQ TOOL DECLARATIONS
========================================================= */

export const groqToolDeclarations = [
  {
    type: "function" as const,
    function: {
      name: "searchProducts",
      description:
        "Search the merchant's product catalog. Use this when the customer asks for products matching a need, budget, category, feature, or use case.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "What the customer is looking for.",
          },
          category: {
            type: "string",
            description:
              "Optional category such as Laptop, Accessory, or Service.",
          },
                  max_price: {
            type: "number",
            description:
              "Optional maximum price in INR.",
          },
          processor: {
            type: "string",
            description:
              "Optional exact processor filter, e.g. 'i5', 'i3', 'Ryzen 5'. Use this whenever the customer specifies a chip requirement — do not rely on the free-text query for this.",
          },
                  processor_min: {
          type: Type.STRING,
          description:
            "Use this instead of 'processor' when the customer asks for a MINIMUM tier — e.g. 'i5 or better', 'at least Ryzen 5', 'minimum i5'. Pass the tier they named (e.g. 'i5'); this returns that tier AND anything stronger (i7, i9, Ryzen 7, etc).",
        },
        },
        required: ["query"],
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "getProduct",
      description:
        "Get complete details about a specific product.",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description:
              "The UUID of the product.",
          },
        },
        required: ["product_id"],
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "compareProducts",
      description:
        "Use this whenever the user asks to compare two or more products, or when recommending between multiple similar options.",
      parameters: {
        type: "object",
        properties: {
          product_ids: {
            type: "array",
            items: { type: "string" },
            description: "An array of 2 to 4 product UUIDs to compare.",
          },
        },
        required: ["product_ids"],
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "suggestUpsells",
      description:
        "Find relevant accessories or services that complement a selected product.",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description:
              "The UUID of the main product.",
          },
        },
        required: ["product_id"],
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "addToCart",
      description:
        "Add a product to the customer's cart. Only use this after explicit customer approval.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description:
              "The customer's shopping session ID.",
          },
          product_id: {
            type: "string",
            description:
              "The UUID of the product.",
          },
          quantity: {
            type: "number",
            description:
              "Quantity between 1 and 10.",
          },
        },
        required: [
          "session_id",
          "product_id",
          "quantity",
        ],
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "getCart",
      description:
        "Retrieve the customer's active cart and exact total.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description:
              "The customer's shopping session ID.",
          },
        },
        required: ["session_id"],
      },
    },
  },
];

/* =========================================================
   TOOL IMPLEMENTATIONS
========================================================= */

export const toolImplementations: Record<
  string,
  (args: ToolArgs) => Promise<any>
> = {
  searchProducts,
  getProduct,
  compareProducts,
  suggestUpsells,
  addToCart,
  getCart,
};