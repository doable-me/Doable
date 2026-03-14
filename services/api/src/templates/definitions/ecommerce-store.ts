import type { TemplateDefinition } from "../registry.js";
import { blankTemplate } from "./blank.js";

export const ecommerceStoreTemplate: TemplateDefinition = {
  id: "ecommerce-store",
  name: "E-commerce Store",
  description:
    "Product grid with shopping cart, product detail modal, and checkout flow. Built with React state management.",
  category: "ecommerce",
  previewImageUrl: null,
  isOfficial: true,

  codeFiles: {
    "package.json": blankTemplate.codeFiles["package.json"]!,
    "vite.config.ts": blankTemplate.codeFiles["vite.config.ts"]!,
    "tsconfig.json": blankTemplate.codeFiles["tsconfig.json"]!,
    "tailwind.config.ts": blankTemplate.codeFiles["tailwind.config.ts"]!,
    "postcss.config.js": blankTemplate.codeFiles["postcss.config.js"]!,
    "index.html": blankTemplate.codeFiles["index.html"]!,
    "src/main.tsx": blankTemplate.codeFiles["src/main.tsx"]!,
    "src/index.css": blankTemplate.codeFiles["src/index.css"]!,
    "src/lib/utils.ts": blankTemplate.codeFiles["src/lib/utils.ts"]!,

    "src/App.tsx": `import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { ProductGrid } from "@/components/product-grid";
import { Cart } from "@/components/cart";
import { Checkout } from "@/components/checkout";
import type { CartItem, Product } from "@/types";

const PRODUCTS: Product[] = [
  { id: "1", name: "Classic White T-Shirt", price: 29.99, image: "", category: "Clothing", description: "Premium cotton crew-neck tee. Comfortable fit for everyday wear.", rating: 4.5, reviews: 128 },
  { id: "2", name: "Wireless Headphones", price: 89.99, image: "", category: "Electronics", description: "Active noise cancellation with 30-hour battery life.", rating: 4.8, reviews: 256 },
  { id: "3", name: "Leather Wallet", price: 49.99, image: "", category: "Accessories", description: "Genuine leather bifold with RFID blocking technology.", rating: 4.3, reviews: 89 },
  { id: "4", name: "Running Shoes", price: 119.99, image: "", category: "Footwear", description: "Lightweight mesh upper with responsive cushioning.", rating: 4.7, reviews: 312 },
  { id: "5", name: "Ceramic Mug Set", price: 34.99, image: "", category: "Home", description: "Set of 4 handcrafted mugs in earthy tones.", rating: 4.6, reviews: 67 },
  { id: "6", name: "Backpack", price: 79.99, image: "", category: "Accessories", description: "Water-resistant with padded laptop compartment.", rating: 4.4, reviews: 198 },
];

export const App = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId ? { ...item, quantity } : item
        )
      );
    }
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        cartCount={cartCount}
        onCartClick={() => setCartOpen(true)}
      />
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Our Products</h1>
          <p className="text-muted-foreground mt-1">
            Discover our curated collection of premium goods.
          </p>
        </div>
        <ProductGrid products={PRODUCTS} onAddToCart={addToCart} />
      </main>

      {cartOpen && (
        <Cart
          items={cart}
          total={cartTotal}
          onUpdateQuantity={updateQuantity}
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            setCartOpen(false);
            setCheckoutOpen(true);
          }}
        />
      )}

      {checkoutOpen && (
        <Checkout
          items={cart}
          total={cartTotal}
          onClose={() => setCheckoutOpen(false)}
          onComplete={() => {
            setCart([]);
            setCheckoutOpen(false);
          }}
        />
      )}
    </div>
  );
};
`,

    "src/types.ts": `export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
  description: string;
  rating: number;
  reviews: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
`,

    "src/components/navbar.tsx": `import { ShoppingCart } from "lucide-react";

interface NavbarProps {
  cartCount: number;
  onCartClick: () => void;
}

export const Navbar = ({ cartCount, onCartClick }: NavbarProps) => (
  <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
    <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
      <span className="text-xl font-bold">Store</span>
      <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
        <a href="#" className="hover:text-foreground transition-colors">New Arrivals</a>
        <a href="#" className="hover:text-foreground transition-colors">Categories</a>
        <a href="#" className="hover:text-foreground transition-colors">Sale</a>
      </nav>
      <button
        onClick={onCartClick}
        className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted transition-colors"
      >
        <ShoppingCart className="h-5 w-5" />
        {cartCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {cartCount}
          </span>
        )}
      </button>
    </div>
  </header>
);
`,

    "src/components/product-grid.tsx": `import { Star, ShoppingCart } from "lucide-react";
import type { Product } from "@/types";

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

export const ProductGrid = ({ products, onAddToCart }: ProductGridProps) => (
  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    {products.map((product) => (
      <div
        key={product.id}
        className="group rounded-lg border bg-card overflow-hidden transition-shadow hover:shadow-md"
      >
        <div className="relative h-48 bg-muted flex items-center justify-center">
          <span className="text-4xl text-muted-foreground/30">
            {product.category.charAt(0)}
          </span>
          <span className="absolute top-2 left-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
            {product.category}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{product.name}</h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {product.description}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-medium">{product.rating}</span>
            <span className="text-xs text-muted-foreground">
              ({product.reviews})
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-lg font-bold">\${product.price.toFixed(2)}</span>
            <button
              onClick={() => onAddToCart(product)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    ))}
  </div>
);
`,

    "src/components/cart.tsx": `import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import type { CartItem } from "@/types";

interface CartProps {
  items: CartItem[];
  total: number;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onClose: () => void;
  onCheckout: () => void;
}

export const Cart = ({
  items,
  total,
  onUpdateQuantity,
  onClose,
  onCheckout,
}: CartProps) => (
  <>
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-background shadow-xl">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-lg font-semibold">Shopping Cart</h2>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <ShoppingBag className="h-12 w-12" />
          <p className="text-sm">Your cart is empty</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto p-6 space-y-4">
            {items.map((item) => (
              <div
                key={item.product.id}
                className="flex items-center gap-4 rounded-lg border p-3"
              >
                <div className="h-16 w-16 shrink-0 rounded-md bg-muted flex items-center justify-center">
                  <span className="text-xl text-muted-foreground/40">
                    {item.product.category.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.product.name}
                  </p>
                  <p className="text-sm font-bold mt-0.5">
                    \${(item.product.price * item.quantity).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      onUpdateQuantity(item.product.id, item.quantity - 1)
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-muted"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-medium">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      onUpdateQuantity(item.product.id, item.quantity + 1)
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t p-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">\${total.toFixed(2)}</span>
            </div>
            <button
              onClick={onCheckout}
              className="flex w-full h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Checkout
            </button>
          </div>
        </>
      )}
    </div>
  </>
);
`,

    "src/components/checkout.tsx": `import { useState } from "react";
import { X, CreditCard, CheckCircle } from "lucide-react";
import type { CartItem } from "@/types";

interface CheckoutProps {
  items: CartItem[];
  total: number;
  onClose: () => void;
  onComplete: () => void;
}

export const Checkout = ({ items, total, onClose, onComplete }: CheckoutProps) => {
  const [step, setStep] = useState<"form" | "success">("form");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("success");
    setTimeout(onComplete, 2000);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed inset-4 z-50 mx-auto max-w-lg rounded-xl bg-background shadow-xl overflow-auto my-auto max-h-[90vh]">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Checkout</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "success" ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <CheckCircle className="h-16 w-16 text-emerald-500" />
            <h3 className="text-xl font-semibold">Order Placed!</h3>
            <p className="text-sm text-muted-foreground">
              Thank you for your purchase.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Order Summary</h3>
              {items.map((item) => (
                <div key={item.product.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.product.name} x{item.quantity}
                  </span>
                  <span className="font-medium">
                    \${(item.product.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                <span>Total</span>
                <span>\${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Shipping Information</h3>
              <input
                type="text"
                placeholder="Full Name"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                type="email"
                placeholder="Email"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                type="text"
                placeholder="Address"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Payment</h3>
              <div className="flex items-center gap-2 rounded-md border p-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="4242 4242 4242 4242"
                  required
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="MM/YY"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  type="text"
                  placeholder="CVC"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex w-full h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Place Order — \${total.toFixed(2)}
            </button>
          </form>
        )}
      </div>
    </>
  );
};
`,
  },

  contextOverrides: {
    "identity.md": `# Project Identity

## Name
E-commerce Store

## Purpose
An online store with product browsing, cart management, and checkout flow. Built for selling physical or digital goods.

## Personality & Tone
- Clean, product-focused design
- Trust-building elements (ratings, reviews)
- Frictionless shopping experience
`,
    "knowledge.md": `# Knowledge Base

## Tech Stack
- Frontend: React 19 + Vite 6 + TypeScript (strict)
- Styling: Tailwind CSS 3
- Icons: Lucide React
- State: React useState for cart management

## Architecture
- \`src/components/\` — UI components (navbar, product grid, cart, checkout)
- \`src/types.ts\` — Shared TypeScript interfaces
- Cart state lifted to App component
- Slide-over cart panel, modal checkout

## Patterns
- Product cards with category badges and star ratings
- Quantity controls in cart with +/- buttons
- Multi-step checkout (form -> success)
- Overlay backdrop for modals and drawers
`,
  },
};
