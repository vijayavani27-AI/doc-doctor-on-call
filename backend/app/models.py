from datetime import UTC, date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

_date = date  # LabResult has a column named `date`


def utcnow():
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    language: Mapped[str] = mapped_column(String(8), default="en")
    totp_secret_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    backup_codes: Mapped[list] = mapped_column(JSON, default=list)  # bcrypt hashes, one-time use
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profiles: Mapped[list["Profile"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Profile(Base):
    """A person whose health is managed (self, parent, child...)."""

    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    relation: Mapped[str] = mapped_column(String(40), default="self")
    sex: Mapped[str] = mapped_column(String(1), default="F")  # F / M
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    conditions: Mapped[list] = mapped_column(JSON, default=list)  # e.g. ["diabetes", "hypertension"]
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[str] = mapped_column(String(16), default="teal")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="profiles")
    reports: Mapped[list["Report"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    results: Mapped[list["LabResult"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    medications: Mapped[list["Medication"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    symptoms: Mapped[list["Symptom"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    shares: Mapped[list["ShareLink"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    vitals: Mapped[list["VitalReading"]] = relationship(cascade="all, delete-orphan")


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # encrypted file in instance/uploads
    mime: Mapped[str | None] = mapped_column(String(80), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="lab")  # lab / prescription
    lab_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    doctor_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    report_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="review")  # review / confirmed
    method: Mapped[str] = mapped_column(String(20), default="manual")  # ai / text-parser / manual / demo
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profile: Mapped[Profile] = relationship(back_populates="reports")
    results: Mapped[list["LabResult"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    medications: Mapped[list["Medication"]] = relationship(back_populates="report")


class LabResult(Base):
    __tablename__ = "lab_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    test_code: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)  # canonical code, e.g. ALT
    test_name_raw: Mapped[str] = mapped_column(String(160))
    value: Mapped[float | None] = mapped_column(Float, nullable=True)  # in canonical unit
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)  # canonical unit
    value_raw: Mapped[str | None] = mapped_column(String(40), nullable=True)
    unit_raw: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ref_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    ref_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    flag: Mapped[str | None] = mapped_column(String(2), nullable=True)  # L / N / H
    date: Mapped[_date | None] = mapped_column(Date, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)

    report: Mapped[Report] = relationship(back_populates="results")
    profile: Mapped[Profile] = relationship(back_populates="results")


class Medication(Base):
    __tablename__ = "medications"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[int | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"), nullable=True)
    brand: Mapped[str] = mapped_column(String(120))
    generic: Mapped[str | None] = mapped_column(String(160), nullable=True)
    drug_class: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dose: Mapped[str | None] = mapped_column(String(60), nullable=True)
    frequency: Mapped[str | None] = mapped_column(String(60), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    reason: Mapped[str | None] = mapped_column(String(160), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    profile: Mapped[Profile] = relationship(back_populates="medications")
    report: Mapped[Report | None] = relationship(back_populates="medications")


class Symptom(Base):
    __tablename__ = "symptoms"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(120))
    onset_date: Mapped[date] = mapped_column(Date)
    severity: Mapped[int] = mapped_column(Integer, default=2)  # 1 mild .. 3 severe
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    profile: Mapped[Profile] = relationship(back_populates="symptoms")


class ShareLink(Base):
    __tablename__ = "share_links"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    views: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profile: Mapped[Profile] = relationship(back_populates="shares")


class AuditLog(Base):
    """Consent / access log: who did what with the data, and when."""

    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ContactMessage(Base):
    """Messages sent from the public Contact page."""

    __tablename__ = "contact_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255))
    topic: Mapped[str] = mapped_column(String(40), default="general")
    message: Mapped[str] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class VitalReading(Base):
    """Wellness data: home BP, sugar, weight, heart rate, SpO2, steps, sleep (manual, CSV or device)."""

    __tablename__ = "vital_readings"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    value: Mapped[float] = mapped_column(Float)
    value2: Mapped[float | None] = mapped_column(Float, nullable=True)  # diastolic for BP
    context: Mapped[str | None] = mapped_column(String(20), nullable=True)  # fasting / after_meal / random
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual / csv / device
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
