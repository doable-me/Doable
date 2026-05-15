import { MapPin, Search, List, Navigation, Globe, User, Utensils } from "lucide-react";

const mainFeatures = [
  "Search for restaurants by price, destination, restaurant type, and specific dish",
  "Free-text search through restaurant name, description, address, type, or menu",
  "View search results in list view or map view",
  "Navigate to restaurants using GPS navigation",
  "View detailed restaurant information including name, address, phone, email, type, price, description, and menu",
  "Manage restaurant information via web portal",
  "User registration and login with profile management",
  "Filter and sort search results",
  "Multi-language support: Swedish, English, Spanish, and French"
];

const restaurantEntity = {
  entity: "Restaurant",
  fields: {
    restaurant_name: "string",
    address: "string",
    phone_number: "string",
    email_address: "string",
    type_of_food: "string",
    average_price: "number",
    restaurant_description: "string",
    menu: [
      {
        dish_name: "string",
        dish_description: "string",
        dish_price: "number"
      }
    ]
  }
};

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Utensils className="w-10 h-10 text-orange-600" />
            <h1 className="text-4xl font-bold text-gray-900">Amazing Lunch Indicator</h1>
          </div>
          <p className="text-gray-600 text-lg">GPS-based Restaurant Discovery Application</p>
        </header>

        {/* Main Features Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
          <div className="bg-orange-600 px-6 py-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Search className="w-5 h-5" />
              Main Features
            </h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4 italic">
              From Section 2.2 — Product Functions
            </p>
            <ul className="space-y-3">
              {mainFeatures.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Data Entity Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-amber-600 px-6 py-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Data Entity: Restaurant
            </h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4">
              Key entity from SRS (sections 2 & 3) — represents restaurant data stored in the database
            </p>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-sm overflow-x-auto">
{JSON.stringify(restaurantEntity, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center mt-8 text-gray-500 text-sm">
          <p>Based on SRS Document — Group 2, 2010</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
