export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");

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

    // 토큰이 있는데 401 = 만료/위조 → 토큰 정리 + 세션만료 알림(앱이 로그인으로 유도).
    // 토큰이 없던 401(게스트)은 각 호출부의 graceful 폴백에 맡김(리다이렉트 안 함).
    if (response.status === 401 && token) {
        try {
            localStorage.removeItem("token");
        } catch {
            /* ignore */
        }
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("auth:expired"));
        }
    }

    return response;
};

export const fetchJson = async <T>(endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
};

export const fetchWithAuthJson = async <T>(endpoint: string, options: RequestInit = {}) => {
    const response = await fetchWithAuth(endpoint, options);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
};
