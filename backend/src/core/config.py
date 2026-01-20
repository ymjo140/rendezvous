import os
from dotenv import load_dotenv

# Load .env
load_dotenv()


class Settings:
    PROJECT_NAME: str = "WeMeet API"
    VERSION: str = "2.0.0"

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    if not SECRET_KEY:
        raise ValueError("SECRET_KEY is missing!")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./wemeet.db")
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    # API keys
    NAVER_SEARCH_ID: str = os.getenv("NAVER_SEARCH_ID")
    NAVER_SEARCH_SECRET: str = os.getenv("NAVER_SEARCH_SECRET")
    NAVER_MAP_ID: str = os.getenv("NAVER_MAP_ID")
    NAVER_MAP_SECRET: str = os.getenv("NAVER_MAP_SECRET")
    ODSAY_API_KEY: str = os.getenv("ODSAY_API_KEY")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY")
    KAKAO_REST_API_KEY: str = os.getenv("KAKAO_REST_API_KEY")
    KAKAO_REDIRECT_URI: str = os.getenv("KAKAO_REDIRECT_URI")

    # Purpose config shared with frontend (single source of truth)
    PURPOSE_CONFIG = {
        "meal": {
            "label": "Meal",
            "mainCategory": "RESTAURANT",
            "tabs": {
                "MENU": {
                    "label": "Menu",
                    "options": [
                        "Korean",
                        "Western",
                        "Japanese",
                        "Chinese",
                        "BBQ",
                        "Seafood",
                        "Chicken",
                        "Pizza",
                        "Street Food",
                        "Asian",
                    ],
                },
                "VIBE": {
                    "label": "Vibe",
                    "options": [
                        "Value",
                        "Quiet",
                        "View",
                        "Family",
                        "Group",
                        "Casual",
                    ],
                },
            },
        },
        "drink": {
            "label": "Drinks",
            "mainCategory": "PUB",
            "tabs": {
                "TYPE": {
                    "label": "Type",
                    "options": ["Soju", "Beer", "Wine", "Highball", "Cocktail", "Makgeolli"],
                },
                "VIBE": {
                    "label": "Vibe",
                    "options": ["Lively", "Quiet", "Rooftop", "Izakaya", "Pub", "Music"],
                },
            },
        },
        "cafe": {
            "label": "Cafe",
            "mainCategory": "CAFE",
            "tabs": {
                "TYPE": {
                    "label": "Type",
                    "options": ["Dessert", "Brunch", "Bakery", "Coffee", "Tea"],
                },
                "VIBE": {
                    "label": "Vibe",
                    "options": ["Cozy", "Quiet", "View", "Study", "Rooftop", "Pet-friendly"],
                },
            },
        },
        "study": {
            "label": "Study",
            "mainCategory": "WORKSPACE",
            "tabs": {
                "TYPE": {
                    "label": "Type",
                    "options": ["Study Cafe", "Library", "Coworking", "Private Room"],
                },
                "VIBE": {
                    "label": "Vibe",
                    "options": ["Quiet", "Focus", "Calm", "Minimal"],
                },
            },
        },
    }

    TAG_KEYWORD_EXPANSIONS = {
        "Korean": ["Korean", "K-BBQ", "Bibimbap", "Bulgogi", "Galbi"],
        "Western": ["Western", "Steak", "Pasta", "Italian", "French"],
        "Japanese": ["Japanese", "Sushi", "Ramen", "Izakaya", "Omakase"],
        "Chinese": ["Chinese", "Jjajangmyeon", "Jjamppong", "Dim Sum"],
        "Value": ["Value", "Affordable", "Budget"],
        "Vibe": ["Vibe", "Mood", "Atmosphere", "Cozy", "Stylish"],
        "Quiet": ["Quiet", "Calm", "Silent", "Private"],
        "Parking": ["Parking", "Valet"],
    }


settings = Settings()
