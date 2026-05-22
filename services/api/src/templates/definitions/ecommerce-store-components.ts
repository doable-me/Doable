/**
 * E-commerce store template — large component code file strings.
 */

export const ecommerceComponents: Record<string, string> = {
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
};
