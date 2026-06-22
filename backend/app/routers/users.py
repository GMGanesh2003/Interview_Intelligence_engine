from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("", response_model=List[schemas.UserOut])
def get_users(db: Session = Depends(get_db)):
    """List all registered users."""
    return db.query(models.User).order_by(models.User.created_at.desc()).all()
