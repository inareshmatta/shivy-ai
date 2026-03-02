import os
from google import genai

_client = None

def get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            _client = genai.Client(api_key=api_key)
        else:
            # Uses GOOGLE_APPLICATION_CREDENTIALS / ADC for Cloud Run
            _client = genai.Client()
    return _client
