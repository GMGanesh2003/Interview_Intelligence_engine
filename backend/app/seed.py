"""
Module 8: Benchmark Engine - seed data.

In a real product these numbers would be aggregated from actual placed
candidates. For this MVP we seed reasonable industry-rule-of-thumb targets
per role family so the Benchmark Engine has something concrete to compare
against out of the box. Feel free to edit/add rows directly in the DB.
"""
from app.database import SessionLocal, engine, Base
from app.models import BenchmarkProfile

DEFAULT_PROFILES = [
    dict(role="software engineer", avg_eye_contact=0.82, avg_speaking_speed=145.0,
         avg_filler_rate_per_min=0.8, avg_technical_score=82.0, avg_communication_score=80.0, avg_energy_score=0.62),
    dict(role="data analyst", avg_eye_contact=0.80, avg_speaking_speed=140.0,
         avg_filler_rate_per_min=1.0, avg_technical_score=80.0, avg_communication_score=82.0, avg_energy_score=0.60),
    dict(role="product manager", avg_eye_contact=0.85, avg_speaking_speed=150.0,
         avg_filler_rate_per_min=0.7, avg_technical_score=75.0, avg_communication_score=88.0, avg_energy_score=0.68),
    dict(role="general", avg_eye_contact=0.80, avg_speaking_speed=140.0,
         avg_filler_rate_per_min=1.0, avg_technical_score=78.0, avg_communication_score=80.0, avg_energy_score=0.62),
]


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(BenchmarkProfile).count() == 0:
            for p in DEFAULT_PROFILES:
                db.add(BenchmarkProfile(**p))
            db.commit()
            print(f"Seeded {len(DEFAULT_PROFILES)} benchmark profiles.")
        else:
            print("Benchmark profiles already exist, skipping seed.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
