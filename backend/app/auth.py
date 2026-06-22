import os
import jwt
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app import models

security = HTTPBearer()

# Shared secret — MUST match NEXTAUTH_SECRET in frontend .env / Vercel env vars
NEXTAUTH_SECRET = os.getenv("NEXTAUTH_SECRET", "super_secret_interview_engine_key_12345")


def _decode_token(token: str) -> dict:
    """
    Decode a JWT minted by our /api/auth/token Next.js endpoint.
    It is signed with HS256 using NEXTAUTH_SECRET.
    """
    try:
        payload = jwt.decode(
            token,
            NEXTAUTH_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> dict:
    token = credentials.credentials

    # ── Guest shortcut ──────────────────────────────────────────────────────
    if token == "guest_token_123":
        user_info = {
            "sub": "guest",
            "email": "guest@example.com",
            "name": "Guest User",
        }
        _upsert_user(db, user_info)
        return user_info

    # ── Decode HS256 JWT minted by /api/auth/token ──────────────────────────
    payload = _decode_token(token)

    sub   = payload.get("sub")
    email = payload.get("email")
    name  = payload.get("name")

    if not sub:
        raise HTTPException(
            status_code=401,
            detail="Token missing 'sub' claim — cannot identify user",
        )

    user_info = {"sub": sub, "email": email, "name": name}
    _upsert_user(db, user_info)
    return user_info


def _upsert_user(db: Session, user_info: dict):
    """Insert user into DB on first login; never raises."""
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
        db.rollback()
