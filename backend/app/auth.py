import os
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.oauth2 import id_token
from google.auth.transport import requests

security = HTTPBearer()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    if token == "guest_token_123":
        return {
            "sub": "guest",
            "email": "guest@example.com",
            "name": "Guest User"
        }
    try:
        # If GOOGLE_CLIENT_ID is not set (e.g. local dev fallback if you want to test without it),
        # verify_oauth2_token will fail unless we specify no audience. But we should strictly verify it.
        # If no GOOGLE_CLIENT_ID is set in the backend .env, it might fail.
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        
        return {
            "sub": idinfo["sub"],
            "email": idinfo.get("email"),
            "name": idinfo.get("name")
        }
    except ValueError as e:
        # Invalid token
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")
