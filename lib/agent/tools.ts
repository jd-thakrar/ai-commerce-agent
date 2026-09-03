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

function productSearchText(product: Product): string {
  return [
    product.name,
    product.description,
    product.category,
    ...(product.tags || []),
    ...(product.use_cases || []),
    JSON.stringify(product.attributes || {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/* =========================================================
   SEARCH PRODUCTS
========================================================= */

export async function searchProducts(args: ToolArgs) {
  const queryText = normalize(args.query);

  const category = args.category
    ? normalize(args.category)
    : "";

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

  if (!queryText) {
    return {
      success: true,
      count: products.length,
      products: products.slice(0, 6),
    };
  }

  const words = queryText
    .split(/\s+/)
    .filter((word: string) => word.length > 1);

  const ranked = products
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
    product: data as Product,
  };
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

  const total = cartItems.reduce(
    (sum, item: any) =>
      sum +
      Number(item.price_at_addition) *
        Number(item.quantity),
    0
  );

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

    items: cartItems,

    total,

    currency: "INR",

    item_count: itemCount,
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
  suggestUpsells,
  addToCart,
  getCart,
};