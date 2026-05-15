import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { LoginPage } from './components/LoginPage';
import { SearchPage } from './components/SearchPage';
import { ListPage } from './components/ListPage';
import { MapPage } from './components/MapPage';
import { ProfilePage } from './components/ProfilePage';
import { RestaurantDetail } from './components/RestaurantDetail';
import { Restaurant } from './types';

function AppContent() {
  const { isLoggedIn, currentPage, viewMode } = useApp();
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  const handleViewDetails = (restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
  };

  const handleSelectFromMap = (restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
  };

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  const renderMainContent = () => {
    if (currentPage === 'search') {
      return <SearchPage />;
    }
    if (currentPage === 'profile') {
      return <ProfilePage />;
    }
    // For 'list' and 'map' pages, respect the viewMode
    if (viewMode === 'map') {
      return <MapPage onSelectRestaurant={handleSelectFromMap} />;
    }
    return <ListPage onViewDetails={handleViewDetails} />;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      <Header />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {renderMainContent()}
      </main>

      {selectedRestaurant && (
        <RestaurantDetail
          restaurant={selectedRestaurant}
          onClose={() => setSelectedRestaurant(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
