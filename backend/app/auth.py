import os
import jwt
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app import models

security = HTTPBearer()

# Shared secret with NextAuth — must match NEXTAUTH_SECRET in frontend .env
NEXTAUTH_SECRET = os.getenv("NEXTAUTH_SECRET", "super_secret_interview_engine_key_12345")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


def _decode_nextauth_jwt(token: str) -> dict:
    """
    Decode a NextAuth-signed JWT using the shared NEXTAUTH_SECRET.
    NextAuth uses HS256 by default when NEXTAUTH_SECRET is set.
    Falls back to Google id_token verification for tokens that are
    not issued by NextAuth (e.g. direct API calls in dev).
    """
    try:
        payload = jwt.decode(
            token,
            NEXTAUTH_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},  # NextAuth doesn't set aud in JWT tokens
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    except jwt.InvalidTokenError:
        pass  # Not a NextAuth JWT — fall through to Google verification

    # --- Fallback: try Google id_token verification ---
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        idinfo = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID or None
        )
        return {
            "sub": idinfo["sub"],
            "email": idinfo.get("email"),
            "name": idinfo.get("name"),
        }
    except Exception:
        pass

    raise HTTPException(status_code=401, detail="Invalid or expired authentication token")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> dict:
    token = credentials.credentials

    # Guest shortcut
    if token == "guest_token_123":
        user_info = {
            "sub": "guest",
            "email": "guest@example.com",
            "name": "Guest User",
        }
        _upsert_user(db, user_info)
        return user_info

    payload = _decode_nextauth_jwt(token)

    # NextAuth JWT structure: token contains sub, email, name directly
    # or nested under a "user" key depending on the callback config
    sub   = payload.get("sub") or payload.get("id")
    email = payload.get("email")
    name  = payload.get("name")

    # Some NextAuth versions nest user info differently
    if not sub:
        raise HTTPException(status_code=401, detail="Could not extract user identity from token")

    user_info = {"sub": sub, "email": email, "name": name}
    _upsert_user(db, user_info)
    return user_info


def _upsert_user(db: Session, user_info: dict):
    """Insert user into DB if they don't exist yet."""
    try:
        existing = db.query(models.User).filter(
            models.User.google_sub == user_info["sub"]
        ).first()
        if not existing:
            db.add(models.User(
                google_sub=user_info["sub"],
                email=user_info.get("email"),
                name=user_info.get("name"),
            ))
            db.commit()
    except Exception:
        db.rollback()  # Never let a DB error block the auth flow
