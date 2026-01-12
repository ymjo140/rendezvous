const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://wemeet-backend-xqlo.onrender.com";

export const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    const headers = {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        // Handle unauthorized (redirect to login or clear token)
        // window.location.href = "/login"; // Optional: uncomment if login page exists
        console.warn("Unauthorized access");
    }

    return response;
};
