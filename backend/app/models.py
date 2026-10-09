from datetime import UTC, date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, Embedding

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
    backup_codes: Mapped[list] = mapped_column(JSON, default=list)  # legacy (2FA removed; Firebase handles sign-in)
    firebase_uid: Mapped[str | None] = mapped_column(String(128), unique=True, index=True, nullable=True)
    auth_provider: Mapped[str | None] = mapped_column(String(40), nullable=True)  # google.com / password / local / demo
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
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
    blood_group: Mapped[str | None] = mapped_column(String(4), nullable=True)
    allergies: Mapped[list] = mapped_column(JSON, default=list)
    emergency_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    emergency_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    abha_number: Mapped[str | None] = mapped_column(String(17), nullable=True)  # 14 digits, shown as 12-3456-7890-1234
    abha_address: Mapped[str | None] = mapped_column(String(80), nullable=True)  # name@abdm
    abha_linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    profile_incomplete: Mapped[bool] = mapped_column(Boolean, default=False)  # made by Google sign-in; sex/DOB not confirmed yet
    rag_signature: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="profiles")
    reports: Mapped[list["Report"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    results: Mapped[list["LabResult"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    medications: Mapped[list["Medication"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    symptoms: Mapped[list["Symptom"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    shares: Mapped[list["ShareLink"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    vitals: Mapped[list["VitalReading"]] = relationship(cascade="all, delete-orphan")
    checkups: Mapped[list["Checkup"]] = relationship(cascade="all, delete-orphan")
    reminders: Mapped[list["Reminder"]] = relationship(cascade="all, delete-orphan")
    devices: Mapped[list["Device"]] = relationship(cascade="all, delete-orphan")
    meals: Mapped[list["MealLog"]] = relationship(cascade="all, delete-orphan")
    wounds: Mapped[list["WoundScan"]] = relationship(cascade="all, delete-orphan")
    chunks: Mapped[list["Chunk"]] = relationship(cascade="all, delete-orphan")
    diagnoses: Mapped[list["Diagnosis"]] = relationship(cascade="all, delete-orphan")


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
    pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # what our own reader saw (audit / re-parse)
    user_verified: Mapped[bool] = mapped_column(Boolean, default=False)  # corrected by the person after confirming
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profile: Mapped[Profile] = relationship(back_populates="reports")
    results: Mapped[list["LabResult"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    medications: Mapped[list["Medication"]] = relationship(back_populates="report")
    diagnoses: Mapped[list["Diagnosis"]] = relationship(cascade="all, delete-orphan")


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
    user_verified: Mapped[bool] = mapped_column(Boolean, default=False)

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
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

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
    subject_user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)  # whose data was touched (family access)
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
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual / csv / device_demo / demo
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Diagnosis(Base):
    """A diagnosis read from a discharge summary / prescription (or added by hand), coded ICD-10 + SNOMED CT."""

    __tablename__ = "diagnoses"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[int | None] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    name_raw: Mapped[str | None] = mapped_column(String(160), nullable=True)
    key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    icd10: Mapped[str | None] = mapped_column(String(12), nullable=True)
    snomed: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="active")  # active / history
    diagnosed_on: Mapped[_date | None] = mapped_column(Date, nullable=True)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class StoredFile(Base):
    """Encrypted file bytes kept in the database when no object storage is configured (survives restarts)."""

    __tablename__ = "stored_files"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AppSetting(Base):
    """Server secrets generated once and kept in the database (so they survive container restarts)."""

    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class FamilyLink(Base):
    """Consent-based access between two accounts. Requesting NEVER grants access; only the owner approves."""

    __tablename__ = "family_links"
    id: Mapped[int] = mapped_column(primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    owner_email: Mapped[str] = mapped_column(String(255), index=True)  # an invite binds when that person signs up
    owner_profile_id: Mapped[int | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    relation: Mapped[str] = mapped_column(String(40), default="family")
    message: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)  # pending / approved / denied / revoked
    requested_permissions: Mapped[dict] = mapped_column(JSON, default=dict)
    permissions: Mapped[dict] = mapped_column(JSON, default=dict)  # granted by the owner only
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Checkup(Base):
    __tablename__ = "checkups"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(20), default="lab")  # lab / doctor / screening / dental / eye / vaccine
    due_date: Mapped[_date | None] = mapped_column(Date, nullable=True)
    done_date: Mapped[_date | None] = mapped_column(Date, nullable=True)
    repeat_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(160), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Reminder(Base):
    __tablename__ = "reminders"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="medicine")  # medicine / checkup / reading / water / custom
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str | None] = mapped_column(String(300), nullable=True)
    times: Mapped[list] = mapped_column(JSON, default=list)  # ["08:00", "20:00"]
    days: Mapped[list] = mapped_column(JSON, default=list)  # 0=Mon..6=Sun; empty = every day
    start_date: Mapped[_date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[_date | None] = mapped_column(Date, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    medication_id: Mapped[int | None] = mapped_column(ForeignKey("medications.id", ondelete="SET NULL"), nullable=True)
    done_log: Mapped[list] = mapped_column(JSON, default=list)  # ["2026-10-09 08:00", ...] slots marked done (last 60)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Chunk(Base):
    """Retrieval index for grounded chat: one short text per fact, with our own 1024-d embedding."""

    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(20))  # result / report / medicine / vital / insight / symptom / checkup
    source_id: Mapped[str] = mapped_column(String(40))  # citation id, e.g. R12, M3, I:fib4, V:bp
    section: Mapped[str] = mapped_column(String(20), default="records")  # permission needed to see it (family access)
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(Embedding())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # bp_monitor / glucometer / fitness_band / smart_scale
    name: Mapped[str] = mapped_column(String(80))
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)  # every device is simulated in this build


class MealLog(Base):
    __tablename__ = "meal_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    eaten_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    meal_type: Mapped[str] = mapped_column(String(12), default="meal")  # breakfast / lunch / dinner / snack
    items: Mapped[list] = mapped_column(JSON, default=list)  # [{key, name, servings, kcal, carbs_g, ...}]
    totals: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(12), default="manual")  # manual / text / photo
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class WoundScan(Base):
    __tablename__ = "wound_scans"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(80), default="wound")  # body site, e.g. "left foot"
    stored_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    mime: Mapped[str | None] = mapped_column(String(40), nullable=True)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
