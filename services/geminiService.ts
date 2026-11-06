// Client-side Gemini service calling server API routes

export const generateMenuDescription = async (itemName: string, category: string): Promise<string> => {
  try {
    const response = await fetch('/api/gemini/menu-description', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itemName, category }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      return errData?.fallback || "Freshly prepared with the finest ingredients.";
    }

    const data = await response.json();
    return data.description?.trim() || "A delicious addition to our menu.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Freshly prepared with the finest ingredients.";
  }
};

export const generateWittyGreeting = async (restaurantName: string): Promise<string> => {
  try {
    const response = await fetch('/api/gemini/receipt-greeting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ restaurantName }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      return errData?.fallback || "Thank you for dining with us!";
    }

    const data = await response.json();
    return data.greeting?.trim() || "Thank you for dining with us!";
  } catch (error) {
    console.error("Gemini Greeting Error:", error);
    return "Thank you for dining with us!";
  }
};
