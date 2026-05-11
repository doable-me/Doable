import { useState } from "react";
import { jsPDF } from "jspdf";
import { Plus, Trash2, FileText, Calculator } from "lucide-react";
import { cn } from "./lib/utils";

interface LineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export default function App() {
  const [companyName, setCompanyName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [taxPercent, setTaxPercent] = useState(0);
  const [items, setItems] = useState<LineItem[]>([
    { id: "1", description: "", qty: 1, unitPrice: 0 },
  ]);
  const [invoiceNumber] = useState(() => `INV-${Date.now().toString().slice(-6)}`);

  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), description: "", qty: 1, unitPrice: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: field === "description" ? value : Number(value) } : item
      )
    );
  };

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const taxAmount = subtotal * (taxPercent / 100);
  const total = subtotal + taxAmount;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Header
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", margin, y);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(invoiceNumber, pageWidth - margin, y, { align: "right" });

    y += 15;

    // Company & Customer
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("From:", margin, y);
    doc.text("Bill To:", pageWidth / 2 + 10, y);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(companyName || "—", margin, y);
    doc.text(customerName || "—", pageWidth / 2 + 10, y);

    y += 15;

    // Table Header
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y - 4, pageWidth - margin * 2, 8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("DESCRIPTION", margin + 2, y);
    doc.text("QTY", pageWidth - 80, y, { align: "center" });
    doc.text("UNIT PRICE", pageWidth - 50, y, { align: "center" });
    doc.text("AMOUNT", pageWidth - margin - 2, y, { align: "right" });

    y += 8;
    doc.setFont("helvetica", "normal");

    // Line items
    items.forEach((item) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.text(item.description || "—", margin + 2, y);
      doc.text(item.qty.toString(), pageWidth - 80, y, { align: "center" });
      doc.text(formatCurrency(item.unitPrice), pageWidth - 50, y, { align: "center" });
      doc.text(formatCurrency(item.qty * item.unitPrice), pageWidth - margin - 2, y, { align: "right" });
      y += 8;
    });

    y += 5;

    // Totals
    doc.setDrawColor(200, 200, 200);
    doc.line(pageWidth - 70, y, pageWidth - margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.text("Subtotal:", pageWidth - 70, y);
    doc.text(formatCurrency(subtotal), pageWidth - margin - 2, y, { align: "right" });

    y += 6;
    doc.text(`Tax (${taxPercent}%):`, pageWidth - 70, y);
    doc.text(formatCurrency(taxAmount), pageWidth - margin - 2, y, { align: "right" });

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Total:", pageWidth - 70, y);
    doc.text(formatCurrency(total), pageWidth - margin - 2, y, { align: "right" });

    doc.save(`${invoiceNumber}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <FileText className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-slate-900">Invoice Generator</h1>
          </div>
          <p className="text-slate-500">Create professional invoices in seconds</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Party Details */}
          <div className="p-6 border-b border-slate-100">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Your Company</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corporation"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-500" />
                Items
              </h2>
              <button
                onClick={addItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              {/* Header Row */}
              <div className="grid grid-cols-12 gap-3 text-xs font-medium text-slate-500 uppercase tracking-wide px-1">
                <div className="col-span-5">Description</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-3">Unit Price</div>
                <div className="col-span-2 text-right">Total</div>
              </div>

              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-3 items-center bg-slate-50 rounded-lg p-3"
                >
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(item.id, "description", e.target.value)}
                      placeholder={`Item ${index + 1}`}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(e) => updateItem(item.id, "qty", e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                    />
                  </div>
                  <div className="col-span-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, "unitPrice", e.target.value)}
                        className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                      />
                    </div>
                  </div>
                  <div className="col-span-1 text-right font-medium text-slate-700 text-sm">
                    {formatCurrency(item.qty * item.unitPrice)}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={items.length === 1}
                      className={cn(
                        "p-2 rounded-md transition",
                        items.length === 1
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tax & Total */}
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-700">Tax Rate:</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(Number(e.target.value))}
                    className="w-20 px-3 py-2 pr-7 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm text-center"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                </div>
              </div>

              <div className="text-right space-y-1">
                <div className="text-sm text-slate-500">
                  Subtotal: <span className="font-medium text-slate-700">{formatCurrency(subtotal)}</span>
                </div>
                <div className="text-sm text-slate-500">
                  Tax ({taxPercent}%): <span className="font-medium text-slate-700">{formatCurrency(taxAmount)}</span>
                </div>
                <div className="text-xl font-bold text-slate-900">
                  Total: {formatCurrency(total)}
                </div>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="px-6 pb-6">
            <button
              onClick={generatePDF}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <FileText className="w-5 h-5" />
              Generate PDF
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-sm">
          Invoice #{invoiceNumber} • Generated with Invoice Generator
        </p>
      </div>
    </div>
  );
}