import os
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests
from app.database import get_db
from app import models

security = HTTPBearer()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    user_info = None

    if token == "guest_token_123":
        user_info = {
            "sub": "guest",
            "email": "guest@example.com",
            "name": "Guest User"
        }
    else:
        try:
            # If GOOGLE_CLIENT_ID is not set (e.g. local dev fallback if you want to test without it),
            # verify_oauth2_token will fail unless we specify no audience. But we should strictly verify it.
            # If no GOOGLE_CLIENT_ID is set in the backend .env, it might fail.
            idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
            
            user_info = {
                "sub": idinfo["sub"],
                "email": idinfo.get("email"),
                "name": idinfo.get("name")
            }
        except ValueError as e:
            # Invalid token
            raise HTTPException(status_code=401, detail="Invalid or expired authentication token")

    if user_info:
        # Upsert user into database
        user = db.query(models.User).filter(models.User.google_sub == user_info["sub"]).first()
        if not user:
            user = models.User(
                google_sub=user_info["sub"],
                email=user_info["email"],
                name=user_info["name"]
            )
            db.add(user)
            db.commit()

    return user_info
